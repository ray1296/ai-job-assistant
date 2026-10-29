import assert from "node:assert/strict";
import fs from "node:fs";
const base = "http://127.0.0.1:5173";
const email = "qa-photo-" + Date.now() + "@example.invalid";
const password = "PhotoTest12345";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lV8hAAAAAElFTkSuQmCC";
let cookie = "", csrf = "";
async function req(path, method = "GET", body, headers = {}) {
  const h = { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(base + "/api" + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}
try {
  let r = await req("/auth/register", "POST", { email, password });
  assert.equal(r.status, 201);
  cookie = (r.headers.get("set-cookie") || "").split(";")[0]; csrf = r.data.csrf;
  const profile = { name: "照片测试", phone: "", email, summary: "", skills: "", honors: "", notes: "", photos: [photo], cities: [], directions: [], education: [], projects: [], experience: [] };
  r = await req("/profile", "PUT", { profile, revision: 0 });
  assert.equal(r.status, 200);
  r = await req("/profile");
  assert.equal(r.data.profile.photos.length, 1);
  assert.equal(r.data.profile.photos[0], photo);
  console.log("PASS profile photo persisted");

  r = await req("/profile", "PUT", { profile: { ...profile, photos: [photo, photo, photo, photo] }, revision: 1 });
  assert.equal(r.status, 400);
  console.log("PASS max three photos enforced");

  const document = { schemaVersion: 2, header: { name: "照片测试", headline: "", contact: "", summary: "", photos: [photo] }, sections: [], pageBreaks: [], decoration: null, decorationFooter: null, layout: { template: "classic", fontSize: 14, accent: "purple" } };
  r = await req("/resumes", "POST", { title: "照片简历", body: { document } });
  assert.equal(r.status, 201);
  const id = r.data.resume.id;
  r = await req("/resumes/" + id);
  assert.equal(r.data.resume.body.document.header.photos[0], photo);
  console.log("PASS resume document photo persisted");
  await req("/resumes/" + id, "DELETE", { revision: 1 });
} catch (e) {
  console.log("FAIL photos", e.message); process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
  } catch {}
}
