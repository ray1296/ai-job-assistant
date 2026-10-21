import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLearning } from "../server/learning-state.mjs";
import {
  listQuestions,
  getQuestion,
  questionFacets,
} from "../server/learning-catalog.mjs";

test("catalog provenance, facets, bounds, text search and cached filtering", () => {
  const list = listQuestions({ pageSize: 50 });
  assert.equal(list.total, 1761);
  assert.equal(list.questions.length, 50);
  assert.equal(list.questions[0].raw, undefined);
  const q = getQuestion(list.questions[0].id);
  assert.equal(q.question, q.raw["面试题 / 面经问题"].trim());
  assert.equal(q.answer, q.raw["考察点 / 答题要点"].trim());
  assert.equal(
    questionFacets().directions.reduce((n, x) => n + x.count, 0),
    1761,
  );
  assert.equal(
    questionFacets().categories.reduce((n, x) => n + x.count, 0),
    1761,
  );
  for (const input of [
    { pageSize: 51 },
    { page: 0 },
    { page: "NaN" },
    { q: "x".repeat(101) },
    { direction: "x".repeat(101) },
    { category: "x".repeat(151) },
    { scope: "bad" },
  ])
    assert.throws(() => listQuestions(input), { status: 400 });
  assert.ok(
    listQuestions({ q: "NACOS" }).questions.every((q) =>
      JSON.stringify(q).toLowerCase().includes("nacos"),
    ),
  );
  assert.equal(listQuestions({ q: "' OR 1=1 --" }).total, 0);
  const filtered = listQuestions({
    direction: q.direction,
    category: q.category,
  });
  assert.ok(
    filtered.questions.every(
      (x) => x.direction === q.direction && x.category === q.category,
    ),
  );
  assert.deepEqual(listQuestions({ page: 1000000 }).questions, []);
});

test("SQLite owner constraints, rollback and explicit assessments", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b')",
  );
  const service = createLearning(db),
    id = listQuestions().questions[0].id;
  assert.equal(
    service.save("a", id, { favorite: true, revision: 0 }).question.state
      .attempts,
    0,
  );
  assert.equal(
    service.save("a", id, { status: "review", revision: 1 }).question.state
      .attempts,
    1,
  );
  assert.equal(
    service.save("a", id, { status: "review", revision: 2 }).question.state
      .attempts,
    2,
  );
  assert.equal(service.detail("b", id).question.state.revision, 0);
  assert.throws(
    () => service.save("a", id, { status: "mastered", revision: 1 }),
    { status: 409 },
  );
  for (const input of [
    null,
    [],
    { revision: 3 },
    { favorite: "true", revision: 3 },
    { status: "wrong", revision: 3 },
    { favorite: true, revision: -1 },
    { favorite: true, revision: "3" },
    { favorite: true, revision: 3, user_id: "b" },
  ])
    assert.throws(() => service.save("a", id, input), { status: 400 });
  db.exec(
    "CREATE TRIGGER reject_learning BEFORE UPDATE ON learning_states BEGIN SELECT RAISE(ABORT,'test rollback');END",
  );
  assert.throws(() =>
    service.save("a", id, { status: "mastered", revision: 3 }),
  );
  assert.equal(service.detail("a", id).question.state.revision, 3);
  assert.equal(service.detail("a", id).question.state.attempts, 2);
  db.exec("DROP TRIGGER reject_learning");
  assert.throws(() =>
    db.prepare("UPDATE learning_states SET status=?").run("bad"),
  );
  assert.throws(() =>
    db.prepare("UPDATE learning_states SET favorite=?").run(2),
  );
  assert.throws(() =>
    db.prepare("UPDATE learning_states SET attempts=?").run(-1),
  );
  db.exec("DELETE FROM users WHERE id='a'");
  assert.equal(db.prepare("SELECT count(*) n FROM learning_states").get().n, 0);
  db.close();
});

test("authenticated API: isolation, CSRF, contention, durability, cache and parallel reads", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "career-learning-"));
  let proc, base;
  async function start() {
    proc = spawn(process.execPath, ["server/index.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        PORT: "0",
        HOST: "127.0.0.1",
        CAREER_DATA_DIR: dir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stderr.on("data", () => {});
    await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(Error("startup timeout")), 10000);
      proc.once("exit", (code) => {
        clearTimeout(timeout);
        reject(Error("startup exit " + code));
      });
      proc.stdout.on("data", (b) => {
        output += b;
        const m = output.match(/listening on (\d+)/);
        if (m) {
          clearTimeout(timeout);
          base = "http://127.0.0.1:" + m[1];
          resolve();
        }
      });
    });
  }
  async function stop() {
    const done = once(proc, "exit");
    proc.kill("SIGTERM");
    await done;
  }
  async function req(c, p, method = "GET", body, extra = {}) {
    const r = await fetch(base + p, {
      method,
      headers: {
        ...(c?.cookie ? { cookie: c.cookie } : {}),
        ...(c?.csrf ? { "x-csrf-token": c.csrf } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    if (c && r.headers.get("set-cookie"))
      c.cookie = r.headers.get("set-cookie").split(";")[0];
    if (c && data.csrf) c.csrf = data.csrf;
    return { status: r.status, data, headers: r.headers };
  }
  try {
    await start();
    const a = {},
      b = {};
    for (const [c, n] of [
      [a, "a"],
      [b, "b"],
    ])
      assert.equal(
        (
          await req(c, "/api/auth/register", "POST", {
            email: n + "@learning.invalid",
            password: "Test-Only-Strong-123!",
          })
        ).status,
        201,
      );
    const list = await req(a, "/api/questions");
    assert.equal(list.status, 200);
    assert.equal(list.data.total, 1761);
    assert.equal(list.headers.get("cache-control"), "no-store");
    const id = list.data.questions[0].id,
      p = "/api/questions/" + id;
    for (const url of [
      "/api/questions",
      "/api/questions/facets",
      p,
      "/api/learning/summary",
    ])
      assert.equal((await req(null, url)).status, 401);
    assert.equal(
      (await req(null, p + "/state", "PUT", { favorite: true, revision: 0 }))
        .status,
      401,
    );
    assert.equal(
      (
        await req({ cookie: a.cookie }, p + "/state", "PUT", {
          favorite: true,
          revision: 0,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          a,
          p + "/state",
          "PUT",
          { favorite: true, revision: 0 },
          { origin: "https://evil.invalid" },
        )
      ).status,
      403,
    );
    for (const suffix of [
      "?pageSize=100",
      "?q=" + "x".repeat(101),
      "?scope=invalid",
    ])
      assert.equal((await req(a, "/api/questions" + suffix)).status, 400);
    const first = await Promise.all(
      Array.from({ length: 8 }, () =>
        req(a, p + "/state", "PUT", {
          favorite: true,
          status: "review",
          revision: 0,
        }),
      ),
    );
    assert.equal(first.filter((x) => x.status === 200).length, 1);
    assert.equal(first.filter((x) => x.status === 409).length, 7);
    assert.equal(first.find((x) => x.status === 409).data.state.revision, 1);
    assert.equal((await req(b, p)).data.question.state.revision, 0);
    assert.equal(
      (await req(b, "/api/questions?scope=favorites")).data.total,
      0,
    );
    assert.equal(
      (await req(a, "/api/questions?scope=favorites")).data.total,
      1,
    );
    assert.equal((await req(a, "/api/questions?scope=review")).data.total, 1);
    const second = await Promise.all(
      Array.from({ length: 8 }, () =>
        req(a, p + "/state", "PUT", { status: "mastered", revision: 1 }),
      ),
    );
    assert.equal(second.filter((x) => x.status === 200).length, 1);
    let state = (await req(a, p)).data.question.state;
    assert.equal(state.attempts, 2);
    assert.equal(state.revision, 2);
    assert.equal(
      (await req(a, p + "/state", "PUT", { favorite: false, revision: 2 })).data
        .question.state.attempts,
      2,
    );
    assert.deepEqual((await req(a, "/api/learning/summary")).data, {
      total: 1761,
      favorites: 0,
      unseen: 1760,
      review: 0,
      mastered: 1,
      attempts: 2,
    });
    assert.deepEqual((await req(b, "/api/learning/summary")).data, {
      total: 1761,
      favorites: 0,
      unseen: 1761,
      review: 0,
      mastered: 0,
      attempts: 0,
    });
    assert.equal(
      (await req(a, "/api/questions/" + "f".repeat(24))).status,
      404,
    );
    for (const asset of ["/assets/main.js", "/assets/app.css"]) {
      const r = await fetch(base + asset, { method: "HEAD" });
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("cache-control"), "no-cache");
    }
    const assets = await fs.readdir(
      new URL("../dist/assets/", import.meta.url),
    );
    const hashed = assets.find((x) => /-[A-Z0-9]{8}\.js$/.test(x));
    assert.ok(hashed);
    assert.equal(
      (await fetch(base + "/assets/" + hashed, { method: "HEAD" })).headers.get(
        "cache-control",
      ),
      "public,max-age=31536000,immutable",
    );
    const startTime = performance.now();
    const reads = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        req(i % 2 ? a : b, "/api/questions?q=java&pageSize=50"),
      ),
    );
    assert.ok(reads.every((x) => x.status === 200));
    t.diagnostic(
      "24 concurrent loopback reads: " +
        Math.round(performance.now() - startTime) +
        "ms total; descriptive only",
    );
    await stop();
    await start();
    state = (await req(a, p)).data.question.state;
    assert.equal(state.revision, 3);
    assert.equal(state.status, "mastered");
    assert.equal(state.attempts, 2);
    assert.equal((await req(b, p)).data.question.state.revision, 0);
  } finally {
    if (proc && proc.exitCode === null) await stop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
