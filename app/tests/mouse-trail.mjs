import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await page.goto(base + "/#home", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(800);
  const cv = page.locator(".mouse-trail-canvas");
  assert.equal(await cv.count(), 1);
  assert.equal(await cv.evaluate((el) => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
  await page.mouse.move(300, 300); await page.mouse.move(500, 400, { steps: 10 }); await page.waitForTimeout(500);
  const painted = await cv.evaluate((el) => { const ctx = el.getContext("2d"); const d = ctx.getImageData(0, 0, el.width, el.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  assert.ok(painted > 20, "trail did not paint");
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(0, 0, 0)");
  console.log("PASS bigdata tendril trail on transparent canvas, painted pixels", painted);
} catch (e) {
  console.log("FAIL mouse trail", e.message); process.exitCode = 1;
} finally { await browser.close(); }
