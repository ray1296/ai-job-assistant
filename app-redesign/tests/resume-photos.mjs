import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-resumephoto-" + Date.now() + "@example.invalid";
const password = "ResumePhoto12345";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lV8hAAAAAElFTkSuQmCC";
const profile = { name: "照片导入", phone: "", email, summary: "简介", skills: "", honors: "", notes: "", photos: [photo], cities: [], directions: [], education: [], projects: [], experience: [] };
const document = { schemaVersion: 2, header: { name: "旧名字", headline: "", contact: "", summary: "" }, sections: [], pageBreaks: [], decoration: null, decorationFooter: null, layout: { template: "classic", fontSize: 14, accent: "purple" } };
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const reg = await ctx.request.post(base + "/api/auth/register", { data: { email, password } });
  assert.equal(reg.status(), 201);
  const s = await reg.json();
  const h = { "X-CSRF-Token": s.csrf, "Content-Type": "application/json" };
  assert.equal((await ctx.request.put(base + "/api/profile", { headers: h, data: { profile, revision: 0 } })).status(), 200);
  assert.equal((await ctx.request.post(base + "/api/resumes", { headers: h, data: { title: "照片测试简历", body: { document } } })).status(), 201);
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  await page.goto(base + "/#resume", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "从个人信息整理" }).first().click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".document-photo-main").count(), 1);
  assert.equal(await page.locator(".document-photo-main").getAttribute("src"), photo);
  console.log("PASS resume studio imports profile photo");
  await page.locator(".studio-photo-tools .photo-add input").setInputFiles("tests/fixtures/qa-resume.png");
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".document-photo-strip img").count(), 2);
  await page.getByRole("button", { name: "保存当前版本", exact: true }).click();
  await page.waitForTimeout(900);
  await page.reload(); await page.waitForTimeout(1000);
  assert.equal(await page.locator(".document-photo-strip img").count(), 2);
  console.log("PASS resume studio uploads and persists a second photo");
} catch (e) {
  console.log("FAIL resume photos", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
  await browser.close();
}
