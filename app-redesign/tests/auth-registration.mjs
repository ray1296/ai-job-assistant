import assert from "node:assert/strict";
import fs from "node:fs";
const base = "http://127.0.0.1:5173";
const email = "qa-auth-" + Date.now() + "@example.invalid";
const password = "AuthTest12345";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
let cookie = "", csrf = "";
async function req(path, method = "GET", body, headers = {}) {
  const h = { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers };
  if (body !== undefined) h["Content-Type"] = h["Content-Type"] || "application/json";
  const r = await fetch(base + "/api" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}
try {
  let r = await req("/auth/register", "POST", { email: "not-an-email", password });
  assert.equal(r.status, 400);
  r = await req("/auth/register", "POST", { email, password: "onlyletters" });
  assert.equal(r.status, 400);
  r = await req("/auth/register", "POST", { email, password: "1234567890" });
  assert.equal(r.status, 400);
  console.log("PASS invalid email / letters-only / digits-only rejected");

  r = await req("/auth/register", "POST", { email, password, displayName: "登录测试" });
  assert.equal(r.status, 201);
  cookie = (r.headers.get("set-cookie") || "").split(";")[0]; csrf = r.data.csrf;
  assert.equal(r.data.user.email, email);
  console.log("PASS valid registration");

  r = await req("/auth/register", "POST", { email, password });
  assert.equal(r.status, 409);
  console.log("PASS duplicate registration rejected");

  r = await req("/auth/logout", "POST");
  assert.equal(r.status, 200);
  cookie = ""; csrf = "";
  r = await req("/auth/login", "POST", { email, password });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, email);
  cookie = (r.headers.get("set-cookie") || "").split(";")[0]; csrf = r.data.csrf;
  console.log("PASS registration then login");

  r = await req("/auth/login", "POST", { email, password: "wrongPass123" });
  assert.equal(r.status, 401);
  console.log("PASS wrong password rejected");
} catch (e) {
  console.log("FAIL auth registration", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
}
