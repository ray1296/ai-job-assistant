import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApplicationCopy } from "../server/application-copy.mjs";
const input = {
  job: { id: "actual", title: "真实岗位" },
  text: "用户原话",
  mode: "optimize",
};
const completion = (content, finish_reason = "stop") =>
  new Response(
    JSON.stringify({ choices: [{ finish_reason, message: { content } }] }),
  );
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "career-copy-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function configure(dir) {
  await fs.writeFile(
    path.join(dir, "ai-config.json"),
    JSON.stringify({
      baseUrl: "https://example.invalid/v1",
      apiKey: "test-not-secret",
      model: "stub-model",
    }),
    { mode: 0o600 },
  );
}

test("AI absent config returns503 and never calls provider", () =>
  fixture(async (dir) => {
    let calls = 0;
    const ai = createApplicationCopy(dir, {
      fetchImpl: async () => {
        calls++;
      },
    });
    await assert.rejects(ai.generate("a", input), { status: 503 });
    assert.equal(calls, 0);
  }));
test("AI uses actual job and strict completion response, not persisted output", () =>
  fixture(async (dir) => {
    await configure(dir);
    let sent;
    const ai = createApplicationCopy(dir, {
      fetchImpl: async (url, opts) => {
        sent = { url: String(url), ...opts };
        return completion(JSON.stringify({ text: "建议文本" }));
      },
    });
    assert.deepEqual(await ai.generate("a", input), {
      text: "建议文本",
      provider: "compatible",
      model: "stub-model",
    });
    assert.equal(sent.url, "https://example.invalid/v1/chat/completions");
    assert.deepEqual(
      JSON.parse(JSON.parse(sent.body).messages[1].content),
      input,
    );
    assert.deepEqual((await fs.readdir(dir)).sort(), ["ai-config.json"]);
  }));
test("AI rejects malformed truncated oversized and empty results", () =>
  fixture(async (dir) => {
    await configure(dir);
    for (const response of [
      completion("not-json"),
      completion('{"text":"partial"}', "length"),
      completion('{"text":""}'),
      completion(JSON.stringify({ text: "x".repeat(8001) })),
      new Response("x".repeat(65537)),
    ]) {
      const ai = createApplicationCopy(dir, {
        fetchImpl: async () => response,
      });
      await assert.rejects(ai.generate("a", input), { status: 502 });
    }
  }));
test("AI admission is synchronous, rejects busy callers, and enforces user rate", () =>
  fixture(async (dir) => {
    await configure(dir);
    let release, entered;
    const started = new Promise((r) => (entered = r)),
      gate = new Promise((r) => (release = r));
    const ai = createApplicationCopy(dir, {
      fetchImpl: async () => {
        entered();
        await gate;
        return completion('{"text":"safe"}');
      },
    });
    const first = ai.generate("a", input);
    await started;
    await assert.rejects(ai.generate("b", input), { status: 429 });
    release();
    await first;
    await ai.generate("a", input);
    await ai.generate("a", input);
    await assert.rejects(ai.generate("a", input), { status: 429 });
    assert.equal((await ai.generate("b", input)).text, "safe");
  }));
test("AI timeout releases admission and validation happens before provider", () =>
  fixture(async (dir) => {
    await configure(dir);
    let calls = 0;
    const ai = createApplicationCopy(dir, {
      timeoutMs: 15,
      fetchImpl: async (_url, { signal }) => {
        calls++;
        return new Promise((_r, reject) => {
          if (signal.aborted) reject(Error("aborted"));
          else
            signal.addEventListener("abort", () => reject(Error("aborted")), {
              once: true,
            });
        });
      },
    });
    await assert.rejects(
      ai.generate("a", { ...input, text: "x".repeat(8001) }),
      { status: 400 },
    );
    await assert.rejects(ai.generate("a", { ...input, mode: "other" }), {
      status: 400,
    });
    assert.equal(calls, 0);
    await assert.rejects(ai.generate("a", input), { status: 504 });
    await assert.rejects(ai.generate("b", input), { status: 504 });
    assert.equal(calls, 2);
  }));
