import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Document, Packer, Paragraph } from "docx";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath:
    "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const c = await browser.newContext({ viewport: { width: 1366, height: 1050 } });
const p = await c.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
let count = 0;
const pass = (m) => {
  console.log("PASS", m);
  count++;
};
await fs.mkdir("artifacts/intake-fixtures", { recursive: true });
const text =
  "姓名：测试同学\n电话：13812345678\n邮箱：fixture@example.invalid\n教育经历\n测试大学 计算机科学 本科 2022-2026\n专业技能\nTypeScript、Vue、SQL\n项目经历\n测试项目：修复边界条件，未编造指标\n荣誉与证书\n校级奖学金\n未识别补充：完整保留此句";
const fixture = await Packer.toBuffer(
  new Document({
    sections: [{ children: text.split("\n").map((s) => new Paragraph(s)) }],
  }),
);
await fs.writeFile("artifacts/intake-fixtures/resume.docx", fixture);
const f = await c.newPage();
await f.setContent(
  '<html><meta charset=utf-8><body style="background:white;color:black;font:24px sans-serif;padding:36px;line-height:1.8"><pre style="font-family:sans-serif;white-space:pre-wrap">' +
    text +
    "</pre></body></html>",
);
await f.pdf({ path: "artifacts/intake-fixtures/resume.pdf", format: "A4" });
await f.screenshot({
  path: "artifacts/intake-fixtures/resume.png",
  fullPage: true,
});
await f.pdf({
  path: "artifacts/intake-fixtures/too-many.pdf",
  width: "300px",
  height: "120px",
});
const png = await fs.readFile("artifacts/intake-fixtures/resume.png");
await f.setContent(
  '<html><body style="margin:0"><img style="width:100%" src="data:image/png;base64,' +
    png.toString("base64") +
    '"></body></html>',
);
await f.pdf({ path: "artifacts/intake-fixtures/scanned.pdf", format: "A4" });
await f.close();
const upload = async (path) => {
  await p.getByLabel("选择简历文件", { exact: true }).setInputFiles(path);
  await p.getByRole("button", { name: "上传并识别", exact: true }).click();
  await p.getByLabel("识别原文", { exact: true }).waitFor({ timeout: 80000 });
};
try {
  await p.goto(base);
  const orbit = p.locator(".orbit-trigger");
  const a = await orbit.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await p.mouse.down();
  await p.mouse.move(a.x + 230, a.y - 180, { steps: 12 });
  await p.mouse.up();
  assert.equal(await p.locator(".orbit-overlay").count(), 0);
  const saved = await p.evaluate(() =>
    localStorage.getItem("zhuguang-orbit-position"),
  );
  assert.ok(saved);
  await p.reload();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("zhuguang-orbit-position")),
    saved,
  );
  const b = await orbit.boundingBox();
  assert.ok(b.x > a.x + 100);
  await orbit.focus();
  await orbit.press("Enter");
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  await orbit.press("Alt+Home");
  pass(
    "drag persists position without opening map and keyboard activation/reset work",
  );
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p
    .getByLabel("邮箱", { exact: true })
    .fill("browser-" + Date.now() + "@example.invalid");
  await p.getByLabel("密码（10—128位）").fill("Synthetic-Only-123!");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await p.getByRole("button", { name: /填写个人信息/ }).click();
  await p.getByRole("heading", { name: "上传已有简历（可选）" }).waitFor();
  await upload("artifacts/intake-fixtures/resume.docx");
  assert.match(await p.getByLabel("识别原文").inputValue(), /测试大学/);
  assert.equal(await p.getByLabel("姓名", { exact: true }).inputValue(), "");
  assert.equal(
    await p.locator(".import-candidate input[type=checkbox]:checked").count(),
    0,
  );
  pass("real DOCX extracts text but does not automatically modify profile");
  await p.getByLabel("导入姓名", { exact: true }).check();
  await p.getByLabel("导入教育经历", { exact: true }).check();
  await p.getByRole("button", { name: "将勾选字段写入草稿" }).click();
  assert.equal(
    await p.getByLabel("姓名", { exact: true }).inputValue(),
    "测试同学",
  );
  assert.equal(
    await p.getByLabel("联系邮箱", { exact: true }).inputValue(),
    "",
  );
  const untouched = await (await c.request.get(base + "/api/profile")).json();
  assert.equal(untouched.profile, null);
  pass(
    "only explicitly selected fields enter local draft with original untouched until save",
  );
  await p.getByRole("button", { name: "保存个人信息", exact: true }).click();
  await p.getByText("已保存到你的账号，刷新或再次登录后可继续编辑").waitFor();
  await p.getByLabel("识别原文").fill(text + "\n个人简介\n逐字核对的新内容");
  assert.equal(
    await p.getByRole("button", { name: "确认并创建简历版本" }).isDisabled(),
    true,
  );
  await p.getByRole("button", { name: "原文已改变，请重新归类" }).click();
  await p.getByRole("button", { name: "确认并创建简历版本" }).click();
  await p.getByText(/已创建独立简历版本/).waitFor();
  const resumes = (await (await c.request.get(base + "/api/resumes")).json())
    .resumes;
  assert.equal(resumes.length, 1);
  const detail = await (
    await c.request.get(base + "/api/resumes/" + resumes[0].id)
  ).json();
  assert.match(detail.resume.body.text, /逐字核对的新内容/);
  pass(
    "edited source must be regrouped before creating a distinct persisted resume",
  );
  await p.screenshot({ path: "artifacts/batch3-intake.png", fullPage: true });
  await p.getByRole("button", { name: "清除识别结果" }).click();
  await upload("artifacts/intake-fixtures/resume.pdf");
  assert.match(await p.getByLabel("识别原文").inputValue(), /测试大学/);
  await p.getByText("第1页 / PDF文字层", { exact: true }).waitFor();
  pass("real PDF text layer extracted with page provenance");
  await p.getByRole("button", { name: "清除识别结果" }).click();
  await upload("artifacts/intake-fixtures/scanned.pdf");
  assert.match(await p.getByLabel("识别原文").inputValue(), /测试/);
  await p.getByText("第1页 / 本地OCR", { exact: true }).waitFor();
  pass("scanned PDF automatically falls back to real local OCR");
  await p.getByRole("button", { name: "清除识别结果" }).click();
  const started = Date.now();
  await upload("artifacts/intake-fixtures/resume.png");
  assert.match(await p.getByLabel("识别原文").inputValue(), /测试/);
  pass(
    "real Chinese and English image OCR completes in " +
      (Date.now() - started) +
      " ms",
  );
  await p.getByRole("button", { name: "清除识别结果" }).click();
  let delayed = false;
  let oldId = "";
  const oldRoute = async (route) => {
    if (
      !delayed &&
      route.request().method() === "GET" &&
      !route.request().url().endsWith("/limits")
    ) {
      delayed = true;
      oldId = route.request().url().split("/").pop();
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 1400));
      await route.fulfill({ response });
    } else await route.continue();
  };
  await p.route("**/api/resume-extractions/*", oldRoute);
  await p
    .getByLabel("选择简历文件")
    .setInputFiles("artifacts/intake-fixtures/resume.docx");
  await p.getByRole("button", { name: "上传并识别", exact: true }).click();
  await p.waitForTimeout(250);
  await p.getByRole("button", { name: "取消识别", exact: true }).click();
  await upload("artifacts/intake-fixtures/resume.pdf");
  await p.waitForTimeout(1700);
  await p.getByText("第1页 / PDF文字层", { exact: true }).waitFor();
  assert.equal(await p.getByRole("alert").count(), 0);
  await p.unroute("**/api/resume-extractions/*", oldRoute);
  pass("delayed cancelled poll cannot overwrite a newer upload result");
  await p.getByRole("button", { name: "清除识别结果" }).click();
  await p
    .getByLabel("选择简历文件")
    .setInputFiles("artifacts/intake-fixtures/too-many.pdf");
  await p.getByRole("button", { name: "上传并识别", exact: true }).click();
  await p
    .getByRole("alert")
    .filter({ hasText: /4页/ })
    .waitFor({ timeout: 20000 });
  pass("PDF page limit fails gracefully without replacing saved data");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: "artifacts/batch3-intake-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await orbit.focus();
  await orbit.press("Alt+ArrowUp");
  const mobile = await orbit.boundingBox();
  assert.ok(
    mobile.x >= 0 &&
      mobile.y >= 0 &&
      mobile.x + mobile.width <= 390 &&
      mobile.y + mobile.height <= 844,
  );
  pass("mobile import review and moved orbit stay inside viewport");
  const touchPage = await c.newPage();
  const cd = await c.newCDPSession(touchPage);
  await touchPage.setViewportSize({ width: 390, height: 844 });
  await cd.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await touchPage.goto(base);
  const trigger = touchPage.locator(".orbit-trigger");
  const tb = await trigger.boundingBox();
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tb.x + 20, y: tb.y + 20 }],
  });
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 200, y: 300 }],
  });
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await touchPage.locator(".orbit-overlay").count(), 0);
  const moved = await trigger.boundingBox();
  assert.ok(moved.y < 400);
  await touchPage.close();
  pass("real browser touch drag moves orbit without opening overlay");
  assert.deepEqual(errors, []);
  pass("no real render exceptions");
  console.log("TOTAL", count, "intake browser checks passed");
} finally {
  await browser.close();
}
