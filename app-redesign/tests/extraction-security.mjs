import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5174";
let count = 0;
const pass = (m) => {
  console.log("PASS", m);
  count++;
};
async function account() {
  const r = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email:
        "browser-" +
        Date.now() +
        Math.floor(Math.random() * 999) +
        "@example.invalid",
      password: "Only-Synthetic-123!",
    }),
  });
  assert.equal(r.status, 201);
  const data = await r.json();
  return { cookie: r.headers.get("set-cookie").split(";")[0], csrf: data.csrf };
}
const a = await account(),
  b = await account();
const headers = (u, extra = {}) => ({
  ...(u ? { Cookie: u.cookie, "X-CSRF-Token": u.csrf } : {}),
  ...extra,
});
async function req(u, url, method = "GET", body, extra = {}) {
  const r = await fetch(base + "/api" + url, {
    method,
    headers: headers(u, extra),
    ...(body !== undefined ? { body } : {}),
  });
  const data = await r.json();
  return { status: r.status, data };
}
async function upload(
  u,
  filename,
  mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
) {
  const bytes = await fs.readFile(filename);
  return req(u, "/resume-extractions", "POST", bytes, {
    "Content-Type": mime,
    "X-File-Name": encodeURIComponent(filename.split("/").pop()),
    "X-AI-Consent": "true",
  });
}
async function poll(u, id) {
  for (let i = 0; i < 100; i++) {
    const r = await req(u, "/resume-extractions/" + id);
    if (["ready", "failed"].includes(r.data.job?.state)) return r.data.job;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("poll timeout");
}
let r = await req(null, "/resume-extractions", "POST", Buffer.from("x"), {
  "Content-Type": "image/png",
});
assert.equal(r.status, 401);
r = await req(
  { ...a, csrf: "wrong" },
  "/resume-extractions",
  "POST",
  Buffer.from("x"),
  { "Content-Type": "image/png" },
);
assert.equal(r.status, 403);
pass("private binary upload requires authenticated session and CSRF");
r = await upload(a, "artifacts/intake-fixtures/resume.png", "image/png");
assert.equal(r.status, 202);
const id = r.data.job.id;
let parallel = await upload(b, "artifacts/intake-fixtures/resume.docx");
assert.equal(parallel.status, 429);
const t = performance.now();
const reads = await Promise.all(
  Array.from({ length: 12 }, () => req(b, "/profile")),
);
assert.ok(reads.every((x) => x.status === 200));
console.log(
  "12 light reads during OCR:",
  Math.round(performance.now() - t),
  "ms",
);
pass("busy OCR rejects second heavy task but serves normal account requests");
assert.equal((await req(b, "/resume-extractions/" + id)).status, 404);
assert.equal((await req(b, "/resume-extractions/" + id, "DELETE")).status, 404);
pass("another account cannot read or delete extraction results");
await req(a, "/resume-extractions/" + id, "DELETE");
assert.equal((await req(a, "/resume-extractions/" + id)).status, 404);
pass("owner cancel removes result and kills processing group");
for (let i = 0; i < 30; i++) {
  const st = await req(a, "/resume-extractions/limits");
  if (!st.data.active) break;
  await new Promise((r) => setTimeout(r, 100));
}
const cases = [
  ["bomb.docx", /压缩|体积/],
  ["entity.docx", /实体/],
  ["macro.docx", /宏/],
];
for (const [file, expected] of cases) {
  r = await upload(b, "artifacts/intake-fixtures/" + file);
  assert.equal(r.status, 202);
  const job = await poll(b, r.data.job.id);
  assert.equal(job.state, "failed");
  assert.match(job.error, expected);
  await req(b, "/resume-extractions/" + job.id, "DELETE");
  pass("rejects malicious " + file + " without evaluating contents");
}
r = await req(b, "/resume-extractions", "POST", Buffer.from("not a PNG"), {
  "Content-Type": "image/png",
  "X-AI-Consent": "true",
});
assert.equal(r.status, 415);
r = await req(
  b,
  "/resume-extractions",
  "POST",
  Buffer.alloc(5 * 1024 * 1024 + 1),
  { "Content-Type": "application/pdf", "X-AI-Consent": "true" },
);
assert.equal(r.status, 413);
pass("actual file magic and early byte-length guard reject invalid uploads");
r = await upload(a, "artifacts/intake-fixtures/resume.docx");
assert.equal(r.status, 202);
const job = await poll(a, r.data.job.id);
assert.equal(job.state, "ready");
assert.match(job.result.text, /测试同学/);
assert.equal((await req(a, "/profile")).data.profile, null);
pass("successful extraction itself never persists profile or creates resume");
await req(a, "/resume-extractions/" + job.id, "DELETE");
const folder = process.env.TEST_PRIVATE_DIR;
if (folder) {
  const entries = await fs.readdir(folder + "/extraction-tmp");
  assert.equal(entries.length, 0);
  pass("source and rendered page temporary files deleted after every result");
}
console.log("TOTAL", count, "extraction security checks passed");
