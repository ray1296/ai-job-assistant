// 求职导航（白板地图）回归测试：顺序、分组、纯白板、可跳转
// 运行: node tests/nav-map.mjs   （默认 https://127.0.0.1:5175，可用 TEST_BASE_URL 覆盖）
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

await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.locator(".orbit-trigger").click();
await page.locator(".nav-map").waitFor({ timeout: 8000 });

assert.equal(await page.locator(".nav-map-h1").innerText(), "求职流程", "顶部标题应为「求职流程」");
const groups = await page.locator(".nav-group-head h2").allInnerTexts();
assert.deepEqual(groups, ["前置工作", "投递岗位", "准备面试", "工具栏"], "四个分区");

const expected = ["求职工作台","项目介绍","个人信息","简历工作室","数据空间","发现岗位","企业观察","租房生活","数据大屏","通勤地图","投递方案","上传题库","面经八股","学习刷题","模拟面试","AI协作","心愿池","设置"];
const items = await page.locator(".nav-item-name").allInnerTexts();
assert.equal(items.length, 18, "18 个板块");
assert.deepEqual(items, expected, "顺序必须符合求职流程");

// 纯白板：无底图、无星盘组件
const bg = await page.locator(".nav-map").evaluate((el) => getComputedStyle(el).backgroundColor);
assert.equal(bg, "rgb(255, 255, 255)", "白板底色");
assert.equal(await page.locator(".nav-map").evaluate((el) => getComputedStyle(el).backgroundImage), "none", "不能有底图");
assert.equal(await page.locator(".star-map, .rpg-map").count(), 0, "旧星盘组件应已移除");

// 字号放大
const size = await page.locator(".nav-item-name").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
assert.ok(size >= 17, "板块名字号不小于 17px，实际 " + size);

// 一屏放得下：18 个板块不允许出现纵向滚动
const fit = await page.locator(".nav-map").evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
assert.ok(fit.scroll <= fit.client + 1, "导航不应需要滚动：scrollHeight " + fit.scroll + " > clientHeight " + fit.client);

// 顶部流程介绍必须常显（矮屏也不能隐藏）
assert.ok(await page.locator(".nav-map-sub").isVisible(), "顶部流程介绍不应被隐藏");
const subText = await page.locator(".nav-map-sub").innerText();
assert.match(subText, /求职顺序/, "流程介绍文案缺失");

// 悬停显示板块介绍（不占版面）
await page.locator('[data-page="map"]').hover();
await page.waitForTimeout(300);
const tipOpacity = await page.locator('[data-page="map"]').evaluate((el) => getComputedStyle(el, "::after").opacity);
assert.equal(tipOpacity, "1", "悬停应显示板块介绍");

// 点击跳转
await page.locator('[data-page="resume"]').click();
await page.waitForTimeout(1200);
assert.equal(await page.locator(".nav-map").count(), 0, "跳转后导航关闭");
assert.equal((await page.evaluate(() => location.hash)), "#resume", "应跳到简历工作室");

assert.deepEqual(errors, [], "无页面异常");
console.log("PASS nav-map: 18 板块 / 4 分区 / 顺序正确 / 纯白板 / 字号 " + size + "px / 可跳转");
await browser.close();
