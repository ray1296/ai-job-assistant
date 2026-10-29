import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const email = initial.match(/email:\s*(.+)/)[1].trim();
const password = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/login", { data: { email, password, role: "admin" } });
const page = await ctx.newPage();
try {
  await page.goto(base + "/#profile", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(900);
  const consent = page.locator(".ai-consent");
  assert.equal(await consent.count(), 1);
  const box = await consent.locator("input[type=checkbox]").boundingBox();
  const label = await consent.boundingBox();
  assert.ok(box && label);
  assert.ok(box.width <= 22 && box.height <= 22, "checkbox should not stretch full width");
  assert.ok(box.x >= label.x && box.x < label.x + 40, "checkbox should sit inline at label start");
  assert.ok(box.y < label.y + 20, "checkbox should be on the same first line");
  console.log("PASS resume consent checkbox inline with text");
} catch (e) {
  console.log("FAIL resume consent", e.message); process.exitCode = 1;
} finally { await browser.close(); }
