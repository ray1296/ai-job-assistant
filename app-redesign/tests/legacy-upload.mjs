import assert from "node:assert/strict";
import fs from "node:fs";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const email = "qa-legacy-" + Date.now() + "@example.invalid";
const password = "QA-Legacy-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
let cookie = "", csrf = "", subjectId = "", versionId = "";
async function req(path, method = "GET", body, headers = {}) {
  const h = { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...headers };
  if (body !== undefined) h["Content-Type"] = h["Content-Type"] || "application/json";
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
try {
  const reg = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "旧版上传测试" }) });
  cookie = (reg.headers.get("set-cookie") || "").split(";")[0]; csrf = (await reg.json()).csrf;
  let r = await req("/api/subject/create", "POST", { name: "QA-旧版上传-" + Date.now() });
  assert.equal(r.status, 201); subjectId = r.data.id || r.data.subject?.id;
  assert.ok(subjectId);
  r = await req("/api/subject/list"); assert.equal(r.status, 200); assert.ok(r.data.some((x) => x.id === subjectId));
  r = await req("/api/version/create", "POST", { subjectId, name: "QA旧版题库" });
  assert.equal(r.status, 201); versionId = r.data.id;
  const text = fs.readFileSync("tests/fixtures/qa-questions.txt", "utf8");
  r = await req("/api/material/parse-file", "POST", { name: "qa-questions.txt", text });
  assert.equal(r.status, 200); assert.ok(r.data.questions.length >= 2);
  r = await req("/api/material/upload-questions", "POST", { versionId, title: "QA手动上传", items: r.data.questions.map((q) => ({ stem: q.stem, answer: q.answer, type: "short" })) });
  assert.equal(r.status, 200); assert.ok(r.data.appended >= 2);
  r = await req("/api/material/knowledge/list?versionId=" + versionId);
  assert.equal(r.status, 200); assert.ok(r.data.length >= 2);
  const knowledgeText = fs.readFileSync("tests/fixtures/qa-knowledge.md", "utf8");
  r = await req("/api/material/upload-knowledge", "POST", { subjectId, versionId, title: "QA知识点", items: [{ title: "QA知识点", content: knowledgeText, quickAnswer: "QA" }] });
  assert.equal(r.status, 200); assert.ok(r.data.appended >= 1);
  console.log("PASS legacy subject/version/parse/upload/knowledge flow");
  await req("/api/version/" + versionId, "DELETE");
  await req("/api/subject/" + subjectId, "DELETE");
  versionId = ""; subjectId = "";
  console.log("RESULT 1 passed");
} catch (e) {
  console.log("FAIL legacy upload", e.message);
  process.exitCode = 1;
} finally {
  try {
    const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
    if (l.ok) {
      const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json();
      const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" };
      const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = (users.users || []).find((u) => u.email === email);
      if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h });
    }
  } catch {}
}
