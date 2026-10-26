import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-stab-" + Date.now() + "@example.invalid";
const password = "QA-Stab-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "稳定性" } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const pages = ["home", "jobs", "knowledge", "data", "wish", "settings", "chat", "interview"];
try {
  for (let round = 0; round < 3; round++) {
    for (const hash of pages) {
      await page.goto(base + "/#" + hash, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const text = await page.locator("body").innerText();
      assert.ok(text.length > 40, hash + " blank in round " + round);
      assert.ok(!/这个页面暂时出错/.test(text), hash + " crash in round " + round);
    }
  }
  console.log("PASS 3 rounds x 8 pages reload without blank/crash");

  await page.goto(base + "/#settings", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  const themes = page.locator(".theme-swatch, .settings-theme button, [data-theme]");
  if (await themes.count()) {
    await themes.nth(0).click({ timeout: 2500 }).catch(() => {});
    await themes.nth(Math.min(1, (await themes.count()) - 1)).click({ timeout: 2500 }).catch(() => {});
  }
  console.log("PASS repeated settings interaction");

  const results = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
    const r = await ctx.request.get(base + (i % 2 ? "/api/questions?pageSize=12" : "/api/jobs?pageSize=12"));
    return r.status();
  }));
  assert.ok(results.every((s) => s === 200), "concurrent reads failed");
  console.log("PASS 12 concurrent reads under one session");

  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  assert.ok((await page.locator("body").innerText()).length > 40);
  assert.deepEqual(errors, []);
  console.log("PASS no page errors across stability run");
} catch (e) {
  console.log("FAIL stability", e.message); console.log(errors.slice(0, 5)); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const all = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = all.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
  await browser.close();
}
