import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(base + "/#home", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  const toNight = page.getByRole("button", { name: "切换到夜间主题" });
  assert.equal(await toNight.count(), 1);
  await toNight.click(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "night");
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.ok(bodyBg !== "rgb(250, 248, 253)", "night body should be dark");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "night");
  const toDay = page.getByRole("button", { name: "切换到日间主题" });
  assert.equal(await toDay.count(), 1);
  await toDay.click(); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  console.log("PASS theme toggle: default light, night, reload persistence, back to day");
} catch (e) {
  console.log("FAIL theme toggle", e.message); process.exitCode = 1;
} finally { await browser.close(); }
