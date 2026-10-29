import assert from "node:assert/strict";
import fs from "node:fs";
const base = "http://127.0.0.1:5173";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const users = [];
async function account(i) {
  const email = "qa-queue-" + Date.now() + "-" + i + "@example.invalid";
  const password = "QA-Queue-12345!";
  const r = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "队列" + i }) });
  assert.equal(r.status, 201);
  const s = await r.json(); const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { email, cookie, csrf: s.csrf };
}
async function req(u, path, method = "GET") {
  const r = await fetch(base + "/api" + path, { method, headers: { Cookie: u.cookie, "X-CSRF-Token": u.csrf } });
  return { status: r.status, data: await r.json() };
}
try {
  for (let i = 0; i < 4; i++) users.push(await account(i));
  const slots = [];
  for (const u of users) { const r = await req(u, "/interview/queue", "POST"); assert.equal(r.status, 200); slots.push(r.data); }
  assert.deepEqual(slots.slice(0, 3).map((x) => x.state), ["active", "active", "active"]);
  assert.equal(slots[3].state, "queued"); assert.equal(slots[3].position, 1);
  console.log("PASS interview queue caps at 3 and queues 4th");
  const del = await req(users[0], "/interview/queue/" + slots[0].token, "DELETE"); assert.equal(del.status, 200);
  const promoted = await req(users[3], "/interview/queue/" + slots[3].token); assert.equal(promoted.data.state, "active");
  console.log("PASS queued user promoted after slot release");
  for (let i = 1; i < 4; i++) await req(users[i], "/interview/queue/" + slots[i].token, "DELETE");
} catch (e) {
  console.log("FAIL interview queue", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const all = await (await fetch(base + "/api/admin/users", { headers: h })).json(); for (const u of users) { const me = all.users.find((x) => x.email === u.email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); } }
  } catch {}
}
