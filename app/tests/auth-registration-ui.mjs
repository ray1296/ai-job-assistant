import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-authui-" + Date.now() + "@example.invalid";
const password = "AuthUi12345";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(base + "/#home", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  await page.getByRole("button", { name: "登录 / 注册" }).click();
  await page.getByRole("button", { name: "没有账号？注册一个" }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel(/密码（10—128位/).fill(password);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await page.getByRole("button", { name: "退出登录" }).waitFor();
  console.log("PASS UI registration creates session");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("button", { name: "登录 / 注册" }).click();
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel(/密码（10—128位/).fill(password);
  await page.locator(".auth-modal button[type=submit]").click();
  await page.waitForTimeout(1200);
  console.log("LOGIN ALERTS", JSON.stringify(await page.locator(".auth-modal .error, .error").allInnerTexts()), "BODY", (await page.locator("body").innerText()).slice(-300));
  await page.getByRole("button", { name: "退出登录" }).waitFor();
  const text = await page.locator("body").innerText();
  assert.ok(text.includes("qa-authui")); // 邮箱前缀出现在头像区域
  console.log("PASS UI logout then login with registered account");
} catch (e) {
  console.log("FAIL auth UI", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
  await browser.close();
}
