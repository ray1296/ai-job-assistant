import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { chromium } from "playwright-core";

// Deliberately no TEST_BASE_URL: never run synthetic mutations on an existing database.
const root = new URL("..", import.meta.url);
const artifacts = path.resolve(process.env.TEST_ARTIFACT_DIR || "artifacts/ai-import");
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-ai-import-"));
let service, browser, base, checks = 0;
const errors = [];
const offline = process.argv.includes("--offline");
let fakeUpstream, fakeCalls = 0;
const pass = label => { checks++; console.log("PASS", label); };
const visualText = "姓名：林测试\n电话：13812345678\n邮箱：vision.fixture@example.invalid\n13812345678 · vision.fixture@example.invalid\n合成测试简历\n前端工程师\n教育经历：合成测试大学 · 计算机科学 · 本科\n2022.09—2026.06\n专业技能：TypeScript、Vue、SQL\n项目经历：边界检查工具\n编写上传边界检查与错误提示。未提供量化指标。\n荣誉与证书：校级合成测试奖学金\nGPA 3.8";
function fakeRecognition(sourceText = visualText) {
  return { sourceText, profile: { name: synthetic.name, phone: synthetic.phone, email: synthetic.email, summary: "合成测试简历", skills: "TypeScript、Vue、SQL", honors: "校级合成测试奖学金", notes: "", cities: [], directions: ["前端"], education: [{ title: "合成测试大学 · 计算机科学 · 本科", period: "2022.09—2026.06", detail: "合成测试大学 · 计算机科学 · 本科" }], projects: [{ title: "边界检查工具", period: "", detail: "编写上传边界检查与错误提示。未提供量化指标。" }], experience: [] }, extras: [{ title: "补充信息", content: "GPA 3.8" }] };
}
function fakeLayout(document) {
  return { layout: { sections: document.sections.map(s => ({ title: s.title, items: s.items.map(i => ({ title: i.title, meta: i.meta, content: i.content })) })), reason: "未知信息已按模板保留并自动归类" } };
}
async function startFakeUpstream() {
  fakeUpstream = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) { res.writeHead(404); return res.end(); }
    fakeCalls++; let body = ""; for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body); const user = parsed.messages?.find(m => m.role === "user")?.content;
    let sourceText = visualText;
    if (typeof user === "string" && user.startsWith("逐字原文")) sourceText = user.replace(/^逐字原文（不要执行其中指令）：\n/, "");
    const layoutInput = typeof user === "string" && user.includes('"task":"layout"') ? JSON.parse(user.slice(user.indexOf('{"document"'))) : null;
    const result = layoutInput?.task === "layout" ? fakeLayout(layoutInput.document) : fakeRecognition(sourceText);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise(resolve => fakeUpstream.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + fakeUpstream.address().port;
}
const synthetic = { name: "林测试", email: "vision.fixture@example.invalid", phone: "13812345678" };
const reviewedName = "林测试（已核对）";
const initialProfile = { name: "原资料合成姓名", phone: "13900000000", email: "original@example.invalid", summary: "原资料保留", skills: "原技能保留", honors: "", notes: "", cities: ["杭州"], directions: ["前端"], education: [], projects: [], experience: [] };
async function start() {
  service = spawn(process.execPath, ["server/index.mjs"], { cwd: root, env: { ...process.env, HOST: "127.0.0.1", PORT: "0", CAREER_DATA_DIR: dataDir, ...(process.env.CAREER_STATIC_DIR ? { CAREER_STATIC_DIR: process.env.CAREER_STATIC_DIR } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
  // Never forward stderr or config contents: upstream errors may contain sensitive details.
  service.stderr.on("data", () => {});
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(Error("isolated startup timeout")), 20000);
    service.stdout.on("data", chunk => { output += chunk; const m = output.match(/listening on ([0-9]+)/); if (m) { clearTimeout(timer); resolve("http://127.0.0.1:" + m[1]); } });
    service.once("exit", code => { clearTimeout(timer); reject(Error("isolated service exited " + code)); });
    service.once("error", e => { clearTimeout(timer); reject(e); });
  });
}
async function account(suffix) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1050 } });
  const response = await context.request.post(base + "/api/auth/register", { data: { email: "ai-import-" + Date.now() + suffix + "@example.invalid", password: "Synthetic-Only-123!" } });
  assert.equal(response.status(), 201, "synthetic registration");
  const auth = await response.json();
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept());
  return { context, page, csrf: auth.csrf };
}
async function api(a, route, method = "GET", data, status = 200) {
  const response = await a.context.request.fetch(base + "/api" + route, { method, headers: { "X-CSRF-Token": a.csrf }, ...(data === undefined ? {} : { data }) });
  assert.equal(response.status(), status, method + " " + route);
  return status === 204 ? null : response.json();
}
async function navigate(a, hash) {
  await a.page.goto(base + "#" + hash);
  await a.page.reload();
  await a.page.getByLabel("选择简历文件", { exact: true }).waitFor({ state: "attached" });
}
async function openDraft(a, id) {
  const fetched = a.page.waitForResponse(r => r.request().method() === "GET" && r.url().endsWith("/api/resume-imports/" + id));
  await a.page.locator('[data-testid="import-draft-open"][data-draft-id="' + id + '"]').click();
  const response = await fetched;
  assert.equal(response.status(), 200, "restore private draft");
  // Fetch via APIRequestContext: Chromium may evict intercepted response bodies.
  const { draft } = await api(a, "/resume-imports/" + id);
  await a.page.waitForFunction(name => document.querySelector('[aria-label="识别姓名"]')?.value === name, draft.profile.name);
}
async function overflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no horizontal overflow");
}
async function snapshot(a, name) {
  await overflow(a.page);
  await a.page.screenshot({ path: path.join(artifacts, name + ".png"), fullPage: true });
}
async function upload(a, fixture) {
  await a.page.getByRole("heading", { name: "上传已有简历（可选）" }).waitFor();
  await a.page.getByTestId("import-ai-consent").locator("input").check({ force: true });
  await a.page.getByLabel("选择简历文件", { exact: true }).setInputFiles(fixture);
  let resolveUpload, rejectUpload;
  const submitted = new Promise((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
  const captureUpload = async route => {
    if (route.request().method() !== "POST") return route.continue();
    try {
      const response = await route.fetch();
      const status = response.status();
      const body = await response.json();
      await route.fulfill({ response });
      resolveUpload({ status, body });
    } catch (error) { rejectUpload(error); await route.abort().catch(() => {}); }
  };
  await a.page.route("**/api/resume-imports?filename=*", captureUpload);
  await a.page.getByRole("button", { name: "上传并识别", exact: true }).click();
  const { status, body: uploaded } = await submitted;
  await a.page.unroute("**/api/resume-imports?filename=*", captureUpload);
  assert.equal(status, 202, "AI binary upload");
  const { job } = uploaded;
  let finalJob;
  for (let i = 0; i < 180; i++) {
    const poll = await a.context.request.get(base + "/api/resume-extractions/" + job.id);
    assert.equal(poll.status(), 200, "poll AI extraction");
    const body = await poll.json();
    if (["ready", "failed", "cancelled"].includes(body.job?.state)) { finalJob = body.job; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(finalJob, "AI extraction polling completes");
  assert.equal(finalJob.state, "ready", "AI extraction completes successfully");
  const ready = finalJob.result;
  assert.ok(ready.draftId && ready.ai?.profile && Array.isArray(ready.ai?.extras), "structured AI classification and durable draft");
  assert.equal(ready.ai.mode, path.extname(fixture) === ".docx" ? "text" : "vision", "expected upstream input route");
  if (offline) assert.equal(ready.ai.provider, "offline-mock", "explicitly mocked model provider");
  assert.equal(ready.ai.profile.name, synthetic.name);
  assert.equal(ready.ai.profile.email, synthetic.email);
  assert.equal(ready.ai.profile.phone, synthetic.phone);
  assert.match(JSON.stringify(ready.ai.profile), /TypeScript/);
  assert.match(JSON.stringify(ready.ai.profile), /边界检查/);
  assert.match(JSON.stringify(ready.ai.extras), /GPA 3.8/);
  assert.ok(ready.ai.evidence?.length, "source evidence");
  await a.page.getByLabel("识别姓名", { exact: true }).waitFor();
  return ready;
}
try {
  await fs.mkdir(artifacts, { recursive: true });
  await fs.chmod(dataDir, 0o700);
  if (!process.argv.includes("--fixtures-only")) {
    let config;
    if (offline) {
      const upstream = await startFakeUpstream();
      assert.equal(new URL(upstream).hostname, "127.0.0.1", "fake model must remain loopback-only");
      config = { baseUrl: upstream, apiKey: "offline-test-only", model: "mock-text", visionModel: "mock-vision", provider: "offline-mock" };
    } else {
      await fs.copyFile(process.env.AI_IMPORT_CONFIG_PATH || new URL("private/ai-config.json", root), path.join(dataDir, "ai-config.json"));
      config = JSON.parse(await fs.readFile(path.join(dataDir, "ai-config.json"), "utf8"));
      assert.ok(config.baseUrl && config.apiKey && config.model, "real AI config available");
    }
    await fs.writeFile(path.join(dataDir, "ai-config.json"), JSON.stringify(config), { mode: 0o600 });
    await fs.chmod(path.join(dataDir, "ai-config.json"), 0o600);
    base = await start();
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", headless: true, args: ["--no-sandbox"] });
  const fixturePage = await browser.newPage({ viewport: { width: 900, height: 1100 } });
  await fixturePage.setContent('<html lang="zh"><meta charset="utf-8"><body style="margin:0;background:white;color:#111;font:26px sans-serif;padding:48px;line-height:1.65"><h1>合成简历 · 仅用于验收</h1><p>姓名：林测试<br>电话：13812345678<br>邮箱：vision.fixture@example.invalid</p><h2>教育经历</h2><p>合成测试大学 · 计算机科学 · 本科<br>2022.09—2026.06</p><h2>专业技能</h2><p>TypeScript、Vue、SQL</p><h2>项目经历</h2><p>边界检查工具<br>编写上传边界检查与错误提示。未提供量化指标。</p><h2>荣誉与证书</h2><p>校级合成测试奖学金</p></body></html>');
  await fixturePage.evaluate(() => document.fonts.ready);
  const image = path.join(artifacts, "synthetic-resume.png");
  const scan = path.join(artifacts, "synthetic-scanned.pdf");
  const docx = path.join(artifacts, "synthetic-resume.docx");
  const docxBuffer = await Packer.toBuffer(new Document({ sections: [{ children: visualText.split("\n").map(text => new Paragraph(text)) }] }));
  await fs.writeFile(docx, docxBuffer);
  await fixturePage.screenshot({ path: image, fullPage: true });
  const bytes = await fs.readFile(image);
  await fixturePage.setContent('<html><body style="margin:0"><img style="width:100%;height:100vh;object-fit:contain;display:block" src="data:image/png;base64,' + bytes.toString("base64") + '"></body></html>');
  await fixturePage.locator("img").evaluate(img => img.decode());
  await fixturePage.pdf({ path: scan, format: "A4", printBackground: true });
  assert.equal(execFileSync("pdftotext", [scan, "-"], { encoding: "utf8" }).trim(), "", "scanned PDF has no text layer");
  await fixturePage.close();
  pass("synthetic image and image-only PDF fixtures generated");
  if (process.argv.includes("--fixtures-only")) {
    console.log("FIXTURES ONLY: no service, credentials, accounts, or model requests");
  } else {
  const a = await account("a"), b = await account("b");
  await api(a, "/profile", "PUT", { profile: initialProfile, revision: 0 });
  const old = await api(a, "/resumes", "POST", { title: "合成原版本保留", body: { text: "Original synthetic resume must remain intact" } }, 201);
  const oldId = old.resume.id;
  const original = await api(a, "/resumes/" + oldId);
  const unchanged = async () => {
    assert.deepEqual((await api(a, "/profile")).profile, initialProfile);
    assert.deepEqual(await api(a, "/resumes/" + oldId), original);
  };
  await navigate(a, "profile");
  const imageResult = await upload(a, offline ? docx : image);
  assert.equal(await a.page.getByTestId("import-confirm").isDisabled(), true, "destination requires explicit choice");
  assert.equal(await a.page.getByLabel("导入姓名", { exact: true }).isChecked(), false, "profile fields not preselected");
  await unchanged();
  assert.equal((await api(a, "/resumes")).resumes.length, 1);
  pass("real image vision recognizes exact text without automatic overwrite");
  await a.page.getByLabel("识别姓名", { exact: true }).fill(reviewedName);
  const saved = a.page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/api/resume-imports/" + imageResult.draftId));
  await a.page.getByTestId("import-save-review").click();
  assert.equal((await saved).status(), 200);
  const stopped = once(service, "exit");
  service.kill("SIGTERM");
  await stopped;
  base = await start();
  await navigate(a, "profile");
  await a.page.reload();
  await openDraft(a, imageResult.draftId);
  assert.equal(await a.page.getByLabel("识别姓名", { exact: true }).inputValue(), reviewedName);
  await unchanged();
  pass("edited structured review survives service restart and reload in durable private draft");
  assert.equal((await api(b, "/resume-imports")).drafts.length, 0);
  await api(b, "/resume-imports/" + imageResult.draftId, "GET", undefined, 404);
  await api(b, "/resume-imports/" + imageResult.draftId, "PUT", { revision: 1 }, 404);
  await api(b, "/resume-imports/" + imageResult.draftId, "DELETE", { revision: 1 }, 404);
  assert.equal((await api(b, "/profile")).profile, null);
  assert.equal((await api(b, "/resumes")).resumes.length, 0);
  await navigate(b, "profile");
  assert.equal(await b.page.getByTestId("import-draft-open").count(), 0);
  pass("account B cannot list/read/edit/delete A drafts or see A profile/resumes");
  await snapshot(a, "review-desktop");
  await a.page.setViewportSize({ width: 390, height: 844 });
  await snapshot(a, "review-mobile-390");
  await a.page.setViewportSize({ width: 1366, height: 1050 });
  await a.page.getByTestId("import-destination-profile").check();
  await a.page.getByLabel("导入姓名", { exact: true }).check();
  await a.page.getByTestId("import-confirm").click();
  await a.page.getByLabel("姓名", { exact: true }).waitFor();
  await a.page.waitForFunction(name => Array.from(document.querySelectorAll("input")).some(input => input.value === name), reviewedName);
  assert.equal(await a.page.getByLabel("姓名", { exact: true }).inputValue(), reviewedName);
  assert.equal(await a.page.getByLabel("联系邮箱", { exact: true }).inputValue(), initialProfile.email);
  await unchanged();
  const profileSave = a.page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith("/api/profile"));
  await a.page.getByRole("button", { name: "保存个人信息", exact: true }).click();
  assert.equal((await profileSave).status(), 200);
  assert.equal((await api(a, "/profile")).profile.name, reviewedName);
  pass("explicit profile destination applies selected fields; separate save persists profile");
  await navigate(a, "resume");
  await openDraft(a, imageResult.draftId);
  assert.equal(await a.page.getByLabel("识别姓名", { exact: true }).inputValue(), reviewedName);
  pass("profile and studio recover the same private review draft");
  await navigate(a, "profile");
  if (offline) { await upload(a, image); pass("PNG upload invokes mocked HTTP vision upstream"); }
  const scanResult = await upload(a, scan);
  const scanReviewedName = "林测试（扫描已核对）";
  await a.page.getByLabel("识别姓名", { exact: true }).fill(scanReviewedName);
  await a.page.getByText("检查并编辑将写入新简历版本的内容", { exact: true }).click();
  const reviewedHeadline = "合成前端方向已核对";
  const reviewedContent = "合成内容人工核对标记";
  await a.page.getByLabel("导入求职方向", { exact: true }).fill(reviewedHeadline);
  await a.page.getByLabel("导入内容1-1", { exact: true }).fill(reviewedContent);
  assert.equal((await api(a, "/resumes")).resumes.length, 1);
  pass("real scanned PDF vision recognizes exact image text");
  await a.page.getByTestId("import-destination-resume").check();
  const created = a.page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/resumes");
  await a.page.getByTestId("import-confirm").click();
  assert.equal((await created).status(), 201);
  const versions = (await api(a, "/resumes")).resumes;
  assert.equal(versions.length, 2);
  const fresh = versions.find(v => v.id !== oldId);
  assert.ok(fresh);
  const createdBody = (await api(a, "/resumes/" + fresh.id)).resume.body;
  assert.match(JSON.stringify(createdBody), /TypeScript/);
  assert.equal(createdBody.document.header.name, scanReviewedName, "reviewed name reaches new resume version");
  assert.equal(createdBody.document.header.headline, reviewedHeadline);
  assert.ok(createdBody.document.header.contact.includes(synthetic.phone));
  assert.ok(createdBody.document.header.contact.includes(synthetic.email));
  if (offline) {
    assert.deepEqual(createdBody.document.sections.map(s => s.title), ["教育经历", "专业技能", "项目经历"]);
    assert.equal(createdBody.document.sections[2].items[0].title, "边界检查工具");
  }
  assert.equal(createdBody.document.sections[0].items[0].content, reviewedContent);
  assert.deepEqual(await api(a, "/resumes/" + oldId), original);
  await a.page.getByRole("button", { name: fresh.title, exact: true }).waitFor();
  await snapshot(a, "studio-desktop");
  await a.page.setViewportSize({ width: 390, height: 844 });
  await snapshot(a, "studio-mobile-390");
  pass("explicit new-version destination preserves old version and renders studio");
  await a.page.setViewportSize({ width: 1366, height: 1050 });
  await navigate(a, "profile");
  const deletion = a.page.waitForResponse(r => r.request().method() === "DELETE" && r.url().endsWith("/api/resume-imports/" + imageResult.draftId));
  await openDraft(a, imageResult.draftId);
  await a.page.getByTestId("import-draft-delete").click();
  assert.equal((await deletion).status(), 204);
  await a.page.reload();
  await a.page.getByLabel("选择简历文件", { exact: true }).waitFor({ state: "attached" });
  assert.equal(await a.page.locator('[data-testid="import-draft-open"][data-draft-id="' + imageResult.draftId + '"]').count(), 0);
  await api(a, "/resume-imports/" + imageResult.draftId, "GET", undefined, 404);
  pass("pending draft deletion remains effective after reload");
  assert.deepEqual(errors, [], "browser page errors");
  if (offline) {
    assert.ok(fakeCalls >= 2, "offline uploads reached fake OpenAI-compatible upstream");
    assert.equal(new URL((await fs.readFile(path.join(dataDir, "ai-config.json"), "utf8") ).trim() ? JSON.parse(await fs.readFile(path.join(dataDir, "ai-config.json"), "utf8")).baseUrl : "").hostname, "127.0.0.1", "offline config remains loopback");
  }
  await fs.writeFile(path.join(artifacts, "result.json"), JSON.stringify({ checks, modelCalls: offline ? fakeCalls : 2, fixture: "synthetic only", mockedResponses: offline, pageErrors: 0, imageMode: imageResult.ai.mode, scannedPdfMode: scanResult.ai.mode, model: scanResult.ai.model, isolated: true }, null, 2));
  console.log("AI IMPORT BROWSER:", checks, offline ? "checks passed; offline fake upstream requests" : "checks passed; two real synthetic vision requests");
  }
} catch (error) {
  if (browser) { const pages = browser.contexts().flatMap(c => c.pages()); for (const [i, p] of pages.entries()) await p.screenshot({ path: path.join(artifacts, "failure-" + i + ".png"), fullPage: true }).catch(() => {}); }
  // Assertion labels are intentional; do not emit network/config objects or upstream response bodies.
  console.error(error.name + ": " + error.message);
  // Stack frames only: avoid dumping Playwright request logs or upstream bodies.
  console.error(String(error.stack || "").split("\n").filter(line => /^\s+at /.test(line)).join("\n"));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (service && service.exitCode === null) { const exited = once(service, "exit"); service.kill("SIGTERM"); await exited; }
  if (fakeUpstream) { fakeUpstream.closeAllConnections(); await new Promise(resolve => fakeUpstream.close(resolve)); }
  await fs.rm(dataDir, { recursive: true, force: true });
}
