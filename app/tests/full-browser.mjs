import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const email = "qa-ui-" + Date.now() + "@example.invalid";
const password = "QA-UI-Strong-123!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const adminEmail = initial.match(/email:\s*(.+)/)[1].trim();
const adminPassword = initial.match(/password:\s*(.+)/)[1].trim();
const executablePath = "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome";
let passed = 0, failed = 0;
const pass = (n) => { passed++; console.log("PASS", n); };
const fail = (n, e) => { failed++; console.log("FAIL", n, String(e?.message || e).slice(0, 240)); };

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"], headless: true });
const userCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await userCtx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGE " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 180)); });
let adminCtx = null;
let adminPage = null;

async function go(hash, wait = 900) {
  await page.goto(base + "/#" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(wait);
}
async function h1Text() {
  return (await page.locator("h1").first().innerText().catch(() => "")).trim();
}
async function noOverflow(label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, label + " horizontal overflow " + overflow);
}
async function api(path, method = "GET", body) {
  const r = await userCtx.request.fetch(base + path, {
    method, data: body, headers: { "Content-Type": "application/json" },
  });
  return { status: r.status(), data: await r.json().catch(() => null) };
}

try {
  const reg = await userCtx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "UI测试同学" } });
  assert.equal(reg.status(), 201);
  pass("browser test account");

  await go("home", 1200);
  assert.match(await h1Text(), /每一步|理想/);
  await noOverflow("home");
  pass("home renders");

  await go("profile", 1000);
  assert.equal(await h1Text(), "个人信息");
  const name = page.getByLabel("姓名");
  await name.fill("UI测试同学");
  await page.getByRole("button", { name: "保存个人信息" }).click();
  await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).includes("已保存"));
  pass("profile save");

  await go("resume", 1000);
  assert.equal(await h1Text(), "简历工作室");
  await noOverflow("resume");
  pass("resume page");

  await go("data", 1000);
  assert.equal(await h1Text(), "我的数据空间");
  await page.locator("#dataset-file").setInputFiles("tests/fixtures/qa-jobs.csv");
  await page.getByRole("button", { name: /上传并解析到/ }).click();
  await page.waitForTimeout(18000);
  if (!(await page.locator("body").innerText()).includes("QA前端") && !(await page.locator("body").innerText()).includes("已导入")) {
    console.log("DATA DEBUG", (await page.locator("body").innerText()).slice(-800));
    await page.screenshot({ path: "/tmp/data-upload-fail.png", fullPage: true });
    throw new Error("dataset upload UI did not show success");
  }
  pass("dataset upload via UI");

  await go("jobs", 1000);
  assert.equal(await h1Text(), "发现岗位");
  const jobSearch = page.getByPlaceholder("搜索岗位、公司、方向或 JD");
  await jobSearch.fill("前端");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).length > 100);
  pass("jobs search");

  await go("dashboard", 1200);
  assert.equal(await h1Text(), "就业数据大屏");
  assert.ok((await page.locator("canvas").count()) >= 3);
  pass("dashboard charts");

  await go("map", 3000);
  assert.ok((await page.locator("body").innerText()).includes("城市与通勤地图"));
  assert.ok((await page.locator(".amap-container, canvas").count()) > 0);
  pass("map loads");

  await go("companies", 1000);
  assert.equal(await h1Text(), "企业观察");
  await page.getByPlaceholder("搜索公司、行业、方向").fill("字节");
  await page.waitForTimeout(700);
  assert.ok((await page.locator("body").innerText()).includes("字节"));
  pass("companies search");

  await go("housing", 1000);
  assert.equal(await h1Text(), "租房与生活");
  assert.ok((await page.locator("body").innerText()).length > 100);
  pass("housing list");

  await go("knowledge", 1000);
  assert.equal(await h1Text(), "面经与八股");
  const kq = page.getByTestId("learning-search");
  await kq.fill("Nacos");
  await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).includes("Nacos"));
  pass("knowledge search");

  await go("practice", 1800);
  const pf = page.frameLocator("iframe");
  await pf.getByText("学习与刷题", { exact: false }).first().waitFor({ timeout: 10000 }).catch(() => {});
  assert.ok((await pf.locator("body").innerText()).length > 100);
  pass("practice iframe loads");

  await go("study-upload", 1800);
  const uf = page.frameLocator("iframe");
  assert.ok((await uf.locator("body").innerText()).includes("上传题库"));
  pass("study upload iframe loads");

  await go("interview", 1000);
  assert.equal(await h1Text(), "模拟面试");
  assert.ok((await page.locator("body").innerText()).includes("开始模拟面试"));
  pass("interview setup");

  await go("plan", 1000);
  assert.equal(await h1Text(), "投递意向与方案");
  pass("plan page");

  await go("chat", 1000);
  assert.ok((await page.locator("body").innerText()).includes("AI 协作空间"));
  const chatInput = page.getByPlaceholder(/给 .* 发消息/);
  await chatInput.fill("你好，简单介绍一下你能做什么");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForTimeout(22000);
  assert.ok((await page.locator("body").innerText()).length > 200);
  pass("chat send");

  await go("wish", 900);
  assert.equal(await h1Text(), "心愿池");
  await page.getByPlaceholder(/希望岗位列表/).fill("UI 测试心愿 " + Date.now());
  await page.getByRole("button", { name: "放进心愿池" }).click();
  await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).includes("已放进心愿池"));
  pass("wish add");

  await go("settings", 900);
  assert.equal(await h1Text(), "个性化设置");
  const uname = page.getByPlaceholder("显示在右上角头像旁");
  await uname.fill("UI测试改名");
  await page.getByRole("button", { name: /保存/ }).first().click();
  await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).includes("UI测试改名"));
  pass("settings username");

  await noOverflow("settings");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [hash, label] of [["home", "手机首页"], ["knowledge", "手机知识"], ["jobs", "手机岗位"], ["wish", "手机心愿"]]) {
    await go(hash, 900);
    await noOverflow(label);
  }
  pass("mobile responsive pages");
  await page.setViewportSize({ width: 1440, height: 900 });

  const a11y = await page.evaluate(() => {
    const noText = [...document.querySelectorAll("button")].filter((b) => !(b.innerText || "").trim() && !b.getAttribute("aria-label") && !b.getAttribute("title")).length;
    const noLabel = [...document.querySelectorAll("input, textarea")].filter((i) => !i.getAttribute("aria-label") && !i.getAttribute("placeholder") && !i.closest("label")).length;
    const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length;
    return { noText, noLabel, noAlt };
  });
  console.log("A11Y", a11y);
  assert.ok(a11y.noAlt === 0, "images without alt");
  pass("basic accessibility scan");

  adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  adminPage = await adminCtx.newPage();
  const adminErrors = [];
  adminPage.on("pageerror", (e) => adminErrors.push(e.message));
  await adminPage.goto(base + "/#admin", { waitUntil: "domcontentloaded" });
  await adminPage.waitForTimeout(900);
  assert.equal(await adminPage.locator("h1").first().innerText(), "管理中心");
  await adminPage.locator('input[type="email"]').fill(adminEmail);
  await adminPage.locator('input[type="password"]').fill(adminPassword);
  await adminPage.getByRole("button", { name: "以管理员身份登录" }).click();
  await adminPage.waitForTimeout(1200);
  assert.equal(await adminPage.locator("h1").first().innerText(), "运行概览");
  await adminPage.getByRole("button", { name: "用户账号", exact: true }).click();
  await adminPage.waitForTimeout(600);
  assert.ok((await adminPage.locator("body").innerText()).includes(email));
  await adminPage.getByRole("button", { name: "心愿池", exact: true }).click();
  await adminPage.waitForTimeout(600);
  assert.ok((await adminPage.locator("body").innerText()).includes("心愿池管理"));
  pass("admin login/overview/users/wishes");

  const significant = errors.filter((x) => !/favicon|amap|Failed to load resource|font/i.test(x));
  assert.deepEqual(significant, []);
  pass("no significant browser errors");

  console.log("RESULT", passed, "passed", failed, "failed");
} catch (e) {
  fail("browser suite", e);
  console.log("RESULT", passed, "passed", failed, "failed");
  console.log("ERRORS", errors.slice(-12));
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword, role: "admin" }) });
    if (l.ok) {
      const cookie = (l.headers.get("set-cookie") || "").split(";")[0];
      const session = await l.json();
      const headers = { Cookie: cookie, "X-CSRF-Token": session.csrf, "Content-Type": "application/json" };
      const users = await (await fetch(base + "/api/admin/users", { headers })).json();
      const me = (users.users || []).find((u) => u.email === email);
      if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers });
    }
  } catch (e) { console.log("CLEANUP WARNING", e?.message || e); }
  await browser.close();
  process.exit(failed ? 1 : 0);
}
