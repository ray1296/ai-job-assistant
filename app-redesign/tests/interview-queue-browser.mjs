import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const accounts = [];
async function account(i) {
  const email = "qa-qb-" + Date.now() + "-" + i + "@example.invalid", password = "QA-QB-12345!";
  const r = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "排队" + i }) });
  assert.equal(r.status, 201); const s = await r.json();
  return { email, cookie: (r.headers.get("set-cookie") || "").split(";")[0], csrf: s.csrf };
}
async function join(u) { const r = await fetch(base + "/api/interview/queue", { method: "POST", headers: { Cookie: u.cookie, "X-CSRF-Token": u.csrf } }); return r.json(); }
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
try {
  for (let i = 0; i < 4; i++) accounts.push(await account(i));
  for (let i = 0; i < 3; i++) { const s = await join(accounts[i]); assert.equal(s.state, "active"); }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.request.post(base + "/api/auth/login", { data: { email: accounts[3].email, password: "QA-QB-12345!" } });
  const page = await ctx.newPage();
  await page.goto(base + "/#interview", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(900);
  await page.getByRole("button", { name: "开始模拟面试" }).click(); await page.waitForTimeout(900);
  const text = await page.locator("body").innerText();
  assert.ok(text.includes("模拟面试正在排队"), "queue overlay missing");
  assert.ok(text.includes("第 1 位"), "queue position missing");
  await page.getByRole("button", { name: "取消排队" }).click(); await page.waitForTimeout(500);
  assert.ok(!(await page.locator("body").innerText()).includes("模拟面试正在排队"));
  console.log("PASS interview queue UI: 4th user sees position and can cancel");
  for (let i = 0; i < 3; i++) await fetch(base + "/api/interview/queue/" + (await join(accounts[i])).token, { method: "DELETE", headers: { Cookie: accounts[i].cookie, "X-CSRF-Token": accounts[i].csrf } });
  await ctx.close();
} catch (e) {
  console.log("FAIL interview queue UI", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const all = await (await fetch(base + "/api/admin/users", { headers: h })).json(); for (const u of accounts) { const me = all.users.find((x) => x.email === u.email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); } }
  } catch {}
  await browser.close();
}
