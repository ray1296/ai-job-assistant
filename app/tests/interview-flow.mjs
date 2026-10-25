import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const email = "qa-interview-" + Date.now() + "@example.invalid";
const password = "QA-Interview-123!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const adminEmail = initial.match(/email:\s*(.+)/)[1].trim();
const adminPassword = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["camera", "microphone"] });
let errors = [];
try {
  const reg = await ctx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "面试UI测试" } });
  assert.equal(reg.status(), 201);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  await p.goto(base + "/#interview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const start = p.getByRole("button", { name: "开始模拟面试" });
  await start.waitFor();
  await start.click();
  await p.waitForTimeout(18000);
  const text = await p.locator("body").innerText();
  assert.ok(text.includes("结束面试") || text.includes("正在说话") || text.includes("面试中") || text.includes("说完了"), "interview did not enter room");
  const video = await p.locator("video").count();
  console.log("PASS interview start with fake media; video elements=" + video);
  console.log("INFO body excerpt", text.slice(-500));
  console.log("ERRORS", errors.slice(0, 6));
  assert.equal(errors.filter((x) => !/favicon|Failed to load resource|TensorFlow Lite|XNNPACK/.test(x)).length, 0);
  console.log("PASS interview no page errors");
} catch (e) {
  console.log("FAIL interview", e.message);
  process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword, role: "admin" }) });
    if (l.ok) {
      const cookie = (l.headers.get("set-cookie") || "").split(";")[0];
      const s = await l.json();
      const h = { Cookie: cookie, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" };
      const users = await (await fetch(base + "/api/admin/users", { headers: h })).json();
      const me = (users.users || []).find((u) => u.email === email);
      if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h });
    }
  } catch {}
  await browser.close();
}
