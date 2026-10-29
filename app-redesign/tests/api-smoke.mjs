import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "career-api-test-"));
let proc, url;
let checks = 0;
async function start() {
  proc = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", CAREER_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server start timeout")),
      10000,
    );
    proc.stdout.on("data", (b) => {
      stdout += b;
      const m = stdout.match(/listening on ([0-9]+)/);
      if (m) {
        url = "http://127.0.0.1:" + m[1];
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("error", reject);
    proc.on("exit", (c) => {
      if (!stdout.includes("listening"))
        reject(new Error("server exited " + c));
    });
  });
}
async function stop() {
  if (!proc || proc.exitCode !== null) return;
  await new Promise((r) => {
    proc.once("exit", r);
    proc.kill("SIGTERM");
  });
}
const pass = (n) => {
  checks++;
  console.log("PASS", n);
};
function client() {
  return { cookie: "", csrf: "" };
}
async function req(c, p, method = "GET", body, headers = {}) {
  const r = await fetch(url + p, {
    method,
    headers: {
      ...(c.cookie ? { cookie: c.cookie } : {}),
      ...(c.csrf ? { "X-CSRF-Token": c.csrf } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  if (r.headers.get("set-cookie"))
    c.cookie = r.headers.get("set-cookie").split(";")[0];
  if (data.csrf) c.csrf = data.csrf;
  return { status: r.status, data, headers: r.headers };
}
try {
  await start();
  const a = client(),
    b = client(),
    anon = client();
  let r = await req(anon, "/api/profile");
  assert.equal(r.status, 401);
  pass("unauthenticated private data blocked");
  r = await req(a, "/api/auth/register", "POST", {
    email: "alpha@example.invalid",
    password: "Test-Only-Strong-123!",
  });
  assert.equal(r.status, 201);
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  assert.match(r.headers.get("set-cookie"), /SameSite=Strict/);
  assert.ok(!JSON.stringify(r.data).includes("password"));
  pass("registration, secure session flags, no credential response");
  r = await req(b, "/api/auth/register", "POST", {
    email: "beta@example.invalid",
    password: "Test-Only-Strong-456!",
  });
  assert.equal(r.status, 201);
  pass("second independent account");
  const profile = {
    name: "甲同学",
    email: "",
    phone: "",
    summary: "真实经历",
    cities: ["深圳", "深圳"],
    directions: ["前端"],
    education: [{ title: "示例大学", period: "2022—2026", detail: "专升本" }],
    projects: [],
    experience: [],
    skills: "Vue / TypeScript",
    honors: "",
  };
  r = await req(
    a,
    "/api/profile",
    "PUT",
    { profile, revision: 0 },
    { "X-CSRF-Token": "bad" },
  );
  assert.equal(r.status, 403);
  pass("CSRF token required");
  r = await req(
    a,
    "/api/profile",
    "PUT",
    { profile, revision: 0 },
    { origin: "https://untrusted.invalid" },
  );
  assert.equal(r.status, 403);
  pass("foreign origin mutation blocked");
  r = await req(a, "/api/profile", "PUT", { profile, revision: 0 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.profile.cities, ["深圳"]);
  pass("profile persistence with normalized tags");
  r = await req(b, "/api/profile");
  assert.equal(r.data.profile, null);
  pass("private profile isolated from other account");
  r = await req(a, "/api/profile", "PUT", {
    profile: { ...profile, name: "stale" },
    revision: 0,
  });
  assert.equal(r.status, 409);
  pass("stale profile write rejected");
  r = await req(a, "/api/resumes", "POST", {
    title: "前端版本",
    body: { text: "甲同学简历 <script>unsafe()</script>" },
  });
  assert.equal(r.status, 201);
  const first = r.data.resume;
  pass("create original resume version");
  for (const method of ["GET", "PUT", "DELETE"]) {
    r = await req(
      b,
      "/api/resumes/" + first.id,
      method,
      method === "GET"
        ? undefined
        : { title: "越权", body: { text: "bad" }, revision: 1 },
    );
    assert.equal(r.status, 404);
  }
  pass("cross-account read update delete all blocked");
  r = await req(a, "/api/resumes", "POST", {
    title: "后端版本",
    body: { text: "独立正文" },
  });
  assert.equal(r.status, 201);
  const second = r.data.resume;
  r = await req(a, "/api/resumes/" + first.id, "PUT", {
    title: "前端v2",
    body: { text: "更新内容" },
    revision: 1,
  });
  assert.equal(r.data.resume.revision, 2);
  r = await req(a, "/api/resumes/" + second.id);
  assert.equal(r.data.resume.body.text, "独立正文");
  pass("multiple versions remain independent");
  r = await req(a, "/api/resumes/" + first.id, "PUT", {
    title: "bad",
    body: { text: "覆盖" },
    revision: 1,
  });
  assert.equal(r.status, 409);
  pass("stale resume update blocked");
  r = await req(a, "/api/resumes/" + first.id, "DELETE", { revision: 1 });
  assert.equal(r.status, 409);
  pass("stale resume delete blocked");
  await stop();
  await start();
  r = await req(a, "/api/auth/session");
  assert.equal(r.data.user.email, "alpha@example.invalid");
  r = await req(a, "/api/profile");
  assert.equal(r.data.profile.name, "甲同学");
  r = await req(a, "/api/resumes/" + first.id);
  assert.equal(r.data.resume.body.text, "更新内容");
  pass("sessions profiles resumes survive process restart");
  r = await req(a, "/api/resumes/" + second.id, "DELETE", { revision: 1 });
  assert.equal(r.status, 200);
  r = await req(a, "/api/resumes/" + second.id);
  assert.equal(r.status, 404);
  pass("owned delete works");
  r = await req(a, "/api/auth/logout", "POST", {});
  assert.equal(r.status, 200);
  r = await req(a, "/api/profile");
  assert.equal(r.status, 401);
  pass("logout invalidates server session");
  r = await req(anon, "/private/career.sqlite");
  assert.equal(r.status, 404);
  r = await req(anon, "/%2e%2e/%2eenv");
  assert.equal(r.status, 404);
  pass("private database and environment never served");
  r = await req(anon, "/");
  assert.equal(r.status, 200);
  assert.ok(
    r.headers.get("content-security-policy").includes("object-src 'none'"),
  );
  pass("real app served with CSP");
  const { validateDocument, documentText } = await import(
    "../server/resume-document.mjs"
  );
  const document = {
    schemaVersion: 2,
    header: { name: "结构化同学", headline: "前端", contact: "", summary: "" },
    sections: [
      {
        id: "sec1",
        title: "教育",
        items: [{ id: "item1", title: "学校", meta: "时间", content: "内容" }],
      },
    ],
    pageBreaks: [],
    decoration: null,
    decorationFooter: null,
    layout: { template: "compact", fontSize: 15, accent: "navy" },
  };
  assert.deepEqual(validateDocument(document), document);
  assert.match(documentText(document), /结构化同学/);
  assert.throws(() =>
    validateDocument({
      ...document,
      sections: [document.sections[0], document.sections[0]],
    }),
  );
  assert.throws(() =>
    validateDocument({
      ...document,
      header: { ...document.header, name: "x".repeat(121) },
    }),
  );
  pass("structured schema rejects duplicate ids and oversized fields");
  await req(a, "/api/auth/login", "POST", {
    email: "alpha@example.invalid",
    password: "Test-Only-Strong-123!",
  });
  r = await req(a, "/api/resumes", "POST", {
    title: "结构版本",
    body: { document, text: "forged" },
  });
  assert.equal(r.status, 201);
  const structured = r.data.resume;
  assert.equal(structured.body.document.header.name, "结构化同学");
  assert.notEqual(structured.body.text, "forged");
  pass("structured document stored with server-derived canonical text");
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      req(a, "/api/resumes/" + structured.id, "PUT", {
        title: "race" + i,
        body: { document },
        revision: 1,
      }),
    ),
  );
  assert.equal(results.filter((x) => x.status === 200).length, 1);
  assert.equal(results.filter((x) => x.status === 409).length, 7);
  pass("eight concurrent writers allow only one revision winner");
  r = await req(a, "/api/resumes/" + structured.id, "DELETE", { revision: 1 });
  assert.equal(r.status, 409);
  pass("concurrent stale delete cannot remove updated document");
  const reads = await Promise.all(
    Array.from({ length: 24 }, () => req(a, "/api/resumes/" + structured.id)),
  );
  assert.ok(
    reads.every(
      (x) =>
        x.status === 200 && x.data.resume.body.document.sections.length === 1,
    ),
  );
  pass("bounded concurrent reads preserve structured data");
  console.log("TOTAL", checks, "checks passed");
} finally {
  await stop();
  await fs.rm(dir, { recursive: true, force: true });
}
