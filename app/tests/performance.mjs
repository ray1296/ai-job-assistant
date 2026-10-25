import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const email = initial.match(/email:\s*(.+)/)[1].trim();
const password = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/login", { data: { email, password, role: "admin" } });
const p = await ctx.newPage();
async function measure(hash) {
  const started = Date.now();
  await p.goto(base + "/#" + hash, { waitUntil: "load" });
  await p.waitForTimeout(600);
  const nav = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] || {};
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      dom: Math.round(n.domContentLoadedEventEnd || 0),
      load: Math.round(n.loadEventEnd || 0),
      transfer: Math.round(n.transferSize || 0),
      fcp: fcp ? Math.round(fcp.startTime) : null,
    };
  });
  console.log("PERF", hash, nav, "wall=" + (Date.now() - started) + "ms");
  return nav;
}
const home = await measure("home");
const knowledge = await measure("knowledge");
const jobs = await measure("jobs");
const dashboard = await measure("dashboard");
assert.ok(home.load < 5000, "home load too slow");
assert.ok(home.fcp === null || home.fcp < 2500, "home FCP too slow");
assert.ok(knowledge.load < 5000);
assert.ok(jobs.load < 5000);
assert.ok(dashboard.load < 5000);
const apiTimes = {};
for (const path of ["/api/jobs?pageSize=12", "/api/questions?pageSize=12", "/api/dashboard/summary"]) {
  const t = Date.now();
  const r = await ctx.request.get(base + path);
  apiTimes[path] = { status: r.status(), ms: Date.now() - t };
  assert.equal(r.status(), 200);
}
console.log("API", apiTimes);
console.log("PASS performance lab measurements");
await browser.close();
