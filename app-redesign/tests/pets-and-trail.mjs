// 阶段二回归：AI 伙伴图标化 / 看板娘移除 / 拖尾只在首页 / 新手教程新增求职旅程 / 地图去掉默认标注
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "https://127.0.0.1:5175";
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const email = "qa-look-" + Date.now() + "@example.invalid";

await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
await page.getByRole("button", { name: "没有账号？注册一个" }).click();
await page.getByLabel("邮箱", { exact: true }).fill(email);
await page.getByLabel(/密码（10—128位/).fill("Qa-Look-Test-123");
await page.getByRole("button", { name: "创建账号", exact: true }).click();
await page.getByRole("button", { name: "退出登录" }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);

// 新手教程：功能说明前应有「求职旅程」一步
const tutorial = page.getByRole("dialog", { name: "新手教程" });
assert.equal(await tutorial.count(), 1, "首次登录应弹新手教程");
const total = await page.locator(".tutorial-step").innerText();
assert.match(total, /1 \/ 5/, "教程应有 5 步，实际：" + total);
for (let i = 0; i < 3; i++) await page.locator(".tutorial-click-layer").click();
await page.waitForTimeout(500);
const stepCard = await page.locator(".tutorial-card").innerText();
assert.match(stepCard, /求职旅程/, "功能说明前一步应是求职旅程，实际：" + stepCard.slice(0, 40));
await page.getByRole("button", { name: "退出新手教程" }).click();
await page.waitForTimeout(400);

// AI 伙伴：四个图标、无立绘头像、无看板娘
assert.equal(await page.locator(".agent-chip").count(), 4, "应有四位 AI 伙伴");
assert.equal(await page.locator(".agent-chip-icon").count(), 4, "四位都应使用功能图标");
assert.equal(await page.locator(".agent-chip img").count(), 0, "不应再加载立绘头像图片");
assert.equal(await page.locator(".live2d-pet-container").count(), 0, "看板娘应已移除");
assert.equal(await page.locator("#live2d").count(), 0, "Live2D 容器应已移除");
assert.equal(await page.locator(".companions-form").count(), 0, "Live2D/立绘 切换按钮应已移除");
const icons = await page.locator(".agent-chip-icon").allInnerTexts();
console.log("伙伴图标:", icons.join(" "));

// 拖尾：首页有，其他页面没有
assert.ok((await page.locator(".mouse-trail-canvas").count()) >= 1, "首页应有鼠标拖尾");
await page.locator(".orbit-trigger").click();
await page.locator(".nav-map").waitFor({ timeout: 8000 });
await page.locator('[data-page="settings"]').click();
await page.waitForTimeout(1500);
assert.equal(await page.locator(".mouse-trail-canvas").count(), 0, "设置页不应有拖尾");
await page.locator(".orbit-trigger").click();
await page.locator(".nav-map").waitFor({ timeout: 8000 });
await page.locator('[data-page="home"]').click();
await page.waitForTimeout(1200);
assert.ok((await page.locator(".mouse-trail-canvas").count()) >= 1, "回到首页拖尾应恢复");

await page.screenshot({ path: "artifacts/rd-home-icons.png" });
assert.deepEqual(errors, [], "无页面异常");
console.log("PASS stage2: 4 个功能图标 / 无看板娘 / 拖尾只在首页 / 教程 5 步含求职旅程");
await browser.close();
