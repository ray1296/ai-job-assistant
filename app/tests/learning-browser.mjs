import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

let base = process.env.TEST_BASE_URL, service, dataDir, browser, page;
const artifactDir = process.env.TEST_ARTIFACT_DIR || "artifacts/learning";
const errors = [];
let checks = 0;
const pass = label => { console.log("PASS", label); checks++; };
try {
  if (!base) {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "career-learning-"));
    service = spawn(process.execPath, ["server/index.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, PORT: "0", HOST: "127.0.0.1", CAREER_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    base = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(Error("isolated service startup timeout")), 15000);
      service.stdout.on("data", chunk => {
        output += chunk;
        const match = output.match(/listening on ([0-9]+)/);
        if (match) { clearTimeout(timer); resolve("http://127.0.0.1:" + match[1]); }
      });
      service.stderr.on("data", () => {});
      service.once("exit", code => { clearTimeout(timer); reject(Error("isolated service exited " + code)); });
      service.once("error", error => { clearTimeout(timer); reject(error); });
    });
  }
  await fs.mkdir(artifactDir, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
    headless: true, args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1050 } });
  page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  async function json(route) {
    const response = await context.request.get(base + route);
    assert.equal(response.status(), 200, route + " status");
    return response.json();
  }
  async function register(suffix) {
    await page.goto(base);
    await page.getByRole("button", { name: "登录 / 注册", exact: true }).click();
    await page.getByRole("button", { name: "没有账号？注册一个", exact: true }).click();
    await page.getByLabel("邮箱", { exact: true }).fill("learning-" + Date.now() + "-" + suffix + "@example.invalid");
    await page.getByLabel("密码（10—128位）").fill("Synthetic-Only-123!");
    await page.getByRole("button", { name: "创建账号", exact: true }).click();
    await page.getByRole("button", { name: "退出登录", exact: true }).waitFor();
  }
  async function route(hash, testid) {
    await page.goto(base + "#" + hash);
    if (testid) await page.getByTestId(testid).waitFor();
  }
  async function noOverflow(label) {
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    assert.ok(sizes.scroll <= sizes.viewport + 1, label + " overflow " + JSON.stringify(sizes));
  }
  async function mutation(action, questionId) {
    const saved = page.waitForResponse(r => r.request().method() === "PUT" && r.url().includes(questionId));
    await action();
    assert.equal((await saved).status(), 200, "learning state write");
  }
  await register("a");
  pass("registers temporary account A through real UI");
  await route("knowledge", "knowledge-page");
  const catalog = await json("/api/questions?page=1&pageSize=20");
  assert.ok(catalog.questions.length > 0);
  const question = catalog.questions.find(q => q.answer) || catalog.questions[0];
  const id = question.id;
  const getQuestion = async () => (await json("/api/questions/" + id)).question;
  const term = question.question.slice(0, 16);
  const results = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/questions" && new URL(r.url()).searchParams.get("q") === term);
  await page.getByLabel("搜索题目", { exact: true }).fill(term);
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  assert.equal((await results).status(), 200);
  for (const [label, key, value] of [["题目方向", "direction", question.direction], ["题目分类", "category", question.category]]) {
    await page.getByLabel(label, { exact: true }).selectOption(value);
    await page.waitForTimeout(250);
    const body = await json("/api/questions?" + new URLSearchParams({ q: term, direction: question.direction, category: question.category }));
    assert.ok(body.questions.length && body.questions.every(q => q[key] === value), "real filter returns matching " + key);
  }
  const row = page.locator('[data-question-id="' + id + '"]');
  await row.waitFor();
  const filtered = await json("/api/questions?" + new URLSearchParams({ q: term, direction: question.direction, category: question.category }));
  assert.ok(filtered.questions.some(q => q.id === id));
  assert.ok(filtered.questions.every(q => q.direction === question.direction && q.category === question.category));
  pass("search and direction/category filtering use real catalog");
  await page.screenshot({ path: path.join(artifactDir, "knowledge-desktop.png"), fullPage: true });
  await row.getByRole("button", { name: "学习此题", exact: true }).click();
  await page.getByTestId("practice-page").waitFor();
  await page.getByRole("button", { name: "显示答案", exact: true }).click();
  const answer = page.getByRole("region", { name: "答题要点", exact: true });
  await answer.waitFor();
  assert.ok((await answer.innerText()).trim());
  if (question.answer) assert.ok((await answer.innerText()).includes(question.answer.slice(0, 30)));
  else assert.ok((await answer.innerText()).includes("未提供答题要点"));
  pass("reveals actual source answer");
  await mutation(() => page.getByRole("button", { name: "收藏", exact: true }).click(), id);
  assert.equal((await getQuestion()).state.favorite, true);
  assert.equal((await getQuestion()).state.attempts, 0);
  await mutation(() => page.getByRole("button", { name: "自评待复习", exact: true }).click(), id);
  const saved = (await getQuestion()).state;
  assert.equal(saved.status, "review"); assert.equal(saved.attempts, 1);
  await page.reload();
  await page.getByTestId("practice-page").waitFor();
  await page.getByTestId("scope-favorites").click();
  await page.getByRole("button", { name: "取消收藏", exact: true }).waitFor();
  assert.equal((await getQuestion()).state.status, "review");
  assert.equal((await getQuestion()).state.attempts, 1);
  pass("favorite and self-assessment survive reload without extra attempts");
  await page.screenshot({ path: path.join(artifactDir, "practice-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow("practice 390px");
  await page.screenshot({ path: path.join(artifactDir, "practice-mobile-390.png"), fullPage: true });
  await route("knowledge", "knowledge-page");
  await page.locator("[data-question-id]").first().waitFor();
  await noOverflow("knowledge 390px");
  await page.screenshot({ path: path.join(artifactDir, "knowledge-mobile-390.png"), fullPage: true });
  pass("authenticated knowledge and practice at 390px have no overflow");
  await page.setViewportSize({ width: 1366, height: 1050 });

  await route("jobs");
  await page.getByRole("button", { name: "加入投递意向", exact: true }).first().click();
  await page.getByRole("button", { name: "保存投递意向", exact: true }).click();
  await page.getByText("投递意向已保存（包括清空选择）", { exact: true }).waitFor();
  await page.getByRole("link", { name: "前往投递方案 →", exact: true }).click();
  const draft = "浏览器独立验收：先核对岗位要求，再完善真实经历。";
  await page.getByLabel("投递话术", { exact: true }).fill(draft);
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await page.getByText("草稿已保存", { exact: true }).waitFor();
  await page.reload();
  await page.getByLabel("投递话术", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("投递话术", { exact: true }).inputValue(), draft);
  await page.screenshot({ path: path.join(artifactDir, "plan-reloaded.png"), fullPage: true });
  pass("live jobs to plan draft saves and survives reload");

  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await register("b");
  await route("practice", "practice-page");
  const other = (await getQuestion()).state;
  assert.equal(other.favorite, false); assert.equal(other.status, "unseen"); assert.equal(other.attempts, 0);
  const emptyFavorites = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/questions" && new URL(r.url()).searchParams.get("scope") === "favorites");
  await page.getByTestId("scope-favorites").click();
  assert.equal((await (await emptyFavorites).json()).total, 0);
  assert.equal((await json("/api/application-plan")).items.length, 0);
  pass("temporary account B cannot see account A learning state or plan");
  assert.deepEqual(errors, []);
  pass("no browser page errors");
  console.log("TOTAL", checks, "learning browser checks passed");
} catch (error) {
  await page?.screenshot({ path: path.join(artifactDir, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (service && service.exitCode === null) { service.kill("SIGTERM"); await once(service, "exit"); }
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
}
