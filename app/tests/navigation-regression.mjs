import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-nav-" + Date.now() + "@example.invalid";
const password = "QA-Nav-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "导航测试" } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/#home", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const buttons = await page.locator(".sky-actions button").allInnerTexts();
  assert.ok(!buttons.some((x) => x.includes("管理中心")), "normal user must not see admin entry");
  console.log("PASS normal user header has no admin entry", JSON.stringify(buttons));

  await page.goto(base + "/#map", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.goto(base + "/#admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const adminText = await page.locator("body").innerText();
  assert.ok(adminText.includes("管理中心") && adminText.includes("不是管理员"), "direct admin must show honest guard");
  assert.ok(adminText.length > 80, "admin guard page must not be blank");
  console.log("PASS direct #admin shows guard, not blank");

  await page.goBack();
  await page.waitForTimeout(900);
  const backText = await page.locator("body").innerText();
  assert.ok(backText.includes("城市与通勤地图"), "back should return to map");
  assert.ok(!backText.includes("这个页面暂时出错"), "back should clear error boundary");
  console.log("PASS back from admin restores map without error boundary");

  assert.deepEqual(errors, []);
  console.log("PASS navigation regression no page errors");
} catch (e) {
  console.log("FAIL navigation regression", e.message);
  process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) {
      const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json();
      const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" };
      const users = await (await fetch(base + "/api/admin/users", { headers: h })).json();
      const me = (users.users || []).find((u) => u.email === email);
      if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h });
    }
  } catch {}
  await browser.close();
}
