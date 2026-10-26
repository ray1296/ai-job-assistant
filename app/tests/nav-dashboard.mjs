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
  await page.goto(base + "/#jobs", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  await page.locator(".sky-brand").click(); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => location.hash), "#home");
  assert.match(await page.locator("h1").first().innerText(), /每一步/);
  console.log("PASS logo click returns to home");

  await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(300);
  await page.locator(".sky-brand").click(); await page.waitForTimeout(1200);
  assert.ok((await page.evaluate(() => window.scrollY)) < 20);
  console.log("PASS logo click on home scrolls to top");

  await page.goto(base + "/#dashboard", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(1200);
  assert.equal(await page.locator(".dash-dark-head h2").evaluate((el) => getComputedStyle(el).textAlign), "center");
  assert.equal(await page.locator(".dash-dark-exit").count(), 0);
  await page.getByRole("button", { name: /全屏大屏/ }).click(); await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), true);
  assert.equal(await page.locator(".dash-dark-exit").count(), 1);
  await page.locator(".dash-dark-exit").click(); await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
  console.log("PASS dashboard fullscreen exit button and centered title");
} catch (e) {
  console.log("FAIL nav/dashboard", e.message); process.exitCode = 1;
} finally { await browser.close(); }
