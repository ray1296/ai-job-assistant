import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", headless: true, args: ["--no-sandbox"] });
const c = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await c.newPage();
const errors = []; p.on("pageerror", (e) => errors.push(e.message));
let n = 0; const pass = (m) => { console.log("PASS", m); n++; };
try {
  await p.goto(base);
  await p.getByRole("button", { name: "旅程地图", exact: true }).click();
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p.getByLabel("邮箱", { exact: true }).fill("section-" + Date.now() + "@example.invalid");
  await p.getByLabel("密码（10—128位）").fill("Section-Test-123!");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await p.getByRole("button", { name: "旅程地图", exact: true }).click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.locator(".resume-document").first().waitFor();
  pass("进入简历工作室并创建空白简历");

  // 两个功能必须分开摆：装饰不在 AI 助手条里，AI 助手条里没有装饰开关。
  assert.equal(await p.locator(".ai-help-strip .decor-toggle").count(), 0);
  assert.equal(await p.locator(".decor-panel .decor-toggle").count(), 1);
  pass("生图装饰与\"描述新板块\"已分开摆放");

  const before = await p.locator(".resume-document .document-section").count();
  await p.getByRole("button", { name: /描述新板块/ }).click();
  const ta = p.getByLabel("AI编辑需求");
  await ta.waitFor();
  assert.ok(!(await p.getByText("统一AI网关与可确认修改将在后续批次接入").count()), "不应再出现占位文案");
  await ta.fill("加一个开源贡献板块：我维护一个 Vue 组件库，做过代码审查与发版");
  await p.getByRole("button", { name: /AI 生成并添加板块/ }).click();
  await p.getByText(/已新增板块/).waitFor({ timeout: 180000 });
  await p.locator(".resume-document").getByText("开源贡献", { exact: true }).first().waitFor({ timeout: 30000 });
  pass("AI 按描述生成了新板块并写入文档");

  const after = await p.locator(".resume-document .document-section").count();
  assert.ok(after > before, "板块数量应增加: " + before + " -> " + after);
  pass("板块数量增加 " + before + " → " + after);

  await p.keyboard.press("Control+z");
  await p.waitForTimeout(600);
  assert.equal(await p.locator(".resume-document").getByText("开源贡献", { exact: true }).count(), 0);
  pass("新增板块可被撤销");
  assert.deepEqual(errors, []);
  pass("无浏览器错误");
  console.log("TOTAL 新板块生成验证通过 (" + n + ")");
} catch (e) {
  console.log("FAILED:", e.message.slice(0, 400));
  process.exitCode = 1;
} finally { await browser.close(); }
