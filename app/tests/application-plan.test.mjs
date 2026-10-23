import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApplicationPlan } from "../server/application-plan.mjs";

test("storage CAS, owner scoping, retention and rollback after partial insert", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a'),('b');CREATE TABLE job_intents(user_id TEXT REFERENCES users(id),job_id TEXT,created_at INTEGER,PRIMARY KEY(user_id,job_id));",
  );
  const plan = createApplicationPlan(db, (id) =>
    ["one", "two"].includes(id) ? { id, title: id } : null,
  );
  assert.equal(
    plan.save("a", "one", { text: "private", revision: 0 }).revision,
    1,
  );
  assert.equal(plan.detail("b", "one").draft, "");
  assert.throws(() => plan.save("a", "one", { text: "stale", revision: 0 }), {
    status: 409,
  });
  plan.mutateIntent("a", "one", true);
  plan.mutateIntent("a", "one", false);
  assert.equal(plan.detail("a", "one").draft, "private");
  plan.mutateIntent("a", "one", true);
  db.exec(
    "CREATE TRIGGER reject_second BEFORE INSERT ON job_intents WHEN NEW.job_id='two' BEGIN SELECT RAISE(ABORT,'simulated failure');END;",
  );
  assert.throws(() => plan.replaceIntents("a", ["one", "two"]));
  assert.deepEqual(plan.jobIds("a"), ["one"]);
  assert.deepEqual(plan.jobIds("b"), []);
  db.close();
});

test("HTTP auth, CSRF, accounts, CAS races and durable deselection", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "career-plan-"));
  const proc = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", CAREER_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "",
    stderr = "",
    base;
  proc.stderr.on("data", (b) => (stderr += b));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("startup timeout " + stderr)),
        10000,
      );
      proc.stdout.on("data", (b) => {
        output += b;
        const m = output.match(/listening on (\d+)/);
        if (m) {
          base = "http://127.0.0.1:" + m[1];
          clearTimeout(timer);
          resolve();
        }
      });
      proc.once("exit", (c) => {
        clearTimeout(timer);
        reject(Error("server exited " + c + stderr));
      });
    });
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
      if (c && data.user) c.id = data.user.id;
      return { status: r.status, data };
    }
    const a = {},
      b = {};
    for (const [c, name] of [
      [a, "alpha"],
      [b, "beta"],
    ])
      assert.equal(
        (
          await req(c, "/api/auth/register", "POST", {
            email: name + "@example.invalid",
            password: "Test-Only-Strong-123!",
          })
        ).status,
        201,
      );
    assert.equal((await req(null, "/api/application-plan")).status, 401);
    const jobs = (await req(a, "/api/jobs")).data.jobs;
    assert.ok(jobs.length >= 2);
    const [id, id2] = jobs.map((j) => j.id),
      p = "/api/application-plan/" + id,
      intent = "/api/job-intents/" + id;
    for (const [route, method, payload] of [
      [p, "PUT", { text: "x", revision: 0 }],
      [intent, "PUT", undefined],
      [intent, "DELETE", undefined],
      ["/api/ai/application-copy", "POST", { jobId: id }],
      ["/api/job-intents", "PUT", { jobIds: [id], expected: [] }],
    ]) {
      assert.equal(
        (await req({ cookie: a.cookie }, route, method, payload)).status,
        403,
      );
      assert.equal(
        (
          await req(a, route, method, payload, {
            origin: "https://evil.invalid",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req(a, route, method, payload, {
            "sec-fetch-site": "cross-site",
          })
        ).status,
        403,
      );
      assert.equal(
        (await req(a, route, method, payload, { "x-csrf-token": b.csrf }))
          .status,
        403,
      );
    }
    const adds = await Promise.all([
      req(a, intent, "PUT"),
      req(a, "/api/job-intents/" + id2, "PUT"),
    ]);
    assert.ok(adds.every((x) => x.status === 200));
    assert.equal((await req(a, "/api/application-plan")).data.items.length, 2);
    assert.equal((await req(b, "/api/application-plan")).data.items.length, 0);
    let result = await req(a, p, "PUT", { text: "A private", revision: 0 });
    assert.equal(result.status, 200);
    assert.equal(result.data.revision, 1);
    assert.equal((await req(b, p)).data.draft, "");
    assert.equal(
      (await req(b, p, "PUT", { text: "B private", revision: 1 })).status,
      409,
    );
    assert.equal(
      (
        await req(b, p, "PUT", {
          text: "B private",
          revision: 0,
          userId: a.id,
          user_id: a.id,
        })
      ).status,
      200,
    );
    assert.equal((await req(a, p)).data.draft, "A private");
    const races = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        req(a, p, "PUT", { text: "A race " + i, revision: 1 }),
      ),
    );
    assert.equal(races.filter((x) => x.status === 200).length, 1);
    assert.equal(races.filter((x) => x.status === 409).length, 5);
    assert.equal(
      (await req(a, p, "PUT", { text: "x".repeat(8001), revision: 2 })).status,
      400,
    );
    for (const revision of [-1, 1.5, "2", null])
      assert.equal(
        (await req(a, p, "PUT", { text: "x", revision })).status,
        400,
      );
    assert.equal(
      (await req(a, p, "PUT", { text: "", revision: 2 })).status,
      200,
    );
    assert.equal(
      (await req(a, p, "PUT", { text: "retained", revision: 3 })).status,
      200,
    );
    assert.equal((await req(a, intent, "DELETE")).status, 200);
    assert.equal((await req(a, p)).data.draft, "retained");
    assert.equal((await req(a, p)).data.selected, false);
    assert.equal((await req(a, intent, "PUT")).status, 200);
    const list = (await req(a, "/api/application-plan")).data;
    assert.equal(list.items.find((x) => x.job.id === id).draft, "retained");
    const actual = (await req(a, "/api/jobs/" + id)).data.job;
    assert.deepEqual(list.items.find((x) => x.job.id === id).job, actual);
    assert.equal(
      (await req(a, "/api/job-intents", "PUT", { jobIds: [id, "bogus"], expected: [] }))
        .status,
      400,
    );
    assert.equal((await req(a, "/api/job-intents")).data.jobIds.length, 2);
    const snapshot = (await req(a, "/api/job-intents")).data.jobIds;
    // 基准过期必须 409，防止两个页面互相覆盖
    assert.equal(
      (await req(a, "/api/job-intents", "PUT", { jobIds: [id], expected: [id] })).status,
      409,
    );
    assert.equal(
      (await req(a, "/api/job-intents", "PUT", { jobIds: [id], expected: snapshot })).status,
      200,
    );
    assert.deepEqual((await req(a, "/api/job-intents")).data.jobIds, [id]);
    assert.equal(
      (await req(a, "/api/application-plan/" + "0".repeat(24))).status,
      404,
    );
    assert.equal(
      (await req(a, "/api/ai/application-copy", "POST", { jobId: id })).status,
      503,
    );
    assert.equal((await req(a, p)).data.draft, "retained");
    assert.equal((await req(b, p)).data.draft, "B private");
  } finally {
    if (proc.exitCode === null) {
      const ended = once(proc, "exit");
      proc.kill("SIGTERM");
      await ended;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
