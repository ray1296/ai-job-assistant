import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"], headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());
const map = () => p.getByRole("button", { name: "旅程地图", exact: true });
try {
  await p.goto(base);
  await map().click();
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByLabel("密码（10—128位）").fill("Multi-Page-Test-123!");
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p.getByLabel("邮箱", { exact: true }).fill("multi-" + Date.now() + "@example.invalid");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await map().click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.getByRole("article", { name: "简历文档" }).waitFor();

  assert.equal(await p.locator(".resume-document").count(), 1, "初始应为 1 页");
  assert.equal(await p.locator(".document-section").count(), 5, "初始 5 个板块");
  console.log("PASS 初始单页、5 板块");

  await p.getByRole("button", { name: "换页-项目经历" }).click();
  assert.equal(await p.locator(".resume-document").count(), 2, "换页后应 2 页");
  const page1 = p.locator(".resume-document").nth(0);
  const page2 = p.locator(".resume-document").nth(1);
  assert.match(await page1.innerText(), /教育经历/);
  assert.match(await page1.innerText(), /掌握技能/);
  assert.doesNotMatch(await page1.innerText(), /项目经历/);
  assert.match(await page2.innerText(), /项目经历/);
  assert.match(await page2.innerText(), /荣誉与证书/);
  assert.equal(await page2.locator(".document-header.page-runner").count(), 1, "第 2 页应有页眉");
  assert.match(await page2.locator(".page-runner-num").innerText(), /共 2 页/);
  console.log("PASS 换页 → 2 页、内容正确切分、第 2 页有页眉页码");

  await p.getByRole("button", { name: "保存当前版本", exact: true }).last().click();
  await p.getByText("当前版本已保存", { exact: true }).waitFor();
  await p.reload();
  await p.locator(".resume-document").first().waitFor();
  assert.equal(await p.locator(".resume-document").count(), 2, "刷新后仍 2 页");
  console.log("PASS 保存刷新后多页持久化");

  assert.deepEqual(errs, []);
  console.log("PASS 无浏览器渲染错误");
  console.log("TOTAL 多页验证全部通过");
} finally {
  await browser.close();
}
