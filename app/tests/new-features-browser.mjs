import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-ui-new-" + Date.now() + "@example.invalid";
const password = "QA-UI-New-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "新功能UI" } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let adminCookie = "", adminCsrf = "", annId = "";
try {
  await page.goto(base + "/#home", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(900);
  assert.equal(await page.getByRole("button", { name: "管理中心" }).count(), 0);
  await page.getByRole("button", { name: "功能说明" }).click(); await page.waitForTimeout(700);
  assert.equal(await page.locator("h1").first().innerText(), "项目介绍");
  assert.ok((await page.locator("body").innerText()).includes("心愿池与审核"));
  console.log("PASS guide page via top link");

  const al = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
  adminCookie = (al.headers.get("set-cookie") || "").split(";")[0]; adminCsrf = (await al.json()).csrf;
  let r = await fetch(base + "/api/announcements", { method: "POST", headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf, "Content-Type": "application/json" }, body: JSON.stringify({ title: "UI 测试通告", body: "这是一条全局通告。" }) });
  annId = (await r.json()).item.id;
  await page.reload(); await page.waitForTimeout(900);
  const noticeBtn = page.getByRole("button", { name: /通告/ });
  assert.equal(await noticeBtn.count(), 1);
  await noticeBtn.first().click(); await page.waitForTimeout(300);
  assert.ok((await page.locator("body").innerText()).includes("UI 测试通告"));
  await page.getByRole("button", { name: "已阅" }).first().click(); await page.waitForTimeout(300);
  assert.ok((await page.locator("body").innerText()).includes("已阅"));
  await page.getByRole("button", { name: "关闭通告" }).click(); await page.waitForTimeout(300);
  console.log("PASS announcement banner/read");

  await page.goto(base + "/#wish", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  const longText = "UI 长心愿：" + "希望增加更细的筛选、导出和提醒。".repeat(12);
  await page.getByPlaceholder(/希望岗位列表/).fill(longText);
  await page.getByRole("button", { name: "提交审核" }).click(); await page.waitForTimeout(900);
  assert.ok((await page.locator("body").innerText()).includes("审核中"));
  assert.ok((await page.getByRole("button", { name: "展开全文" }).count()) >= 1);
  await page.getByRole("button", { name: "展开全文" }).first().click(); await page.waitForTimeout(200);
  assert.ok((await page.getByRole("button", { name: "撤销" }).count()) >= 1);
  console.log("PASS pending wish visible, collapsible, withdrawable");

  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await adminCtx.request.post(base + "/api/auth/login", { data: { email: ae, password: ap, role: "admin" } });
  const adminPage = await adminCtx.newPage(); await adminPage.goto(base + "/#admin"); await adminPage.waitForTimeout(900);
  await adminPage.getByRole("button", { name: "心愿池", exact: true }).click(); await adminPage.waitForTimeout(500);
  assert.ok((await adminPage.locator("body").innerText()).includes("待审核"));
  const adminList = await (await fetch(base + "/api/wishes", { headers: { Cookie: adminCookie } })).json();
  const wish = adminList.items[0];
  const patch = await fetch(base + "/api/wishes/" + wish.id, { method: "PATCH", headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf, "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved", done: true }) });
  assert.equal(patch.status, 200);
  console.log("PASS admin wish approval API");
  await adminPage.getByRole("button", { name: "通告", exact: true }).click(); await adminPage.waitForTimeout(500);
  assert.ok((await adminPage.locator("body").innerText()).includes("通告管理"));
  await adminPage.close();
  await adminCtx.close();

  await page.goto(base + "/#wish", { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  const afterText = await page.locator("body").innerText();
  assert.ok(afterText.includes("已采纳"));
  assert.equal(await page.getByRole("button", { name: "撤销" }).count(), 0);
  console.log("PASS approved wish not withdrawable");

  await page.goto(base + "/#chat", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  const fileInput = page.locator('input[type=file]').last();
  await fileInput.setInputFiles("tests/fixtures/qa-resume.docx"); await page.waitForTimeout(1500);
  assert.ok((await page.locator("body").innerText()).includes("qa-resume.docx"));
  console.log("PASS chat attaches DOCX");

  await page.goto(base + "/#map", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(2500);
  const text = await page.locator("body").innerText();
  assert.ok(/地铁站 \d+/.test(text), "missing subway count");
  console.log("PASS map dynamic subway count");

  await page.goto(base + "/#practice", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(3500);
  assert.ok((await page.locator("iframe").count()) >= 1);
  console.log("PASS practice iframe present");

  assert.deepEqual(errors, []);
  console.log("PASS no page errors");
} catch (e) {
  console.log("FAIL new UI", e.message); console.log("ERRORS", errors.slice(0, 5)); process.exitCode = 1;
} finally {
  try {
    if (annId) await fetch(base + "/api/announcements/" + annId, { method: "DELETE", headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf } });
    const h = { Cookie: adminCookie, "X-CSRF-Token": adminCsrf, "Content-Type": "application/json" };
    const users = await (await fetch(base + "/api/admin/users", { headers: h })).json();
    const me = (users.users || []).find((u) => u.email === email);
    if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h });
  } catch {}
  await browser.close();
}
