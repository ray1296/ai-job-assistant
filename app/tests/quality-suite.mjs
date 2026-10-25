import assert from "node:assert/strict";
import fs from "node:fs";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const email = "qa-quality-" + Date.now() + "@example.invalid";
const password = "QA-Quality-123!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const adminEmail = initial.match(/email:\s*(.+)/)[1].trim();
const adminPassword = initial.match(/password:\s*(.+)/)[1].trim();
let cookie = "", csrf = "";
let passed = 0, failed = 0;
const pass = (n) => { passed++; console.log("PASS", n); };
const fail = (n, e) => { failed++; console.log("FAIL", n, e?.message || e); };
async function req(path, method = "GET", body, headers = {}) {
  const h = { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers };
  if (body !== undefined && !(body instanceof Buffer)) h["Content-Type"] = h["Content-Type"] || "application/json";
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}
try {
  const reg = await req("/api/auth/register", "POST", { email, password, displayName: "质量测试" });
  assert.equal(reg.status, 201);
  const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  cookie = (login.headers.get("set-cookie") || "").split(";")[0]; csrf = (await login.json()).csrf;
  pass("quality account");

  let r = await fetch(base + "/");
  const csp = r.headers.get("content-security-policy") || "";
  assert.ok(csp.includes("form-action 'self'"));
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
  pass("security headers");

  r = await fetch(base + "/assets/main.js", { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-encoding"), "gzip");
  const body = await r.text();
  assert.ok(body.length > 0);
  pass("gzip static asset");

  for (const path of ["/private/ai-config.json", "/app/private/ai-config.json", "/orig/../server/index.mjs"]) {
    const x = await fetch(base + path);
    assert.equal(x.status, 404, path);
  }
  pass("private/static traversal blocked");

  r = await req("/api/questions?pageSize=999");
  assert.equal(r.status, 400);
  r = await req("/api/does-not-exist");
  assert.equal(r.status, 404);
  pass("malformed API inputs");

  const bad = Buffer.from("not a dataset");
  r = await req("/api/datasets", "POST", bad, { "Content-Type": "application/octet-stream", "X-Category": "jobs", "X-File-Name": "bad.exe" });
  assert.equal(r.status, 415);
  pass("invalid upload extension rejected");

  const big = Buffer.alloc(9 * 1024 * 1024, 65);
  r = await req("/api/datasets", "POST", big, { "Content-Type": "text/csv", "X-Category": "jobs", "X-File-Name": "big.csv" });
  assert.equal(r.status, 413);
  pass("oversized upload rejected");

  const started = Date.now();
  const reads = await Promise.all(Array.from({ length: 20 }, () => req("/api/questions?pageSize=12")));
  const ok = reads.filter((x) => x.status === 200).length;
  assert.equal(ok, 20);
  console.log("INFO 20 concurrent question reads", Date.now() - started, "ms");
  pass("20 concurrent reads");

  const xss = "<img src=x onerror=window.__qaXss=1>质量测试";
  r = await req("/api/wishes", "POST", { text: xss });
  assert.equal(r.status, 201);
  const wishId = r.data.item.id;
  const browserModule = await import("playwright-core");
  const b = await browserModule.chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
  const ctx = await b.newContext();
  await ctx.addCookies([{ name: "career_session", value: cookie.split("=")[1], domain: "127.0.0.1", path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(base + "/#wish", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(800);
  assert.equal(await p.evaluate(() => window.__qaXss), undefined);
  assert.ok((await p.locator("body").innerText()).includes("<img") || (await p.locator("body").innerText()).includes("质量测试"));
  await b.close();
  await req("/api/wishes/" + wishId, "DELETE");
  pass("wish XSS rendered as text");

  console.log("RESULT", passed, "passed", failed, "failed");
} catch (e) {
  fail("quality suite", e);
  console.log("RESULT", passed, "passed", failed, "failed");
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword, role: "admin" }) });
    if (l.ok) {
      const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json();
      const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" };
      const users = await (await fetch(base + "/api/admin/users", { headers: h })).json();
      const me = (users.users || []).find((u) => u.email === email);
      if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h });
    }
  } catch {}
  process.exit(failed ? 1 : 0);
}
