import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath:
    "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"],
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  acceptDownloads: true,
});
const p = await context.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
let count = 0;
const pass = (n) => {
  count++;
  console.log("PASS", n);
};
const map = () => p.getByRole("button", { name: "旅程地图", exact: true });
async function edit(label, value) {
  const el = p.getByRole("textbox", { name: label, exact: true });
  await el.dblclick();
  await el.fill(value);
  await el.press("Enter");
}
async function save() {
  await p
    .getByRole("button", { name: "保存当前版本", exact: true })
    .last()
    .click();
  await p.getByText("当前版本已保存", { exact: true }).waitFor();
}
await fs.mkdir("artifacts", { recursive: true });
try {
  await p.goto(base);
  await map().click();
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  assert.equal(await p.locator(".orbit-item").count(), 17);
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  pass("journey map restored with all 17 destinations");
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByLabel("密码（10—128位）").fill("Studio-Test-Only-123!");
  await p.getByRole("button", { name: "显示密码", exact: true }).click();
  assert.equal(
    await p.getByLabel("密码（10—128位）").getAttribute("type"),
    "text",
  );
  await p.getByRole("button", { name: "隐藏密码", exact: true }).click();
  assert.equal(
    await p.getByLabel("密码（10—128位）").getAttribute("type"),
    "password",
  );
  pass("password eye toggles without losing entered value");
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p
    .getByLabel("邮箱", { exact: true })
    .fill("browser-" + Date.now() + "@example.invalid");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await map().click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.getByRole("article", { name: "简历文档" }).waitFor();
  assert.equal(await p.locator(".resume-columns").count(), 0);
  assert.equal(await p.locator(".resume-document").count(), 1);
  pass("single document layout replaces split editor and preview");
  await edit("简历姓名", "原位编辑同学");
  await edit("简历求职意向", "前端开发 · 深圳");
  const field = p.getByRole("textbox", { name: "简历联系方式", exact: true });
  await field.dblclick();
  await field.fill("取消的修改");
  await field.press("Escape");
  assert.equal(await field.innerText(), "");
  pass("double click enters editable text and Escape cancels");
  const first = p.locator(".document-entry [aria-label^=条目内容]").first();
  await first.dblclick();
  await first.fill("第一行");
  await first.press("Shift+Enter");
  await first.pressSequentially("Second line");
  await first.press("Enter");
  assert.match(await first.innerText(), /第一行\nSecond line/);
  pass("multiline inline editing confirms without moving layout");
  await p.getByRole("button", { name: "编辑", exact: true }).click();
  await p.getByRole("textbox", { name: "新板块名称" }).fill("开源贡献");
  await p.getByRole("button", { name: "新增板块", exact: true }).click();
  let last = p.locator(".document-section").last();
  await last.getByRole("textbox", { name: /条目标题/ }).dblclick();
  await last.getByRole("textbox", { name: /条目标题/ }).fill("真实开源项目");
  await last.getByRole("textbox", { name: /条目标题/ }).press("Enter");
  await last.getByRole("textbox", { name: /条目内容/ }).dblclick();
  await last
    .getByRole("textbox", { name: /条目内容/ })
    .fill("修复了一个边界条件，不编造指标");
  await last.getByRole("textbox", { name: /条目内容/ }).press("Enter");
  await p.getByRole("button", { name: "上移开源贡献", exact: true }).click();
  assert.match(
    await p.locator(".document-section").nth(4).innerText(),
    /开源贡献/,
  );
  await p.getByRole("button", { name: "撤销", exact: true }).last().click();
  assert.match(
    await p.locator(".document-section").last().innerText(),
    /开源贡献/,
  );
  await p.getByRole("button", { name: "重做", exact: true }).last().click();
  pass("custom section editing move undo and redo work");
  await p.getByRole("button", { name: "模板", exact: true }).click();
  await p.getByRole("button", { name: "紧凑 · 信息集中" }).click();
  await p.getByRole("button", { name: "排版", exact: true }).click();
  await p.getByLabel("文档强调色").selectOption("navy");
  await p.getByLabel("文档字号").selectOption("15");
  await save();
  await p.reload();
  await p.getByRole("textbox", { name: "简历姓名" }).waitFor();
  assert.equal(
    await p.getByRole("textbox", { name: "简历姓名" }).innerText(),
    "原位编辑同学",
  );
  assert.ok(
    await p.locator(".resume-document.template-compact.accent-navy").count(),
  );
  assert.equal(await p.locator(".document-section").count(), 6);
  pass("structured content layout and section ordering persist after reload");
  const before = (await context.request.get(base + "/api/resumes")).status();
  assert.equal(before, 200);
  const x = p.getByRole("textbox", { name: "简历个人简介" });
  await x.dblclick();
  await x.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "<script>window.injected=true</script>");
    data.setData("text/html", '<img src=x onerror="window.injected=true">');
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await x.press("Enter");
  assert.equal(await p.evaluate(() => window.injected), undefined);
  assert.equal(
    await p.locator(".resume-document script,.resume-document img").count(),
    0,
  );
  assert.match(await x.innerText(), /<script>/);
  pass("rich clipboard paste stays inert plain text");
  await save();
  await p.getByRole("button", { name: "复制为新版本", exact: true }).click();
  await p.getByText("已复制为独立版本", { exact: true }).waitFor();
  await edit("简历姓名", "独立副本");
  await save();
  await p.getByRole("button", { name: "我的简历 · 1", exact: true }).click();
  await p.waitForFunction(
    () =>
      document.querySelector("[aria-label=简历姓名]")?.textContent ===
      "原位编辑同学",
  );
  pass("duplicate versions isolate content and editing history");
  const session = await (
    await context.request.get(base + "/api/auth/session")
  ).json();
  const listing = await (
    await context.request.get(base + "/api/resumes")
  ).json();
  const id = listing.resumes.find((x) => x.title === "我的简历 · 1").id;
  const version = await (
    await context.request.get(base + "/api/resumes/" + id)
  ).json();
  await context.request.put(base + "/api/resumes/" + id, {
    headers: { "X-CSRF-Token": session.csrf },
    data: {
      title: "我的简历 · 1",
      body: version.resume.body,
      revision: version.resume.revision,
    },
  });
  await edit("简历求职意向", "冲突草稿仍保留");
  await p
    .getByRole("button", { name: "保存当前版本", exact: true })
    .last()
    .click();
  await p
    .getByRole("alert")
    .filter({ hasText: /另一页面|并发/ })
    .waitFor();
  assert.equal(
    await p.getByRole("textbox", { name: "简历求职意向" }).innerText(),
    "冲突草稿仍保留",
  );
  pass("multi-tab conflict rejects overwrite and preserves local draft");
  await p.getByRole("button", { name: "复制为新版本", exact: true }).click();
  await p.getByText("已复制为独立版本", { exact: true }).waitFor();
  await edit("简历个人简介", "请求失败草稿");
  await p.route("**/api/resumes/*", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await p
    .getByRole("button", { name: "保存当前版本", exact: true })
    .last()
    .click();
  await p.getByRole("alert").waitFor();
  assert.equal(
    await p.getByRole("textbox", { name: "简历个人简介" }).innerText(),
    "请求失败草稿",
  );
  await p.unroute("**/api/resumes/*");
  await save();
  pass("request failure retains edit and retry saves successfully");
  const legacy = await context.request.post(base + "/api/resumes", {
    headers: { "X-CSRF-Token": session.csrf },
    data: {
      title: "上一批纯文本版本",
      body: { text: "旧版内容原文 <b>不执行HTML</b>" },
    },
  });
  assert.equal(legacy.status(), 201);
  await p.reload();
  await p
    .getByRole("button", { name: "上一批纯文本版本", exact: true })
    .click();
  await p.waitForFunction(() =>
    document
      .querySelector(".resume-document")
      ?.textContent.includes("旧版内容原文"),
  );
  assert.equal(await p.locator(".resume-document b").count(), 0);
  await save();
  pass(
    "legacy text migrates to safe editable document without losing original text",
  );
  await p.getByRole("button", { name: "我的简历 · 1", exact: true }).click();
  await p.waitForFunction(
    () =>
      document.querySelector("[aria-label=简历姓名]")?.textContent ===
      "原位编辑同学",
  );
  await p.getByRole("heading", { name: /AI 内容审阅与优化/ }).waitFor();
  const decor = p.getByRole("checkbox", { name: /生图装饰/ });
  assert.equal(await decor.isChecked(), false);
  await decor.check();
  await decor.uncheck();
  pass("AI review and decoration controls are present and default off");
  const downloadPromise = p.waitForEvent("download");
  await p.getByRole("button", { name: "下载 Word", exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.docx$/);
  await download.saveAs("artifacts/batch2-export.docx");
  assert.ok((await fs.stat("artifacts/batch2-export.docx")).size > 1000);
  pass("actual Word document downloads successfully");
  await p.emulateMedia({ media: "print" });
  assert.equal(await p.locator(".sky-header").isVisible(), false);
  assert.equal(await p.locator(".section-controls").first().isVisible(), false);
  await p.pdf({
    path: "artifacts/batch2-print.pdf",
    format: "A4",
    printBackground: true,
  });
  await p.emulateMedia({ media: "screen" });
  pass("PDF print layout excludes private navigation and editing controls");
  await p.locator(".fog-veil").waitFor({ state: "hidden" });
  await p.screenshot({ path: "artifacts/batch2-studio.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await edit("简历姓名", "移动端原位编辑");
  await p.screenshot({ path: "artifacts/batch2-mobile.png", fullPage: true });
  pass("mobile document editing works with no horizontal overflow");
  assert.deepEqual(errors, []);
  pass("no browser rendering errors");
  console.log("TOTAL", count, "studio browser checks passed");
} finally {
  await browser.close();
}
