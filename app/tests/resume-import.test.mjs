import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createResumeImports,
  validateRecognition,
} from "../server/resume-import.mjs";
import { profileData } from "../server/profile-data.mjs";
function fixture() {
  return {
    sourceText: "Lin Example",
    profile: {
      name: "Lin Example",
      cities: [],
      directions: [],
      education: [],
      projects: [],
      experience: [],
    },
    document: {
      schemaVersion: 2,
      header: { name: "Lin Example" },
      sections: [],
    },
    evidence: [
      { path: "profile.name", quote: "Lin Example", page: 1 },
      { path: "document.header.name", quote: "Lin Example", page: 1 },
    ],
  };
}
test("exact source evidence rejects invented facts, missing evidence and unsafe paths", () => {
  assert.equal(
    validateRecognition(fixture(), profileData).profile.name,
    "Lin Example",
  );
  for (const mutate of [
    (x) => (x.profile.name = "Invented"),
    (x) => (x.evidence[0].quote = "unseen"),
    (x) => (x.evidence[0].path = "__proto__.name"),
  ]) {
    const x = fixture();
    mutate(x);
    assert.throws(() => validateRecognition(x, profileData));
  }
});
test("private durable draft storage survives reopen and CAS isolates owner", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-import-"));
  const file = path.join(dir, "test.sqlite");
  const db = new DatabaseSync(file);
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b')",
  );
  const svc = createResumeImports(db, dir, profileData);
  const now = Date.now();
  db.prepare("INSERT INTO resume_imports VALUES(?,?,?,1,?,?)").run(
    "draft-a",
    "a",
    JSON.stringify({
      ...validateRecognition(fixture(), profileData),
      evidence: fixture().evidence,
      filename: "resume.png",
    }),
    now,
    now,
  );
  assert.equal(svc.list("b").length, 0);
  assert.throws(() => svc.get("draft-a", "b"), { status: 404 });
  const old = svc.get("draft-a", "a");
  const next = svc.update("draft-a", "a", old);
  assert.equal(next.revision, 2);
  assert.throws(() => svc.update("draft-a", "a", old), { status: 409 });
  assert.throws(() => svc.delete("draft-a", "b", 2), { status: 404 });
  assert.throws(() => svc.delete("draft-a", "a", 1), { status: 409 });
  svc.close();
  db.close();
  const reopened = new DatabaseSync(file);
  const again = createResumeImports(reopened, dir, profileData);
  assert.equal(again.get("draft-a", "a").revision, 2);
  again.delete("draft-a", "a", 2);
  assert.equal(again.list("a").length, 0);
  again.close();
  reopened.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("new classification drafts stay document-free while legacy documents remain readable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-import-new-"));
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a')");
  const svc = createResumeImports(db, dir, profileData);
  const classified = {
    sourceText: "Lin Example GPA 3.8",
    profile: { name: "Lin Example", phone: "", email: "", summary: "", skills: "", honors: "", notes: "", cities: [], directions: [], education: [], projects: [], experience: [] },
    extras: [{ title: "GPA", content: "GPA 3.8" }],
  };
  const { validateClassification } = await import("../server/resume-classification.mjs");
  const data = validateClassification(classified, classified.sourceText, profileData);
  const now = Date.now();
  db.prepare("INSERT INTO resume_imports VALUES(?,?,?,1,?,?)").run("new-draft", "a", JSON.stringify(data), now, now);
  const old = svc.get("new-draft", "a");
  assert.equal(old.document, undefined);
  const next = svc.update("new-draft", "a", { ...old, profile: old.profile, sourceText: old.sourceText, extras: old.extras });
  assert.equal(next.document, undefined);
  assert.deepEqual(next.extras, [{ title: "GPA", content: "GPA 3.8" }]);
  svc.close(); db.close(); await fs.rm(dir, { recursive: true, force: true });
});

test("real HTTP cancellation releases single admission and never persists partial output", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-abort-"));
  let started;
  const upstream = new http.Server((req, res) => {
    req.resume();
    started?.();
    req.on("close", () => res.end());
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  await fs.writeFile(
    path.join(dir, "ai-config.json"),
    JSON.stringify({
      baseUrl: "http://127.0.0.1:" + upstream.address().port,
      apiKey: "synthetic-only",
      model: "synthetic",
    }),
  );
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b')",
  );
  const svc = createResumeImports(db, dir, profileData),
    controller = new AbortController();
  try {
    const pending = new Promise((r) => {
      started = r;
    });
    const job = svc.recognize(
      "a",
      { text: "Synthetic only" },
      controller.signal,
    );
    const rejection = assert.rejects(job, { status: 499 });
    await pending;
    assert.equal(svc.status().active, 1);
    await assert.rejects(svc.recognize("b", { text: "Synthetic only" }), {
      status: 429,
    });
    controller.abort();
    await rejection;
    assert.equal(svc.status().active, 0);
    assert.equal(svc.list("a").length, 0);
    assert.equal(svc.list("b").length, 0);
  } finally {
    controller.abort();
    svc.close();
    upstream.closeAllConnections();
    await new Promise((r) => upstream.close(r));
    db.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("pre-aborted recognition never makes a paid call", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY)");
  const svc = createResumeImports(db, "/nonexistent", profileData);
  await assert.rejects(
    svc.recognize("a", { text: "Synthetic" }, AbortSignal.abort()),
    { status: 499 },
  );
  svc.close();
  db.close();
});
