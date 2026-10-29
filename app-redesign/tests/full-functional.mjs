import assert from "node:assert/strict";
import fs from "node:fs";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const stamp = Date.now();
const email = "qa-" + stamp + "@example.invalid";
const password = "QA-Only-Strong-123!";
let cookie = "", csrf = "";
let adminCookie = "", adminCsrf = "";
let userId = "", subjectId = "", versionId = "", wishId = "", datasetId = "";
let passed = 0, failed = 0;
const pass = (name) => { passed++; console.log("PASS", name); };
const fail = (name, e) => { failed++; console.log("FAIL", name, e?.message || e); };
const initial = (() => { try { return fs.readFileSync("private/admin-initial.txt", "utf8"); } catch { return ""; } })();
const adminEmail = process.env.TEST_ADMIN_EMAIL || (initial.match(/email:\s*(.+)/)?.[1] || "").trim();
const adminPassword = process.env.TEST_ADMIN_PASSWORD || (initial.match(/password:\s*(.+)/)?.[1] || "").trim();

async function req(path, method = "GET", body, headers = {}, auth = "user") {
  const c = auth === "admin" ? adminCookie : auth === "user" ? cookie : "";
  const t = auth === "admin" ? adminCsrf : csrf;
  const h = { ...(c ? { Cookie: c } : {}), ...(t ? { "X-CSRF-Token": t } : {}), ...headers };
  if (body !== undefined) h["Content-Type"] = h["Content-Type"] || "application/json";
  const r = await fetch(base + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data, headers: r.headers };
}

async function login(path, payload) {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const c = (r.headers.get("set-cookie") || "").split(";")[0];
  const j = await r.json();
  return { c, j, status: r.status };
}

async function ensureAdmin() {
  if (adminCookie) return;
  const a = await login("/api/auth/login", { email: adminEmail, password: adminPassword, role: "admin" });
  if (a.status === 200) { adminCookie = a.c; adminCsrf = a.j.csrf; }
}
async function cleanup() {
  try {
    if (datasetId && cookie) await req("/api/datasets/" + datasetId, "DELETE");
    if (versionId && cookie) await req("/api/study/versions/" + versionId, "DELETE");
    if (subjectId && cookie) await req("/api/study/subjects/" + subjectId, "DELETE");
    await ensureAdmin();
    if (adminCookie && !userId) {
      const users = await req("/api/admin/users", "GET", undefined, undefined, "admin");
      const me = (users.data?.users || []).find((x) => x.email === email);
      if (me) userId = me.id;
    }
    if (adminCookie && userId) {
      if (wishId) await req("/api/wishes/" + wishId, "DELETE", undefined, {}, "admin");
      await req("/api/admin/users/" + userId, "DELETE", undefined, {}, "admin");
    }
  } catch (e) { console.log("CLEANUP WARNING", e?.message || e); }
}

try {
  let r = await req("/api/health", "GET", undefined, undefined, "anon");
  assert.equal(r.status, 200);
  pass("health endpoint");

  const reg = await login("/api/auth/register", { email, password, displayName: "测试同学" });
  assert.equal(reg.status, 201);
  cookie = reg.c; csrf = reg.j.csrf;
  assert.equal(reg.j.user.displayName, "测试同学");
  pass("register with display name and CSRF session");

  r = await req("/api/auth/session");
  assert.equal(r.status, 200); assert.equal(r.data.user.email, email);
  pass("session restore");

  r = await req("/api/account", "PATCH", { displayName: "测试同学QA" });
  assert.equal(r.status, 200); assert.equal(r.data.user.displayName, "测试同学QA");
  pass("account display name update");

  const profile = {
    name: "测试同学", email: "", phone: "", summary: "QA 测试资料",
    cities: ["上海"], directions: ["前端"],
    education: [{ title: "测试大学", period: "2022-2026", detail: "测试" }],
    projects: [], experience: [], skills: "Vue / TypeScript", honors: "",
  };
  r = await req("/api/profile", "PUT", { profile, revision: 0 });
  assert.equal(r.status, 200);
  r = await req("/api/profile");
  assert.equal(r.status, 200); assert.equal(r.data.profile.name, "测试同学");
  pass("profile save and reload");

  const doc = {
    schemaVersion: 2,
    header: { name: "测试同学", headline: "前端", contact: "", summary: "" },
    sections: [{ id: "sec1", title: "教育", items: [{ id: "item1", title: "测试大学", meta: "2022-2026", content: "测试" }] }],
    pageBreaks: [], decoration: null, decorationFooter: null,
    layout: { template: "compact", fontSize: 15, accent: "navy" },
  };
  r = await req("/api/resumes", "POST", { title: "QA简历", body: { document: doc } });
  assert.equal(r.status, 201);
  const resumeId = r.data.resume.id;
  r = await req("/api/resumes");
  assert.ok(r.data.resumes.some((x) => x.id === resumeId));
  r = await req("/api/resumes/" + resumeId);
  assert.equal(r.status, 200); assert.equal(r.data.resume.body.document.header.name, "测试同学");
  pass("resume create/list/detail");

  r = await req("/api/jobs?pageSize=3");
  assert.equal(r.status, 200); assert.ok(r.data.jobs.length > 0);
  const job = r.data.jobs[0];
  r = await req("/api/jobs/facets");
  assert.equal(r.status, 200); assert.ok(r.data.directions.length > 0);
  r = await req("/api/jobs/" + job.id);
  assert.equal(r.status, 200); assert.equal(r.data.job.id, job.id);
  pass("job list/facets/detail");

  r = await req("/api/job-intents", "PUT", { jobIds: [job.id], expected: [] });
  assert.equal(r.status, 200);
  r = await req("/api/job-intents");
  assert.ok(r.data.jobIds.includes(job.id));
  r = await req("/api/application-plan");
  assert.equal(r.status, 200);
  pass("job intent and application plan");

  const csv = "岗位名称,公司,城市,薪资,学历,详细地址,链接,备注\nQA前端,测试公司,上海,20-30K,本科,上海测试路,https://example.com,QA\n";
  r = await req("/api/datasets", "POST", csv, {
    "Content-Type": "text/csv",
    "X-Category": "jobs",
    "X-File-Name": encodeURIComponent("qa-jobs.csv"),
  });
  assert.equal(r.status, 201);
  datasetId = r.data.dataset.id;
  assert.ok(r.data.dataset.rowCount >= 1);
  r = await req("/api/datasets");
  assert.ok(r.data.datasets.some((x) => x.id === datasetId));
  r = await req("/api/datasets/" + datasetId);
  assert.equal(r.status, 200);
  pass("dataset CSV upload/list/detail");

  r = await req("/api/dashboard/summary");
  assert.equal(r.status, 200);
  r = await req("/api/companies?q=字节");
  assert.equal(r.status, 200); assert.ok(r.data.companies.length > 0);
  r = await req("/api/housing?city=杭州&maxRent=3000");
  assert.equal(r.status, 200); assert.ok(r.data.items.length > 0);
  pass("dashboard/companies/housing");

  r = await req("/api/questions?pageSize=2");
  assert.equal(r.status, 200); assert.ok(r.data.questions.length > 0);
  const q = r.data.questions[0];
  r = await req("/api/questions/facets");
  assert.equal(r.status, 200);
  r = await req("/api/questions/" + q.id);
  assert.equal(r.status, 200);
  r = await req("/api/questions/" + q.id + "/state", "PUT", { favorite: true, revision: 0 });
  assert.equal(r.status, 200); assert.equal(r.data.question.state.favorite, true);
  r = await req("/api/learning/summary");
  assert.equal(r.status, 200);
  pass("knowledge list/detail/favorite/summary");

  r = await req("/api/study/subjects");
  assert.equal(r.status, 200);
  r = await req("/api/study/subjects", "POST", { name: "QA-测试科目-" + stamp });
  assert.equal(r.status, 201); subjectId = r.data.subject.id;
  r = await req("/api/study/subjects/" + subjectId + "/versions", "POST", { name: "QA平台版", fromCatalog: "Java后端", limit: 3 });
  assert.equal(r.status, 201); versionId = r.data.version.id;
  r = await req("/api/study/versions/" + versionId + "/questions");
  assert.equal(r.status, 200); assert.ok(r.data.questions.length > 0);
  const sq = r.data.questions[0];
  r = await req("/api/study/questions/" + sq.id + "/attempt", "POST", { correct: true });
  assert.equal(r.status, 200);
  r = await req("/api/material/subject/" + subjectId + "?versionId=" + versionId);
  assert.equal(r.status, 200); assert.ok(r.data.flashcards.length > 0);
  r = await req("/api/question/" + q.id + "/favorite", "POST");
  assert.equal(r.status, 200);
  r = await req("/api/exam/wrong-questions/" + q.id, "POST");
  assert.equal(r.status, 200);
  pass("study subject/version/questions/attempt/review/favorite/wrong");

  r = await req("/api/study/subjects/" + subjectId + "/versions", "POST", { name: "QA上传版", questions: [{ type: "short", stem: "QA上传题？", answer: "QA答案" }] });
  assert.equal(r.status, 201);
  const uploadedVersion = r.data.version.id;
  r = await req("/api/study/versions/" + uploadedVersion + "/questions");
  assert.equal(r.status, 200); assert.ok(r.data.questions.some((x) => x.stem === "QA上传题？"));
  passed++; console.log("PASS study question upload");
  await req("/api/study/versions/" + uploadedVersion, "DELETE");

  r = await req("/api/ai/rag/ask", "POST", { query: "Nacos 在微服务架构中起什么作用？" });
  assert.equal(r.status, 200); assert.ok(r.data.answer); assert.ok(r.data.sources.length > 0);
  pass("RAG answer with sources");

  r = await req("/api/mcp", "POST", { jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.equal(r.status, 200); assert.ok(r.data.result.serverInfo);
  r = await req("/api/mcp", "POST", { jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.ok(r.data.result.tools.length > 0);
  pass("MCP initialize/tools list");

  r = await req("/api/agents");
  assert.equal(r.status, 200); assert.ok(r.data.agents.length >= 4);
  r = await req("/api/agents/tool-call", "POST", { name: "search_jobs", arguments: { keyword: "前端", city: "上海" } });
  assert.equal(r.status, 200); assert.ok(r.data.result.items);
  pass("agents and tool-call");

  r = await req("/api/interview/turn-check", "POST", { message: "我叫测试同学，做过前端项目。", lastQuestion: "请自我介绍" });
  assert.equal(r.status, 200); assert.ok(["true", "false", "unsure"].includes(r.data.done));
  pass("interview turn-check");

  r = await req("/api/companion/chat", "POST", { message: "查一下字节跳动公司怎么样", persona: "星野" });
  assert.equal(r.status, 200); assert.ok(r.data.reply); assert.ok((r.data.tools || []).includes("company_review") || (r.data.tools || []).includes("search_jobs"));
  pass("companion chat + Tool RAG");

  r = await req("/api/ai/status");
  assert.equal(r.status, 200);
  pass("AI status");

  const wishText = "QA 测试心愿 " + stamp;
  r = await req("/api/wishes", "POST", { text: wishText });
  assert.equal(r.status, 201); wishId = r.data.item.id;
  r = await req("/api/wishes");
  assert.ok(r.data.items.some((x) => x.id === wishId));
  pass("wish create/list");

  const admin = await login("/api/auth/login", { email: adminEmail, password: adminPassword, role: "admin" });
  assert.equal(admin.status, 200); adminCookie = admin.c; adminCsrf = admin.j.csrf;
  r = await req("/api/admin/stats", "GET", undefined, undefined, "admin");
  assert.equal(r.status, 200);
  r = await req("/api/admin/users", "GET", undefined, undefined, "admin");
  const me = (r.data.users || []).find((x) => x.email === email);
  assert.ok(me); userId = me.id;
  assert.ok(!Object.keys(me).some((k) => /password/i.test(k)));
  pass("admin stats/users privacy");

  r = await req("/api/wishes/" + wishId, "PATCH", { done: true }, {}, "admin");
  assert.equal(r.status, 200); assert.equal(r.data.item.done, true);
  r = await req("/api/wishes/" + wishId, "DELETE", undefined, {}, "admin");
  assert.equal(r.status, 200); wishId = "";
  pass("admin wish update/delete");

  const other = await login("/api/auth/login", { email, password });
  assert.equal(other.status, 200);
  r = await req("/api/account/password", "POST", { currentPassword: password, newPassword: "QA-Only-New-123!" });
  assert.equal(r.status, 200);
  const old = await fetch(base + "/api/profile", { headers: { Cookie: other.c } });
  assert.equal(old.status, 401);
  const current = await fetch(base + "/api/profile", { headers: { Cookie: cookie } });
  assert.equal(current.status, 200);
  pass("password change revokes other sessions");

  console.log("RESULT", passed, "passed", failed, "failed");
} catch (e) {
  fail("functional suite", e);
  console.log("RESULT", passed, "passed", failed, "failed");
} finally {
  await cleanup();
  process.exit(failed ? 1 : 0);
}
