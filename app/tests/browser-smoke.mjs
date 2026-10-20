import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser = await chromium.launch({
  executablePath:
    "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"],
  headless: true,
});
const errors = [];
let checks = 0;
const pass = (n) => {
  checks++;
  console.log("PASS", n);
};
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const p = await ctx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
const email = "browser-" + Date.now() + "@example.invalid";
await fs.mkdir("artifacts", { recursive: true });
try {
  await p.goto("http://127.0.0.1:5173/");
  await p.getByText("填写个人信息", { exact: true }).first().waitFor();
  pass("Vue home renders");
  await p.screenshot({ path: "artifacts/batch1-home.png", fullPage: true });
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p.getByLabel("邮箱", { exact: true }).fill(email);
  await p.getByLabel("密码（10—128位）").fill("Browser-Test-Only-123!");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录", exact: true }).waitFor();
  pass("real registration through UI");
  await p.getByRole("button", { name: /填写个人信息/ }).click();
  await p.getByRole("heading", { name: "个人信息", exact: true }).waitFor();
  await p.getByLabel("姓名", { exact: true }).fill("验收同学");
  await p.getByLabel("联系电话", { exact: true }).fill("测试号码");
  await p.getByLabel("意向城市", { exact: true }).fill("深圳");
  await p.getByRole("button", { name: "确定", exact: true }).nth(0).click();
  await p.getByLabel("职业方向", { exact: true }).fill("前端开发");
  await p.getByRole("button", { name: "确定", exact: true }).nth(1).click();
  await p.getByLabel("掌握技能", { exact: true }).fill("Vue3 / TypeScript");
  await p
    .getByRole("button", { name: "+ 添加一段", exact: true })
    .nth(0)
    .click();
  await p.getByLabel("学校 / 专业 / 学历").nth(1).fill("本科阶段");
  await p.getByRole("button", { name: "保存个人信息", exact: true }).click();
  await p.getByText("已保存到你的账号，刷新或再次登录后可继续编辑").waitFor();
  pass("repeatable profile and intent chip saved");
  await p.reload();
  await p.getByLabel("姓名", { exact: true }).waitFor();
  assert.equal(
    await p.getByLabel("姓名", { exact: true }).inputValue(),
    "验收同学",
  );
  assert.equal(await p.getByLabel("学校 / 专业 / 学历").count(), 2);
  await p.getByRole("button", { name: "删除深圳" }).waitFor();
  pass("profile and two education records restored after reload");
  await p.screenshot({ path: "artifacts/batch1-profile.png", fullPage: true });
  await p.getByRole("button", { name: "展开星盘", exact: false }).click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.getByRole("textbox", { name: "版本名称" }).fill("前端求职版");
  await p.getByRole("button", { name: "从已保存个人信息填入" }).click();
  await p.getByRole("textbox", { name: "简历正文" }).waitFor();
  await p.waitForFunction(() =>
    document.querySelector("[aria-label=简历正文]")?.value.includes("验收同学"),
  );
  await p
    .getByRole("textbox", { name: "简历正文" })
    .fill("验收同学\n真实经历\n<script>window.pwned=true</script>");
  await p.getByRole("button", { name: "保存当前版本" }).click();
  await p.getByText("已保存当前简历版本").waitFor();
  assert.equal(await p.evaluate(() => window.pwned), undefined);
  pass("profile import and safe resume save with no script execution");
  await p.getByRole("button", { name: "＋ 新建版本", exact: true }).click();
  await p.getByRole("textbox", { name: "版本名称" }).fill("后端求职版");
  await p.getByRole("textbox", { name: "简历正文" }).fill("第二版本独立正文");
  await p.getByRole("button", { name: "保存当前版本" }).click();
  await p.getByText("已保存当前简历版本").waitFor();
  await p.getByRole("button", { name: "前端求职版", exact: true }).click();
  await p.waitForFunction(() =>
    document.querySelector("[aria-label=简历正文]")?.value.includes("真实经历"),
  );
  pass("independent resume versions switch correctly");
  await p.reload();
  await p.getByRole("button", { name: "前端求职版", exact: true }).click();
  await p.getByRole("textbox", { name: "简历正文" }).waitFor();
  await p.waitForFunction(() =>
    document.querySelector("[aria-label=简历正文]")?.value.includes("真实经历"),
  );
  pass("resume and session persist after reload");
  await p.screenshot({ path: "artifacts/batch1-resume.png", fullPage: true });
  await p.getByRole("button", { name: "展开星盘", exact: false }).click();
  await p.getByRole("button", { name: /就业数据大屏/ }).click();
  const frame = p.frameLocator("iframe");
  await frame
    .getByText("就业数据大屏", { exact: true })
    .first()
    .waitFor({ timeout: 10000 });
  pass("approved prototype pages remain reachable");
  await p.getByRole("button", { name: "退出登录", exact: true }).click();
  await p.getByRole("button", { name: /填写个人信息/ }).click();
  await p.getByRole("heading", { name: "让经历只属于你" }).waitFor();
  pass("logout clears private views");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole("link", { name: /逐光/ }).click();
  await p.getByRole("heading", { name: "每一步，都离理想更近。" }).waitFor();
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  pass("mobile home has no horizontal overflow");
  await p.locator(".fog-veil").waitFor({ state: "hidden" });
  await p.screenshot({ path: "artifacts/batch1-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  pass("no browser page errors");
  console.log("TOTAL", checks, "browser checks passed");
} finally {
  await browser.close();
}
