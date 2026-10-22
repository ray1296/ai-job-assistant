import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright-core";

// Always isolated: no existing URL, database, config, or paid model fallback.
const root = new URL("..", import.meta.url);
const artifacts = path.resolve("artifacts/learning-ai-browser");
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-learning-ai-"));
const results = [], errors = [], calls = [];
let upstream, service, browser, base;
const pass = name => { results.push(name); console.log("PASS", name); };
async function account(tag) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1050 } });
  const r = await context.request.post(base + "/api/auth/register", { data: { email: "learning-ai-" + Date.now() + tag + "@example.invalid", password: "Synthetic-Only-123!" } });
  assert.equal(r.status(), 201); const { csrf } = await r.json();
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  return { context, page, csrf };
}
async function api(a, route, method = "GET", data, status = 200) {
  const r = await a.context.request.fetch(base + "/api" + route, { method, headers: { "X-CSRF-Token": a.csrf }, ...(data === undefined ? {} : { data }) });
  assert.equal(r.status(), status, method + " " + route + ": " + (r.status() === status ? "" : await r.text())); return r.json();
}
async function shot(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), name + " no horizontal overflow");
  await page.screenshot({ path: path.join(artifacts, name + ".png"), fullPage: true });
}
async function face(page, value) { await page.waitForFunction(v => document.querySelector(".practice-flip-stage")?.dataset.face === v, value); }
async function text(locator, value) { await locator.filter({ hasText: value }).waitFor(); }
try {
  await fs.mkdir(artifacts, { recursive: true });
  upstream = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/chat/completions") { res.writeHead(404); return res.end(); }
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body), prompt = input.messages.find(m => m.role === "user").content;
    const system = input.messages.find(m => m.role === "system")?.content || "";
    calls.push({ type: prompt.startsWith("{") ? "learning" : prompt.includes("排版顾问") ? "layout" : "review" });
    let output;
    if (prompt.startsWith("{")) { const x = JSON.parse(prompt); output = { kind: x.kind, content: "AI改编参考第" + calls.length + "次：" + x.question, source: "伪造来源必须被网关忽略" }; }
    else if (prompt.includes("排版顾问")) output = { layout: { template: "compact", fontSize: 16, accent: "navy", reason: "合成布局建议", changes: "仅调整布局" } };
    else output = { suggestions: [
      { id: "valid", field: "header.summary", before: "唯一摘要原文", after: "模型建议摘要", reason: "改善表达" },
      { id: "wrong", field: "header.headline", before: "唯一项目原文", after: "错误目标不应写入", reason: "故意错误字段" },
      { id: "ambiguous", field: "未知字段", before: "重复原文", after: "歧义不应写入", reason: "故意歧义" }
    ] };
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  await fs.writeFile(path.join(dataDir, "ai-config.json"), JSON.stringify({ baseUrl: "http://127.0.0.1:" + upstream.address().port, apiKey: "loopback-synthetic-only", model: "fake-model" }));
  service = spawn(process.execPath, ["server/index.mjs"], { cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, HOST: "127.0.0.1", PORT: "0", CAREER_DATA_DIR: dataDir, CAREER_STATIC_DIR: "/home/ubuntu/workspaces/competition/app/dist-review" }, stdio: ["ignore", "pipe", "pipe"] });
  service.stderr.on("data", () => {});
  base = await new Promise((resolve, reject) => { let output = ""; const timer = setTimeout(() => reject(Error("isolated startup timeout")), 20000); service.stdout.on("data", c => { output += c; const m = output.match(/listening on ([0-9]+)/); if (m) { clearTimeout(timer); resolve("http://127.0.0.1:" + m[1]); } }); service.once("exit", c => { clearTimeout(timer); reject(Error("isolated service exited " + c)); }); });
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", headless: true, args: ["--no-sandbox"] });
  const a = await account("a"), b = await account("b"), studio = await account("studio");
  const listing = await api(a, "/questions?limit=12"), q = listing.questions[0];
  assert.match(q.id, /^[a-f0-9]{24}$/); console.log("QUESTION_ID", q.id, "source", q.source);
  await a.page.goto(base + "#practice"); await a.page.locator('.practice-card[data-question-id="' + q.id + '"]').waitFor(); await face(a.page, "question");
  assert.equal(calls.length, 0); await a.page.getByRole("tab", { name: "AI答案", exact: true }).click(); await face(a.page, "ai"); assert.equal(calls.length, 0);
  const generated = a.page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith("/questions/" + q.id + "/generate"));
  await a.page.getByRole("button", { name: "AI简化", exact: true }).click(); assert.equal((await generated).status(), 200);
  await text(a.page.locator(".practice-ai .learning-answer-text"), "AI改编参考第1次"); assert.equal(calls.length, 1);
  let saved = await api(a, "/questions/" + q.id + "/generated"); assert.equal(saved.items[0].source, q.source); assert.equal(saved.items[0].questionId, q.id);
  await a.page.getByRole("button", { name: "AI简化", exact: true }).click(); assert.equal(calls.length, 1);
  const cache = await api(a, "/questions/" + q.id + "/generate", "POST", { kind: "summary" }); assert.equal(cache.cached, true); assert.equal(calls.length, 1);
  pass("explicit summary POST traverses real server/gateway; source validated; UI and server cache reuse");
  await a.page.getByRole("tab", { name: "原始答案", exact: true }).click(); await face(a.page, "source"); await text(a.page.locator(".practice-source .learning-answer-text"), q.answer);
  await shot(a.page, "learning-source-desktop");
  await a.page.getByRole("button", { name: "下一题", exact: true }).click(); await face(a.page, "question");
  await a.page.getByRole("tab", { name: "AI答案", exact: true }).click(); await text(a.page.locator(".practice-ai"), "尚未生成简化内容"); assert.equal(await a.page.locator(".practice-ai").innerText().then(t => t.includes("AI改编参考第1次")), false);
  await a.page.getByRole("button", { name: "上一题", exact: true }).click(); await a.page.getByRole("tab", { name: "AI答案", exact: true }).click(); await text(a.page.locator(".practice-ai .learning-answer-text"), "AI改编参考第1次");
  await a.page.reload(); await a.page.getByRole("tab", { name: "AI答案", exact: true }).click(); await text(a.page.locator(".practice-ai .learning-answer-text"), "AI改编参考第1次"); assert.equal(calls.length, 1);
  await a.page.setViewportSize({ width: 390, height: 844 }); await shot(a.page, "learning-ai-390");
  pass("real question/AI/source faces; switching has no stale content; browser refresh restores cache; 390px no overflow");
  const refreshed = await api(a, "/questions/" + q.id + "/generate", "POST", { kind: "summary", regenerate: true }); assert.notEqual(refreshed.content, cache.content); assert.equal(calls.length, 2); assert.equal(refreshed.source, q.source);
  assert.deepEqual((await api(b, "/questions/" + q.id + "/generated")).items, []);
  await b.page.goto(base + "#practice"); await b.page.getByRole("tab", { name: "AI答案", exact: true }).click(); await text(b.page.locator(".practice-ai"), "尚未生成简化内容");
  const own = await api(b, "/questions/" + q.id + "/generate", "POST", { kind: "summary" }); assert.notEqual(own.content, refreshed.content); assert.equal((await api(a, "/questions/" + q.id + "/generated")).items[0].content, refreshed.content);
  pass("explicit regenerate refreshes server cache; generated content isolated across two accounts");
  const document = { schemaVersion: 2, header: { name: "合成姓名", headline: "前端工程师", contact: "fixture@example.invalid", summary: "唯一摘要原文" }, sections: [{ id: "projects", title: "项目经历", items: [{ id: "item1", title: "重复原文", meta: "重复原文", content: "唯一项目原文" }] }], layout: { template: "classic", fontSize: 14, accent: "purple" } };
  const { resume } = await api(studio, "/resumes", "POST", { title: "合成测试版本", body: { document } }, 201);
  await studio.page.goto(base + "#resume"); const paper = studio.page.getByRole("article", { name: "简历文档", exact: true }); await text(paper, "唯一摘要原文");
  let mutations = 0; studio.page.on("request", r => { if (["PUT", "POST", "DELETE"].includes(r.method()) && new URL(r.url()).pathname.startsWith("/api/resumes")) mutations++; });
  await studio.page.getByRole("button", { name: "✧ 调整布局 / 外观", exact: true }).click(); await studio.page.getByRole("button", { name: "AI推荐布局", exact: true }).click(); await studio.page.getByText("AI布局建议（尚未应用）", { exact: true }).waitFor();
  assert.equal(await studio.page.getByLabel("文档字号", { exact: true }).inputValue(), "14");
  await studio.page.getByRole("button", { name: "应用此布局到草稿", exact: true }).click(); assert.equal(await studio.page.getByLabel("文档字号", { exact: true }).inputValue(), "16");
  assert.deepEqual((await api(studio, "/resumes/" + resume.id)).resume.body.document, document); assert.equal(mutations, 0);
  pass("AI layout preview waits for explicit apply; local draft changes without server save");
  await studio.page.getByRole("button", { name: "关闭工具面板", exact: true }).click();
  await studio.page.getByRole("button", { name: "开始审阅并生成优化建议", exact: true }).click(); await studio.page.getByLabel("编辑建议文本", { exact: true }).first().waitFor();
  const valid = studio.page.locator(".ai-suggestion").filter({ hasText: "header.summary" }); await valid.getByLabel("编辑建议文本", { exact: true }).fill("用户核对编辑摘要"); await text(paper, "唯一摘要原文");
  const accept = studio.page.getByRole("button", { name: "采纳选中建议（写入本地草稿）", exact: true }); assert.equal(await accept.isDisabled(), true);
  await valid.getByRole("checkbox").check(); await text(paper, "唯一摘要原文"); await accept.click(); await text(paper, "用户核对编辑摘要");
  assert.equal((await api(studio, "/resumes/" + resume.id)).resume.body.document.header.summary, document.header.summary); assert.equal(mutations, 0);
  pass("editable review only applies after checkbox plus explicit acceptance; remains local unsaved");
  const wrong = studio.page.locator(".ai-suggestion").filter({ hasText: "header.headline" }); await wrong.getByRole("checkbox").check(); await accept.click();
  const wrongSafe = !(await paper.innerText()).includes("错误目标不应写入");
  if (!wrongSafe) { await shot(studio.page, "wrong-target-failure-desktop"); throw Error("Wrong-target safety failed: explicit header.headline suggestion changed project content"); }
  await wrong.getByRole("checkbox").uncheck();
  await studio.page.locator(".ai-suggestion").filter({ hasText: "未知字段" }).getByRole("checkbox").check(); await accept.click(); assert.equal((await paper.innerText()).includes("歧义不应写入"), false);
  assert.equal(mutations, 0); await shot(studio.page, "resume-review-desktop"); await studio.page.setViewportSize({ width: 390, height: 844 }); await shot(studio.page, "resume-review-390");
  pass("wrong field and ambiguous targets rejected without altering document; desktop and 390px no overflow");
  assert.deepEqual(errors, []); pass("zero browser pageerrors");
} catch (error) { console.error("FAIL", error.stack); process.exitCode = 1; }
finally {
  await fs.writeFile(path.join(artifacts, "results.json"), JSON.stringify({ passed: results, pageerrors: errors, modelCalls: calls, success: !process.exitCode }, null, 2));
  await browser?.close(); if (service && service.exitCode === null) { service.kill("SIGTERM"); await once(service, "exit"); }
  if (upstream) await new Promise(resolve => upstream.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true });
}
