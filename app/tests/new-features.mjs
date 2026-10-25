import assert from "node:assert/strict";
import fs from "node:fs";
const base = "http://127.0.0.1:5173";
const email = "qa-new-" + Date.now() + "@example.invalid";
const password = "QA-New-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
let cookie = "", csrf = "", adminCookie = "", adminCsrf = "", wishId = "", approvedId = "", annId = "";
async function req(path, method = "GET", body, headers = {}, as = "user") {
  const h = { ...(as === "admin" ? { Cookie: adminCookie, "X-CSRF-Token": adminCsrf } : { Cookie: cookie, "X-CSRF-Token": csrf }), ...headers };
  if (body !== undefined && !(body instanceof Buffer)) h["Content-Type"] = h["Content-Type"] || "application/json";
  const r = await fetch(base + "/api" + path, { method, headers: h, body: body === undefined ? undefined : body instanceof Buffer ? body : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
try {
  let r = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "新功能测试" }) });
  cookie = (r.headers.get("set-cookie") || "").split(";")[0]; csrf = (await r.json()).csrf;
  const al = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
  adminCookie = (al.headers.get("set-cookie") || "").split(";")[0]; adminCsrf = (await al.json()).csrf;

  r = await req("/guide");
  assert.equal(r.status, 200); assert.ok(r.data.sections.some((x) => x.id === "wish"));
  console.log("PASS guide content endpoint");

  r = await req("/agents/tool-call", "POST", { name: "project_guide", arguments: { topic: "心愿审核" } });
  assert.equal(r.status, 200); assert.ok((r.data.result.text || "").includes("审核"));
  console.log("PASS project_guide AI tool");

  r = await req("/companion/chat", "POST", { persona: "星野", message: "Nacos 在微服务里有什么作用？" });
  assert.equal(r.status, 200); assert.ok(Array.isArray(r.data.ragSources) && r.data.ragSources.length > 0);
  console.log("PASS all agents default RAG context");

  r = await req("/wishes", "POST", { text: "待审核心愿 " + Date.now() });
  assert.equal(r.status, 201); assert.equal(r.data.item.status, "pending"); wishId = r.data.item.id;
  r = await req("/wishes"); assert.equal(r.status, 200); assert.ok(r.data.items.some((x) => x.id === wishId && x.status === "pending"));
  r = await req("/wishes/" + wishId, "DELETE"); assert.equal(r.status, 200);
  console.log("PASS pending wish visible/withdrawable");

  r = await req("/wishes", "POST", { text: "审核通过心愿 " + Date.now() });
  approvedId = r.data.item.id;
  r = await req("/wishes/" + approvedId, "PATCH", { status: "approved", done: true }, {}, "admin");
  assert.equal(r.status, 200); assert.equal(r.data.item.status, "approved");
  r = await req("/wishes/" + approvedId, "DELETE"); assert.equal(r.status, 409);
  console.log("PASS approved wish cannot be withdrawn by user");

  r = await req("/announcements", "POST", { title: "QA 通告", body: "这是一条测试通告正文。" }, {}, "admin");
  assert.equal(r.status, 201); annId = r.data.item.id;
  r = await req("/announcements"); assert.equal(r.status, 200); assert.ok(r.data.items.some((x) => x.id === annId));
  r = await req("/announcements/" + annId, "PATCH", { active: false }, {}, "admin"); assert.equal(r.status, 200);
  r = await req("/announcements"); assert.ok(!r.data.items.some((x) => x.id === annId));
  console.log("PASS announcement publish/read/offline");

  for (const [file, expect] of [["tests/fixtures/qa-resume.docx", "测试同学"], ["tests/fixtures/qa-resume.pdf", "测试同学"], ["tests/fixtures/qa-data.xlsx", "上海"]]) {
    const buf = fs.readFileSync(file);
    const name = file.split("/").pop();
    const res = await fetch(base + "/api/ai/extract-text?filename=" + encodeURIComponent(name), { method: "POST", headers: { Cookie: cookie, "X-CSRF-Token": csrf, "Content-Type": "application/octet-stream" }, body: buf });
    const d = await res.json();
    assert.equal(res.status, 200, JSON.stringify(d));
    assert.ok(String(d.text || "").includes(expect), file + " missing " + expect);
    console.log("PASS extract", name, d.chars, "chars");
  }

  r = await req("/geo/subway-lines?city=" + encodeURIComponent("上海"));
  assert.equal(r.status, 200); const stations = (r.data.lines || []).flatMap((l) => l.stations || []);
  assert.ok(stations.length > 25); console.log("PASS dynamic subway stations", stations.length);
} catch (e) {
  console.log("FAIL new features", e.message); process.exitCode = 1;
} finally {
  try {
    if (annId) await req("/announcements/" + annId, "DELETE", undefined, {}, "admin");
    if (approvedId) await req("/wishes/" + approvedId, "DELETE", undefined, {}, "admin");
    const users = await req("/admin/users", "GET", undefined, {}, "admin");
    const me = (users.data.users || []).find((u) => u.email === email);
    if (me) await req("/admin/users/" + me.id, "DELETE", undefined, {}, "admin");
  } catch {}
}
