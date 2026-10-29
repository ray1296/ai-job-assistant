// 上传题库 → 面经八股 同步回归测试
// 运行: node tests/uploaded-bank.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "https://127.0.0.1:5175";
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const email = "qa-bank-" + Date.now() + "@example.invalid";

await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
await page.getByRole("button", { name: "没有账号？注册一个" }).click();
await page.getByLabel("邮箱", { exact: true }).fill(email);
await page.getByLabel(/密码（10—128位/).fill("Qa-Bank-Test-123");
await page.getByRole("button", { name: "创建账号", exact: true }).click();
await page.getByRole("button", { name: "退出登录" }).waitFor({ timeout: 20000 });
await page.waitForTimeout(600);
const exit = page.getByRole("button", { name: "退出新手教程" });
if (await exit.count()) await exit.click();

// 新账号：还没有上传，应显示 0 题
const csrf = (await (await page.request.get(base + "/api/auth/session")).json()).csrf;
let r = await page.request.get(base + "/api/study/uploads?page=1&pageSize=10");
let data = await r.json();
assert.equal(r.status(), 200, "接口应可用");
assert.equal(data.total, 0, "新账号没有上传题目");

// 通过上传题库同一套接口写入 3 道题
const subject = (await (await page.request.post(base + "/api/study/subjects", { data: { name: "QA自动化科目" }, headers: { "X-CSRF-Token": csrf } })).json()).subject;
const vres = await page.request.post(base + "/api/study/subjects/" + subject.id + "/versions", {
  data: {
    name: "QA 第一次上传",
    source: "上传 QA 测试文件",
    questions: [
      { type: "short", stem: "什么是进程和线程的区别？", answer: "进程是资源分配单位，线程是调度单位。" },
      { type: "short", stem: "TCP 三次握手解决了什么问题？", answer: "确认双向收发能力并同步初始序号。" },
      { type: "short", stem: "索引失效的常见原因？", answer: "前导模糊查询、函数运算、类型隐式转换。" },
    ],
  },
  headers: { "X-CSRF-Token": csrf },
});
assert.equal(vres.status(), 201, "上传应成功");

data = await (await page.request.get(base + "/api/study/uploads?page=1&pageSize=10")).json();
assert.equal(data.total, 3, "上传后接口应返回 3 题");
assert.equal(data.questions[0].subject, "QA自动化科目", "应带科目名");
assert.equal(data.questions[0].version, "QA 第一次上传", "应带版本名");

// 面经八股页面应能看到
await page.locator(".orbit-trigger").click();
await page.locator(".nav-map").waitFor({ timeout: 8000 });
await page.locator('[data-page="knowledge"]').click();
await page.waitForTimeout(2500);
await page.locator("[data-testid=uploaded-bank]").waitFor({ timeout: 15000 });
assert.equal(await page.locator("[data-uploaded-id]").count(), 3, "面经八股应显示 3 道上传题");
assert.match(await page.locator("[data-testid=uploaded-bank] > .uploaded-bank-head p").first().innerText(), /共 3 道/, "提示应显示题数");

// 搜索过滤
await page.locator(".uploaded-bank-search input").fill("索引");
await page.locator(".uploaded-bank-search button[type=submit]").click();
await page.waitForTimeout(900);
assert.equal(await page.locator("[data-uploaded-id]").count(), 1, "搜索应过滤到 1 题");

assert.deepEqual(errors, [], "无页面异常");
console.log("PASS uploaded-bank: 上传 3 题 → 面经八股同步可见 → 搜索过滤正常");
await browser.close();
