import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-photoui-" + Date.now() + "@example.invalid";
const password = "PhotoUi12345";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const png = fs.readFileSync("tests/fixtures/qa-resume.png");
const file = (name) => ({ name, mimeType: "image/png", buffer: png });
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const reg = await ctx.request.post(base + "/api/auth/register", { data: { email, password } });
  assert.equal(reg.status(), 201);
  const page = await ctx.newPage();
  await page.goto(base + "/#profile", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(900);
  const input = page.locator(".photo-add input");
  await input.setInputFiles([file("a.png"), file("b.png"), file("c.png")]);
  await page.waitForTimeout(800);
  assert.equal(await page.locator(".photo-thumb").count(), 3);
  console.log("PASS photo picker shows three thumbnails");
  await page.getByRole("button", { name: "保存个人信息", exact: true }).click();
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(800);
  assert.equal(await page.locator(".photo-thumb").count(), 3);
  console.log("PASS photos persist after profile save/reload");
  await page.locator(".photo-remove").first().click(); await page.waitForTimeout(200);
  assert.equal(await page.locator(".photo-thumb").count(), 2);
  await page.locator(".photo-add input").setInputFiles([file("d.png")]);
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".photo-thumb").count(), 3);
  console.log("PASS remove and re-add keeps max three");
} catch (e) {
  console.log("FAIL photo UI", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
  await browser.close();
}
