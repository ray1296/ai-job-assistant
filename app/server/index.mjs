import http from "node:http";
import { profileData, string } from "./profile-data.mjs";
import { createLearning } from "./learning-state.mjs";
import { questionFacets, questionCount } from "./learning-catalog.mjs";
import { createExtractionService } from "./resume-extraction.mjs";
import { createResumeImports } from "./resume-import.mjs";
import { createAiGateway, validateLayoutInput } from "./ai-gateway.mjs";
import { createApplicationPlan } from "./application-plan.mjs";
import { createDashboard } from "./dashboard.mjs";
import { createDatasets } from "./datasets.mjs";
import { createGeo } from "./geo.mjs";
import { createStudy } from "./study.mjs";
import { createAgents } from "./agents.mjs";
import { TOOLS, callTool } from "./tools.mjs";
import { loadCompanies, getCompany, loadPlatformHousing } from "./data-catalog.mjs";
import { createApplicationCopy } from "./application-copy.mjs";
import { listJobs, getJob, facets } from "./jobs-catalog.mjs";
import { validateDocument, documentText } from "./resume-document.mjs";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.resolve(
  process.env.CAREER_DATA_DIR || path.join(root, "private"),
);
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
fs.chmodSync(dataDir, 0o700);
const extraction = createExtractionService(dataDir, (...args) =>
  resumeImports.recognize(...args),
);
const aiGateway = createAiGateway(dataDir);
const DATASET_FIELDS = {
  jobs: { title: "岗位名称", company: "公司", city: "城市", salary: "薪资", education: "学历", address: "详细地址", status: "投递状态", link: "链接", appliedAt: "投递时间", notes: "备注" },
  companies: { name: "企业名称", industry: "行业", scale: "规模", city: "城市", address: "地址", website: "官网", notes: "备注" },
  housing: { title: "房源标题", address: "地址", rent: "月租", area: "面积", layout: "户型", city: "城市", contact: "联系人", phone: "电话", notes: "备注" },
  knowledge: { topic: "主题", question: "问题", answer: "答案", tags: "标签", source: "来源" },
};
const dashboardData = createDashboard();
// AI 是否配置可用：读 ai-config.json（不落日志、不返回密钥）。
function aiConfigured() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(dataDir, "ai-config.json"), "utf8"),
    );
    return !!(cfg?.baseUrl && cfg?.apiKey && cfg?.model);
  } catch {
    return false;
  }
}
const dbPath = path.join(dataDir, "career.sqlite");
const db = new DatabaseSync(dbPath, { timeout: 3000 });
fs.chmodSync(dbPath, 0o600);
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;",
);
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS profiles(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS resumes(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS resumes_owner ON resumes(user_id,updated_at);
CREATE TABLE IF NOT EXISTS job_intents(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,job_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,job_id));
CREATE INDEX IF NOT EXISTS job_intents_owner ON job_intents(user_id,created_at);
PRAGMA user_version=1;`);
db.exec("CREATE TABLE IF NOT EXISTS study_favorites(user_id TEXT NOT NULL, question_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,question_id));");
db.exec("CREATE TABLE IF NOT EXISTS study_wrong(user_id TEXT NOT NULL, question_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,question_id));");
const applicationPlan = createApplicationPlan(db, getJob);
const learning = createLearning(db);
const resumeImports = createResumeImports(db, dataDir, profileData);
const applicationCopy = createApplicationCopy(dataDir);
// 数据空间：依赖 db 与 aiGateway，必须在这两者之后创建
const datasets = createDatasets(db, dataDir, {
  ai: {
    dataset: (input) => aiGateway.dataset(null, { ...input, fields: DATASET_FIELDS }),
    salary: (input) => aiGateway.salary(null, input),
  },
});
// 学习与刷题：科目/版本/题库 + AI 讲题与出题
const study = createStudy(db, { ai: aiGateway });
const agents = createAgents(dataDir);
// 地图与通勤：高德 REST 只在服务端调用，key 不落前端包
const geo = createGeo(dataDir, {
  db,
  intentJobIds: (userId) => applicationPlan.jobIds(userId),
  getJob,
  housingSets: (userId) => datasets.rowsForMap(userId, "housing", 120),
});
const stmt = {
  user: db.prepare(
    "SELECT id,email,password_hash,salt FROM users WHERE email=?",
  ),
  session: db.prepare(
    "SELECT s.user_id,s.csrf,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?",
  ),
  profile: db.prepare(
    "SELECT body,revision,updated_at FROM profiles WHERE user_id=?",
  ),
  resume: db.prepare(
    "SELECT id,title,body,revision,created_at,updated_at FROM resumes WHERE id=? AND user_id=?",
  ),
};
const hash = (s) => createHash("sha256").update(s).digest("hex");
const derive = promisify(scrypt);
let cryptoActive = 0;
const cryptoMax = 4;
async function passwordHash(password, salt) {
  if (cryptoActive >= cryptoMax) throw failure(503, "认证繁忙，请稍后重试");
  cryptoActive++;
  try {
    return Buffer.from(
      await derive(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 32 * 1024 * 1024,
      }),
    ).toString("hex");
  } finally {
    cryptoActive--;
  }
}
const rate = new Map();
function limited(key, max, window = 60000) {
  const now = Date.now();
  let b = rate.get(key);
  if (!b || b.end < now) {
    b = { n: 0, end: now + window };
    if (rate.size > 10000) rate.delete(rate.keys().next().value);
    rate.set(key, b);
  }
  if (++b.n > max) throw failure(429, "操作太频繁，请稍后重试");
}
const failure = (status, message) =>
  Object.assign(new Error(message), { status });
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!String(req.headers["content-type"] || "").startsWith("application/json"))
    throw failure(415, "请使用JSON请求");
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128 * 1024) throw failure(413, "内容过大，请缩减后保存");
    parts.push(chunk);
  }
  try {
    const x = JSON.parse(Buffer.concat(parts).toString());
    if (!x || Array.isArray(x) || typeof x !== "object") throw 0;
    return x;
  } catch {
    throw failure(400, "请求内容格式有误");
  }
}
function session(req) {
  const token = String(req.headers.cookie || "").match(
    /(?:^|;\s*)career_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  return token ? stmt.session.get(hash(token), Date.now()) : null;
}
function credentials(x) {
  if (
    typeof x.email !== "string" ||
    x.email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(x.email)
  )
    throw failure(400, "请输入有效邮箱");
  if (
    typeof x.password !== "string" ||
    x.password.length < 10 ||
    x.password.length > 128
  )
    throw failure(400, "密码需10至128位");
  return { email: x.email.trim().toLowerCase(), password: x.password };
}
function login(res, u) {
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    hash(token),
    u.id,
    csrf,
    Date.now() + 7 * 86400000,
  );
  res.setHeader(
    "Set-Cookie",
    "career_session=" +
      token +
      "; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800" +
      (process.env.CAREER_SECURE_COOKIE === "true" ? "; Secure" : ""),
  );
  return { user: { id: u.id, email: u.email }, csrf };
}
function resumeOut(r) {
  return r ? { ...r, body: JSON.parse(r.body) } : null;
}
function resumeData(x) {
  const title = string(x.title, 120, "版本名称").trim();
  if (!title) throw failure(400, "请填写版本名称");
  if (!x.body || typeof x.body !== "object")
    throw failure(400, "简历内容格式错误");
  if (x.body.document !== undefined) {
    const document = validateDocument(x.body.document);
    const text = documentText(document);
    if (
      text.length > 60000 ||
      Buffer.byteLength(JSON.stringify(document)) > 110000
    )
      throw failure(400, "简历内容过大，请精简后保存");
    return { title, body: { text, document } };
  }
  return {
    title,
    body: { text: string(x.body.text ?? "", 60000, "简历正文") },
  };
}
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = http.createServer(async (req, res) => {
  const requestId = randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self)",
  );
  res.setHeader(
    "Content-Security-Policy",
    // 高德 JS 地图需要放开它自己的脚本、瓦片与接口域名（只放行 amap.com / autonavi.com）
    "default-src 'self'; " +
      // 高德 JS SDK 2.0 内部使用 eval/Function 解析矢量数据，必须放开 'unsafe-eval'
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://webapi.amap.com https://*.amap.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob: https://*.amap.com https://*.is.autonavi.com https://*.autonavi.com; " +
      "connect-src 'self' https://*.amap.com https://*.autonavi.com; " +
      "font-src 'self' data: https://*.amap.com; " +
      "media-src 'self' blob:; " +
      // 高德 SDK 用 blob: Worker 做渲染，不显式声明 worker-src 会回退到 script-src 而被拦
      "worker-src 'self' blob:; child-src 'self' blob:; " +
      "frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  );
  try {
    const url = new URL(req.url, "http://local"),
      p = url.pathname,
      m = req.method;
    if (p.startsWith("/api/")) {
      limited("api:" + req.socket.remoteAddress, 300);
      if (m !== "GET" && m !== "HEAD") {
        const origin = req.headers.origin;
        if (origin) {
          let host;
          try {
            host = new URL(origin).host;
          } catch {
            throw failure(403, "来源校验失败");
          }
          if (host !== req.headers.host) throw failure(403, "来源校验失败");
        }
        if (req.headers["sec-fetch-site"] === "cross-site")
          throw failure(403, "跨站请求被拒绝");
      }
      if (p === "/api/health" && m === "GET")
        return send(res, 200, {
          status: "ok",
          batch: 3,
          learning: true,
          questionCount,
          localExtraction: true,
          // 反映真实配置，而不是写死；此前写死 false 会误导排查。
          ai: aiConfigured(),
          resumeDocument: 2,
        });
      if (p === "/api/auth/session" && m === "GET") {
        const s = session(req);
        return send(
          res,
          200,
          s
            ? { user: { id: s.user_id, email: s.email }, csrf: s.csrf }
            : { user: null, csrf: null },
        );
      }
      if (
        (p === "/api/auth/register" || p === "/api/auth/login") &&
        m === "POST"
      ) {
        limited("auth:" + req.socket.remoteAddress, 20, 15 * 60000);
        const x = credentials(await body(req));
        let u = stmt.user.get(x.email);
        if (p.endsWith("register")) {
          if (u) throw failure(409, "该邮箱无法注册，请尝试登录");
          const salt = randomBytes(16).toString("hex"),
            password = await passwordHash(x.password, salt),
            id = randomBytes(16).toString("hex");
          try {
            db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
              id,
              x.email,
              password,
              salt,
              Date.now(),
            );
          } catch (e) {
            if (String(e.code || "").includes("SQLITE"))
              throw failure(409, "该邮箱无法注册，请尝试登录");
            throw e;
          }
          return send(res, 201, login(res, { id, email: x.email }));
        }
        const expected = u?.password_hash || "0".repeat(128),
          actual = await passwordHash(x.password, u?.salt || "a".repeat(32));
        if (
          !u ||
          !timingSafeEqual(
            Buffer.from(actual, "hex"),
            Buffer.from(expected, "hex"),
          )
        )
          throw failure(401, "邮箱或密码不正确");
        return send(res, 200, login(res, u));
      }
      const s = session(req);
      if (!s) throw failure(401, "请先登录，未保存内容仍保留在当前页面");
      if (m !== "GET" && m !== "HEAD") {
        if (
          typeof req.headers["x-csrf-token"] !== "string" ||
          req.headers["x-csrf-token"] !== s.csrf
        )
          throw failure(403, "会话校验失败，请刷新后重试");
      }
      if (p === "/api/resume-imports" && m === "GET")
        return send(res, 200, { drafts: resumeImports.list(s.user_id) });
      if (p === "/api/resume-imports" && m === "POST") {
        if (req.headers["x-ai-consent"] !== "true")
          throw failure(400, "请先同意将本次简历发送到AI服务识别");
        if (
          String(req.headers["content-type"] || "").startsWith(
            "application/json",
          )
        ) {
          const x = await body(req),
            controller = new AbortController();
          const cancel = () => {
            if (!res.writableEnded) controller.abort();
          };
          res.on("close", cancel);
          try {
            return send(res, 201, {
              draft: await resumeImports.recognize(
                s.user_id,
                { text: x.text, filename: "修正后简历" },
                controller.signal,
              ),
            });
          } finally {
            res.off("close", cancel);
          }
        }
        req.headers["x-file-name"] = encodeURIComponent(
          new URL(req.url, "http://local").searchParams.get("filename") ||
            "上传的简历",
        );
        return send(res, 202, {
          job: await extraction.create(req, s.user_id, true),
        });
      }
      const reprocessMatch = p.match(/^\/api\/resume-imports\/([a-f0-9-]{36})\/reprocess$/);
      if (reprocessMatch && m === "POST") {
        if (req.headers["x-ai-consent"] !== "true") throw failure(400, "请先同意AI重新整理");
        const x = await body(req), controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.on("close", cancel);
        try { return send(res, 200, { draft: await resumeImports.reprocess(reprocessMatch[1], s.user_id, x.sourceText, x.revision, controller.signal) }); }
        finally { res.off("close", cancel); }
      }
      const importMatch = p.match(/^\/api\/resume-imports\/([a-f0-9-]{36})$/);
      if (importMatch) {
        const id = importMatch[1];
        if (m === "GET")
          return send(res, 200, { draft: resumeImports.get(id, s.user_id) });
        if (m === "PUT")
          return send(res, 200, {
            draft: resumeImports.update(id, s.user_id, await body(req)),
          });
        if (m === "DELETE") {
          const x = await body(req);
          resumeImports.delete(id, s.user_id, x.revision);
          res.writeHead(204, { "Cache-Control": "no-store" });
          return res.end();
        }
      }
      if (p === "/api/questions" && m === "GET")
        return send(
          res,
          200,
          learning.list(
            s.user_id,
            Object.fromEntries(new URL(req.url, "http://local").searchParams),
          ),
        );
      if (p === "/api/questions/facets" && m === "GET")
        return send(res, 200, questionFacets());
      if (p === "/api/learning/summary" && m === "GET")
        return send(res, 200, learning.summary(s.user_id));
      const generatedMatch = p.match(/^\/api\/questions\/([a-f0-9]{24})\/(generate|generated)$/);
      if (generatedMatch) {
        const question = learning.detail(s.user_id, generatedMatch[1]).question;
        db.exec("CREATE TABLE IF NOT EXISTS learning_generated(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question_id TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,question_id,kind))");
        if (generatedMatch[2] === "generated" && m === "GET") return send(res, 200, { items: db.prepare("SELECT body FROM learning_generated WHERE user_id=? AND question_id=? ORDER BY updated_at DESC").all(s.user_id, question.id).map(row => JSON.parse(row.body)) });
        if (generatedMatch[2] === "generate" && m === "POST") {
          const x = await body(req);
          if (!["summary", "choice", "judgment", "cloze", "code"].includes(x.kind)) throw failure(400, "不支持的AI题型");
          const cached = db.prepare("SELECT body FROM learning_generated WHERE user_id=? AND question_id=? AND kind=?").get(s.user_id, question.id, x.kind);
          if (cached && !x.regenerate) return send(res, 200, { ...JSON.parse(cached.body), cached: true });
          const result = await aiGateway.learning(s.user_id, { kind: x.kind, question: question.question, answer: question.answer, source: question.source });
          const generated = { ...result, questionId: question.id, generatedAt: new Date().toISOString(), label: "AI生成 · 请核对来源" };
          db.prepare("INSERT INTO learning_generated(user_id,question_id,kind,body,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,question_id,kind) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at").run(s.user_id, question.id, x.kind, JSON.stringify(generated), Date.now());
          return send(res, 200, generated);
        }
      }
      const questionMatch = p.match(
        /^\/api\/questions\/([a-f0-9]{24})(\/state)?$/,
      );
      if (questionMatch && !questionMatch[2] && m === "GET")
        return send(res, 200, learning.detail(s.user_id, questionMatch[1]));
      if (questionMatch && questionMatch[2] && m === "PUT")
        return send(
          res,
          200,
          learning.save(s.user_id, questionMatch[1], await body(req)),
        );
      // 地图改为自绘瓦片后，前端不再需要高德 key；key 只留在服务端。
      // ---- 学习与刷题 ----
      if (p === "/api/study/subjects" && m === "GET")
        return send(res, 200, { subjects: study.subjects(s.user_id), directions: study.catalogDirections() });
      if (p === "/api/study/subjects" && m === "POST") {
        const payload = await body(req);
        return send(res, 201, { subject: study.createSubject(s.user_id, payload.name) });
      }
      {
        const mm = p.match(/^\/api\/study\/subjects\/([a-z0-9]+)$/);
        if (mm && m === "PUT") {
          const payload = await body(req);
          return send(res, 200, study.renameSubject(s.user_id, mm[1], payload.name));
        }
        if (mm && m === "DELETE") return send(res, 200, study.removeSubject(s.user_id, mm[1]));
      }
      {
        const mm = p.match(/^\/api\/study\/subjects\/([a-z0-9]+)\/versions$/);
        if (mm && m === "POST") {
          const payload = await body(req);
          let rows = Array.isArray(payload.questions) ? payload.questions : [];
          if (!rows.length && payload.fromCatalog) rows = study.questionsFromCatalog(String(payload.fromCatalog || ""), Math.min(500, Number(payload.limit) || 120));
          return send(res, 201, { version: study.createVersion(s.user_id, mm[1], { name: payload.name, source: payload.source || "平台面经题库", questions: rows }) });
        }
      }
      {
        const mm = p.match(/^\/api\/study\/versions\/([a-z0-9]+)$/);
        if (mm && m === "PUT") {
          const payload = await body(req);
          return send(res, 200, study.renameVersion(s.user_id, mm[1], payload.name));
        }
        if (mm && m === "DELETE") return send(res, 200, study.removeVersion(s.user_id, mm[1]));
      }
      {
        const mm = p.match(/^\/api\/study\/versions\/([a-z0-9]+)\/questions$/);
        if (mm && m === "GET") {
          const url = new URL(req.url, "http://x");
          return send(res, 200, study.questions(s.user_id, mm[1], { type: String(url.searchParams.get("type") || "") }));
        }
      }
      {
        const mm = p.match(/^\/api\/study\/questions\/([a-z0-9]+)\/attempt$/);
        if (mm && m === "POST") {
          const payload = await body(req);
          return send(res, 200, study.recordAttempt(s.user_id, mm[1], !!payload.correct));
        }
      }
      {
        const mm = p.match(/^\/api\/study\/questions\/([a-z0-9]+)\/simplify$/);
        if (mm && m === "POST") {
          const q = study.ownQuestion(s.user_id, mm[1]);
          const r = await aiGateway.study(s.user_id, { kind: "simplify", question: q.stem, answer: q.answer }, undefined);
          db.prepare("UPDATE study_questions SET simple_answer=? WHERE id=?").run(r.simple, q.id);
          return send(res, 200, { simpleAnswer: r.simple });
        }
      }
      {
        const mm = p.match(/^\/api\/study\/versions\/([a-z0-9]+)\/generate$/);
        if (mm && m === "POST") {
          const payload = await body(req);
          const v = study.ownVersion(s.user_id, mm[1]);
          const all = study.questions(s.user_id, mm[1], {});
          const items = all.questions.slice(0, 24).map((q) => ({ q: q.stem.slice(0, 200), a: (q.answer || "").slice(0, 200) }));
          if (!items.length) throw failure(400, "这个版本还没有题目");
          const want = String(payload.kind || "single");
          const count = Math.min(10, Math.max(1, Number(payload.count) || 5));
          const r = await aiGateway.study(s.user_id, {
            kind: "generate", items,
            single: want === "single" ? count : 0,
            judge: want === "single" ? 0 : count,
          }, undefined);
          const out = study.appendQuestions(s.user_id, mm[1], r.questions.map((q) => ({ ...q, source: "AI 生成" })), "AI 生成");
          return send(res, 201, { appended: out.appended, version: v.name });
        }
      }
      if (p === "/api/companion/chat" && m === "POST") {
        const payload = await body(req);
        const PEERS = ["星野", "知微", "砚舟", "栖迟"];
        const personaName = PEERS.includes(String(payload.persona || "")) ? String(payload.persona) : "星野";
        const agentIdMap = { "星野": "xingye", "知微": "zhiwei", "砚舟": "yanzhou", "栖迟": "qichi" };
        const agentId = agentIdMap[personaName] || "xingye";
        const ctx = agents.context(agentId);
        const history = Array.isArray(payload.history) ? payload.history.slice(-6) : [];
        const messages = [
          { role: "system", content: ctx.system + "\n可用工具：" + TOOLS.map((t) => t.name + "（" + t.description + "）").join("；") + "\n需要数据时直接调用工具，不要编造。" },
          ...history.map((h) => ({ role: h.role === "me" ? "user" : "assistant", content: String(h.text || "").slice(0, 500) })),
          { role: "user", content: String(payload.message || "").slice(0, 800) },
        ];
        // 提示词驱动的工具路由（不依赖模型原生 function calling）
        const toolTable = TOOLS.map((t) => "- " + t.name + "：" + t.description + "；参数 " + JSON.stringify(t.inputSchema.properties || {})).join("\n");
        let reply = "";
        let used = [];
        try {
          // 先做确定性路由（关键词 + 数据命中），命中就不必让模型判断
          const msg0 = String(payload.message || "");
          const companies = loadCompanies();
          const hitCompany = companies.find((c) => msg0.includes(c.name));
          let direct = null;
          if (hitCompany) direct = { tool: "company_review", args: { name: hitCompany.name } };
          else if (/租房|房租|租金|合租/.test(msg0)) direct = { tool: "find_housing", args: {} };
          else if (/岗位|招聘|职位|工作机会/.test(msg0)) direct = { tool: "search_jobs", args: { keyword: msg0.slice(0, 12) } };
          if (direct) {
            const result = callTool(direct.tool, direct.args, { study, userId: s.user_id });
            used.push(direct.tool);
            const answer = await aiGateway.chat(s.user_id, {
              message: "用户问题：" + msg0 + "\n\n已调用工具 " + direct.tool + "，结果（JSON）：" + JSON.stringify(result).slice(0, 2000) +
                "\n\n请基于真实结果用中文简洁回答（150 字内），不要编造结果里没有的数据。",
              persona: personaName, system: ctx.system,
            }, undefined);
            return send(res, 200, { reply: String(answer.reply || "").trim(), handoff: null, tools: used });
          }
          const route = await aiGateway.chat(s.user_id, {
            message: "用户问题：" + String(payload.message || "") + "\n\n可用工具：\n" + toolTable +
              "\n\n如果需要查询真实数据才能回答，只输出 JSON：{\"tool\":\"工具名\",\"args\":{...}}；如果不需要工具，只输出 {\"tool\":null}。不要输出其他内容。",
            persona: "工具路由",
            system: "你是工具路由判定器，只输出 JSON。",
          }, undefined);
          const mroute = String(route.reply || "").match(/\{[\s\S]*\}/);
          const decision = mroute ? JSON.parse(mroute[0]) : { tool: null };
          if (decision.tool) {
            const result = callTool(decision.tool, decision.args || {}, { study, userId: s.user_id });
            used.push(decision.tool);
            const answer = await aiGateway.chat(s.user_id, {
              message: "用户问题：" + String(payload.message || "") + "\n\n已调用工具 " + decision.tool + "，结果（JSON）：" + JSON.stringify(result).slice(0, 2000) +
                "\n\n请基于真实结果用中文简洁回答（150 字内），不要编造结果里没有的数据。",
              persona: personaName,
              system: ctx.system,
            }, undefined);
            reply = String(answer.reply || "").trim();
          } else {
            const plain = await aiGateway.chat(s.user_id, {
              message: String(payload.message || ""), persona: personaName, system: ctx.system,
              history: Array.isArray(payload.history) ? payload.history.slice(-6) : [],
            }, undefined);
            reply = String(plain.reply || "").trim();
          }
        } catch (e) {
          reply = "我这会儿有点忙，稍后再问我一次？";
        }
        const m2 = reply.match(/@(星野|知微|砚舟|栖迟)/);
        let handoff = null;
        if (m2 && m2[1] !== personaName) {
          const r2 = await aiGateway.chat(s.user_id, {
            message: payload.message, page: payload.page, persona: m2[1],
            peers: PEERS.filter((x) => x !== m2[1]), history: [],
          }, undefined);
          handoff = { to: m2[1], reply: String(r2.reply || "").replace(/^@\S+/, "").trim() };
        }
        return send(res, 200, { reply: reply.replace(/^@\S+/, "").trim(), handoff, tools: used });
      }
      if (p === "/api/study/tutor" && m === "POST") {
        const payload = await body(req);
        const q = payload.questionId ? study.ownQuestion(s.user_id, String(payload.questionId)) : null;
        const r = await aiGateway.study(s.user_id, {
          kind: "tutor",
          question: q ? q.stem : String(payload.question || "").slice(0, 800),
          answer: q ? q.answer : String(payload.answer || "").slice(0, 800),
          message: String(payload.message || "").slice(0, 300),
        }, undefined);
        return send(res, 200, r);
      }
      // ---- 兼容原项目接口（上传/版本/科目）----
      if (p === "/api/subject/list" && m === "GET")
        return send(res, 200, study.subjects(s.user_id).map((s) => ({ id: s.id, name: s.name, icon: "📚" })));
      if (p === "/api/subject/create" && m === "POST") {
        const payload = await body(req);
        return send(res, 201, study.createSubject(s.user_id, payload.name));
      }
      {
        const mm = p.match(/^\/api\/subject\/([a-z0-9]+)$/);
        if (mm && (m === "DELETE" || m === "PUT")) {
          if (m === "PUT") {
            const payload = await body(req);
            return send(res, 200, study.renameSubject(s.user_id, mm[1], payload.name));
          }
          return send(res, 200, study.removeSubject(s.user_id, mm[1]));
        }
      }
      {
        const mm = p.match(/^\/api\/version\/subject\/([a-z0-9]+)$/);
        if (mm && m === "GET") {
          const sub = study.subjects(s.user_id).find((x) => x.id === mm[1]);
          return send(res, 200, sub ? sub.versions.map((v2) => ({ id: v2.id, name: v2.name, questionCount: v2.total, total: v2.total })) : []);
        }
      }
      if (p === "/api/version/create" && m === "POST") {
        const payload = await body(req);
        const v2 = study.createVersion(s.user_id, String(payload.subjectId), { name: payload.name, questions: [], allowEmpty: true });
        return send(res, 201, { id: v2.id, name: v2.name });
      }
      {
        const mm = p.match(/^\/api\/version\/([a-z0-9]+)$/);
        if (mm && m === "PUT") {
          const payload = await body(req);
          return send(res, 200, study.renameVersion(s.user_id, mm[1], payload.name));
        }
        if (mm && m === "DELETE") return send(res, 200, study.removeVersion(s.user_id, mm[1]));
      }
      if (p === "/api/material/parse-file" && m === "POST") {
        const payload = await body(req);
        const text = String(payload.text || "");
        const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        const questions = lines.map((line) => {
          const parts = line.split(/\t|\|/);
          return parts.length >= 2 ? { stem: parts[0], answer: parts.slice(1).join(" ") } : { stem: line, answer: "" };
        }).filter((q) => q.stem.length > 1).slice(0, 500);
        return send(res, 200, { fileName: payload.name, count: questions.length, questions });
      }
      if (p === "/api/material/upload-questions" && m === "POST") {
        const payload = await body(req);
        const items = Array.isArray(payload.items) ? payload.items : [];
        const rows = items.map((q) => ({ type: q.type || "short", stem: q.stem || q.question || "", answer: q.answer || "", options: q.options || [], analysis: q.analysis || "" }));
        const out = study.appendQuestions(s.user_id, String(payload.versionId), rows, String(payload.title || "上传导入"));
        return send(res, 200, { appended: out.appended, message: "已导入 " + out.appended + " 道题" });
      }
      if (p === "/api/ai/recognize" && m === "POST") {
        const payload = await body(req);
        const text = String(payload.text || "").slice(0, 2000);
        if (!text.trim()) throw failure(400, "请先输入内容");
        let items = [];
        try {
          const r = await aiGateway.chat(s.user_id, {
            message: "请把下面内容拆成知识点，只输出JSON数组，每项形如 {title,content,quickAnswer}，不要输出其他文字：\n" + text,
            page: "upload",
          }, undefined);
          const m2 = String(r.reply || "").match(/\[[\s\S]*\]/);
          if (m2) items = JSON.parse(m2[0]).slice(0, 12);
        } catch {}
        if (!Array.isArray(items) || !items.length) {
          items = text.split(/[\n。；]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)
            .map((line) => ({ title: line.slice(0, 24), content: line, quickAnswer: "" }));
        }
        return send(res, 200, { items });
      }
      if (p === "/api/ai/recognize-question" && m === "POST") {
        const payload = await body(req);
        const text = String(payload.text || "").slice(0, 2000);
        return send(res, 200, { question: { type: payload.type || "single", stem: text, options: [], answer: "", analysis: "" } });
      }
      if (p === "/api/ai/generate-quiz" && m === "POST") {
        const payload = await body(req);
        const items = (Array.isArray(payload.items) ? payload.items : []).slice(0, 20)
          .map((x) => ({ q: String(x.title || x.stem || x.content || "").slice(0, 200), a: String(x.content || x.answer || "").slice(0, 200) }));
        const r = await aiGateway.study(s.user_id, { kind: "generate", items, single: 5, judge: 0 }, undefined);
        return send(res, 200, { questions: r.questions });
      }
      // ---- 复习页（原项目 review 页）----
      {
        const mm = p.match(/^\/api\/material\/subject\/([a-z0-9]+)$/);
        if (mm && m === "GET") {
          const url = new URL(req.url, "http://x");
          const versionId = String(url.searchParams.get("versionId") || "");
          const subs = study.subjects(s.user_id);
          const sub = subs.find((x) => x.id === mm[1]);
          if (!sub) throw failure(404, "科目不存在");
          const ver = sub.versions.find((v2) => v2.id === versionId) || sub.versions[0];
          if (!ver) throw failure(404, "这个科目还没有版本");
          const data = study.questions(s.user_id, ver.id, {});
          const questions = data.questions.map((q) => ({
            id: q.id,
            type: q.type === "single" ? "choice" : q.type === "blank" ? "code_fill" : q.type,
            stem: q.stem,
            options: q.options,
            answer: q.type === "single"
              ? String.fromCharCode(65 + Math.max(0, (q.options || []).indexOf(q.answer)))
              : q.answer,
            analysis: q.analysis,
            simpleAnswer: q.simpleAnswer,
            tags: q.tags,
          }));
          return send(res, 200, {
            subject: { id: sub.id, name: sub.name, versionId: ver.id, versionName: ver.name },
            versions: sub.versions,
            questions,
            flashcards: questions.filter((q) => q.type === "short").map((q) => ({ id: q.id, front: q.stem, back: q.answer })),
            knowledgePoints: [],
            totalQuestions: questions.length,
          });
        }
      }
      if (p === "/api/question/favorites/list" && m === "GET") {
        const rows = db.prepare("SELECT question_id FROM study_favorites WHERE user_id=?").all(s.user_id);
        return send(res, 200, rows.map((r) => ({ id: r.question_id })));
      }
      {
        const mm = p.match(/^\/api\/question\/([a-z0-9]+)\/favorite$/);
        if (mm && m === "POST") {
          const has = db.prepare("SELECT 1 FROM study_favorites WHERE user_id=? AND question_id=?").get(s.user_id, mm[1]);
          if (has) db.prepare("DELETE FROM study_favorites WHERE user_id=? AND question_id=?").run(s.user_id, mm[1]);
          else db.prepare("INSERT INTO study_favorites(user_id,question_id,created_at) VALUES(?,?,?)").run(s.user_id, mm[1], Date.now());
          return send(res, 200, { favorited: !has });
        }
      }
      if (p === "/api/exam/wrong-questions" && m === "GET")
        return send(res, 200, db.prepare("SELECT question_id AS id FROM study_wrong WHERE user_id=?").all(s.user_id));
      {
        const mm = p.match(/^\/api\/exam\/wrong-questions\/([a-z0-9]+)$/);
        if (mm && m === "POST") {
          db.prepare("INSERT OR IGNORE INTO study_wrong(user_id,question_id,created_at) VALUES(?,?,?)").run(s.user_id, mm[1], Date.now());
          return send(res, 200, { ok: true });
        }
        if (mm && m === "DELETE") {
          db.prepare("DELETE FROM study_wrong WHERE user_id=? AND question_id=?").run(s.user_id, mm[1]);
          return send(res, 200, { ok: true });
        }
      }
      if (p === "/api/question/stats/overview" && m === "GET") return send(res, 200, {});
      if (p === "/api/stats/overview" && m === "GET")
        return send(res, 200, { totalQuestions: 0, learnedQuestions: 0, correctRate: 0, studyDays: 0, todayQuestions: 0 });
      if (p === "/api/ai/tts-aliyun" && m === "POST") {
        const payload = await body(req);
        const text = String(payload.text || "").slice(0, 800).trim();
        if (!text) throw failure(400, "没有要朗读的文字");
        let cfg2 = {};
        try { cfg2 = JSON.parse(fs.readFileSync(path.join(dataDir, "ai-config.json"), "utf8")); } catch {}
        const key = cfg2.aliyunKey || "";
        if (!key) throw failure(503, "服务端未配置阿里云语音 key");
        const r = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
          body: JSON.stringify({
            model: cfg2.aliyunTtsModel || "qwen3-tts-flash",
            input: { text, voice: String(payload.voice || cfg2.aliyunTtsVoice || "Cherry") },
          }),
          signal: AbortSignal.timeout(30000),
        });
        if (!r.ok) throw failure(502, "语音合成失败");
        const j = await r.json();
        const url = j?.output?.audio?.url;
        if (!url) throw failure(502, "语音合成没有返回音频");
        const audio = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!audio.ok) throw failure(502, "音频下载失败");
        const buf = Buffer.from(await audio.arrayBuffer());
        res.writeHead(200, { "Content-Type": audio.headers.get("content-type") || "audio/mpeg", "Content-Length": buf.length, "Cache-Control": "no-store" });
        return res.end(buf);
      }
      if (p === "/api/ai/asr" && m === "POST") {
        let cfg3 = {};
        try { cfg3 = JSON.parse(fs.readFileSync(path.join(dataDir, "ai-config.json"), "utf8")); } catch {}
        const key3 = cfg3.aliyunKey || "";
        if (!key3) throw failure(503, "服务端未配置阿里云语音 key");
        const chunks = [];
        let size = 0;
        for await (const ch of req) {
          size += ch.length;
          if (size > 8 * 1024 * 1024) throw failure(413, "录音太长，请控制在 30 秒内");
          chunks.push(ch);
        }
        const audio = Buffer.concat(chunks);
        if (!audio.length) throw failure(400, "没有收到录音");
      const ct = String(req.headers["content-type"] || "audio/wav");
        const ext = ct.includes("webm") ? "webm" : ct.includes("mp3") ? "mp3" : ct.includes("mp4") ? "m4a" : "wav";
        const pol = await fetch("https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=fun-asr-flash", {
          headers: { Authorization: "Bearer " + key3 }, signal: AbortSignal.timeout(20000),
        }).then((r) => r.json());
        const d = pol?.data;
        if (!d?.upload_host) throw failure(502, "语音上传通道不可用");
        const objKey = String(d.upload_dir || "") + "/asr-" + Date.now() + "." + ext;
        const form = new FormData();
        form.append("OSSAccessKeyId", d.oss_access_key_id);
        form.append("Signature", d.signature);
        form.append("policy", d.policy);
        form.append("key", objKey);
        form.append("success_action_status", "200");
        if (d.x_oss_object_acl) form.append("x-oss-object-acl", d.x_oss_object_acl);
        if (d.x_oss_forbid_overwrite) form.append("x-oss-forbid-overwrite", String(d.x_oss_forbid_overwrite));
        form.append("file", new Blob([audio], { type: ct }), "voice." + ext);
        const up = await fetch(d.upload_host, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
        if (!up.ok) throw failure(502, "语音上传失败");
        const gen = await fetch("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key3, "X-DashScope-OssResourceResolve": "enable" },
          body: JSON.stringify({
            model: cfg3.aliyunAsrModel || "qwen3-asr-flash",
            input: { messages: [{ role: "user", content: [{ audio: "oss://" + objKey }] }] },
            parameters: { format: ext === "m4a" ? "mp4" : ext },
          }),
          signal: AbortSignal.timeout(90000),
        });
        if (!gen.ok) throw failure(502, "语音识别失败");
        const gj = await gen.json();
        const text = gj?.output?.choices?.[0]?.message?.content?.[0]?.text
          || gj?.output?.sentence?.text
          || "";
        return send(res, 200, { text: String(text).trim(), sentences: [] });
      }
      if (p === "/api/material/upload-knowledge" && m === "POST") {
        const payload = await body(req);
        const subjectId = String(payload.subjectId || "");
        const versionId = String(payload.versionId || "");
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) throw failure(400, "没有可导入的知识点");
        const rows = items.map((x) => ({
          type: "short",
          stem: String(x.title || x.content || x.stem || "").slice(0, 3000),
          answer: String(x.content || x.answer || "").slice(0, 3000),
          simpleAnswer: String(x.quickAnswer || "").slice(0, 800),
          analysis: "",
        })).filter((x) => x.stem);
        const out = study.appendQuestions(s.user_id, versionId, rows, String(payload.title || "知识点导入"));
        return send(res, 200, { appended: out.appended, message: "已导入 " + out.appended + " 个知识点" });
      }
      if (p === "/api/material/knowledge/list" && m === "GET") {
        const url = new URL(req.url, "http://x");
        const versionId = String(url.searchParams.get("versionId") || "");
        if (!versionId) return send(res, 200, []);
        const data = study.questions(s.user_id, versionId, {});
        return send(res, 200, data.questions.map((q) => ({ id: q.id, title: q.stem, content: q.answer, quickAnswer: q.simpleAnswer })));
      }
      if (p === "/api/market/detail" || p.startsWith("/api/market/detail/")) throw failure(404, "题库合作社暂未开放");
      if (p === "/api/user/profile" && m === "GET") {
        const u2 = db.prepare("SELECT id,email FROM users WHERE id=?").get(s.user_id);
        return send(res, 200, { id: u2.id, email: u2.email, nickname: String(u2.email || "").split("@")[0] });
      }
      if (p === "/api/agents" && m === "GET") return send(res, 200, { agents: agents.list() });
      {
        const mm = p.match(/^\/api\/agents\/([a-z0-9]+)$/);
        if (mm && m === "GET") return send(res, 200, agents.read(mm[1]));
        if (mm && m === "PUT") return send(res, 200, agents.update(mm[1], await body(req)));
      }
      {
        const mm = p.match(/^\/api\/agents\/([a-z0-9]+)\/memory$/);
        if (mm && m === "POST") {
          const payload = await body(req);
          return send(res, 200, agents.remember(mm[1], String(payload.text || "")));
        }
        if (mm && m === "GET") {
          const r2 = agents.read(mm[1]);
          return send(res, 200, { memory: r2?.memory || "" });
        }
      }
      // ---- MCP（JSON-RPC 2.0）----
      if (p === "/api/mcp" && m === "POST") {
        const payload = await body(req);
        const id = payload?.id ?? null;
        const method = String(payload?.method || "");
        const reply = (result) => send(res, 200, { jsonrpc: "2.0", id, result });
        if (method === "initialize")
          return reply({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "zhuguang-agent", version: "1.0.0" } });
        if (method === "tools/list") return reply({ tools: TOOLS });
        if (method === "tools/call") {
          const name = String(payload?.params?.name || "");
          const args = payload?.params?.arguments || {};
          return reply({ content: [{ type: "text", text: JSON.stringify(callTool(name, args, { study, userId: s.user_id })) }] });
        }
        return send(res, 200, { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
      }
      if (p === "/api/agents/tools" && m === "GET") return send(res, 200, { tools: TOOLS });
      if (p === "/api/agents/tool-call" && m === "POST") {
        const payload = await body(req);
        return send(res, 200, { result: callTool(String(payload.name || ""), payload.arguments || {}, { study, userId: s.user_id }) });
      }
      if (p === "/api/companies" && m === "GET") {
        const url = new URL(req.url, "http://x");
        const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
        const city = String(url.searchParams.get("city") || "").trim();
        let list = loadCompanies();
        if (q) list = list.filter((c) => [c.name, c.fullName, c.industry, c.directions].join(" ").toLowerCase().includes(q));
        if (city) list = list.filter((c) => String(c.cities || "").includes(city));
        return send(res, 200, {
          total: list.length,
          companies: list.map((c) => ({
            id: c.id, name: c.name, industry: c.industry, scale: c.scale,
            cities: c.cities, rating: c.rating, summary: c.summary, jobCount: c.jobCount,
          })),
        });
      }
      const companyMatch = p.match(/^\/api\/companies\/([a-z0-9-]+)$/);
      if (companyMatch && m === "GET") {
        const c = getCompany(companyMatch[1]);
        if (!c) throw failure(404, "企业不存在");
        return send(res, 200, { company: c });
      }
      if (p === "/api/housing" && m === "GET") {
        const url = new URL(req.url, "http://x");
        const city = String(url.searchParams.get("city") || "").trim();
        const area = String(url.searchParams.get("area") || "").trim();
        const q = String(url.searchParams.get("q") || "").trim();
        const maxRent = Number(url.searchParams.get("maxRent") || 0);
        let list = loadPlatformHousing(city);
        if (area) list = list.filter((h) => String(h.businessArea || "").includes(area) || String(h.district || "").includes(area));
        if (q) list = list.filter((h) => [h.title, h.community, h.address].join(" ").includes(q));
        if (maxRent > 0) list = list.filter((h) => Number(h.rent || 0) <= maxRent);
        const total = list.length;
        const page = Math.max(1, Number(url.searchParams.get("page") || 1));
        const size = 24;
        return send(res, 200, {
          total,
          page,
          size,
          cities: [...new Set(loadPlatformHousing("").map((h) => h.city))],
          areas: [...new Set(loadPlatformHousing(city).map((h) => h.businessArea).filter(Boolean))].sort(),
          items: list.slice((page - 1) * size, page * size),
        });
      }
      if (p === "/api/geo/config" && m === "GET")
        return send(res, 200, { configured: geo.hasKey, js: geo.js() });
      if (p === "/api/geo/poi-detail" && m === "GET") {
        const url = new URL(req.url, "http://x");
        const id = String(url.searchParams.get("id") || "").slice(0, 40);
        if (!id) throw failure(400, "缺少地点 id");
        limited("poid:" + s.user_id, 60, 60000);
        return send(res, 200, { poi: await geo.poiDetail(id) });
      }
      if (p === "/api/geo/subway-lines" && m === "GET") {
        const url = new URL(req.url, "http://x");
        limited("subline:" + s.user_id, 30, 60000);
        return send(res, 200, await geo.subwayLines(String(url.searchParams.get("city") || "上海")));
      }
      if (p === "/api/geo/geocode" && m === "GET") {
        const url = new URL(req.url, "http://x");
        const address = String(url.searchParams.get("address") || "").slice(0, 120);
        if (!address) throw failure(400, "请输入地址");
        limited("geocode:" + s.user_id, 60, 60000);
        const hit = await geo.geocode(address, String(url.searchParams.get("city") || ""), undefined);
        return send(res, 200, { result: hit });
      }
      if (p === "/api/geo/layers" && m === "GET") {
        const url = new URL(req.url, "http://x");
        limited("geo:" + s.user_id, 60, 60000);
        return send(res, 200, await geo.layers(s.user_id, url.searchParams.get("city") || "", undefined));
      }
      if (p === "/api/geo/nearby" && m === "GET") {
        const url = new URL(req.url, "http://x");
        limited("geo:" + s.user_id, 60, 60000);
        const kind = url.searchParams.get("kind") || "hotel";
        if (kind === "subway")
          return send(res, 200, { pois: await geo.subway(url.searchParams.get("city") || "", undefined) });
        const lng = Number(url.searchParams.get("lng"));
        const lat = Number(url.searchParams.get("lat"));
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw failure(400, "缺少有效坐标");
        const types = String(url.searchParams.get("types") || "100000").replace(/[^0-9|]/g, "").slice(0, 40) || "100000";
        return send(res, 200, {
          pois: await geo.around(lng, lat, Number(url.searchParams.get("radius") || 2000), types, undefined),
        });
      }
      if (p === "/api/geo/route" && m === "POST") {
        const x = await body(req);
        limited("geo:" + s.user_id, 60, 60000);
        const from = { lng: Number(x.from?.lng), lat: Number(x.from?.lat) };
        const to = { lng: Number(x.to?.lng), lat: Number(x.to?.lat) };
        if (![from.lng, from.lat, to.lng, to.lat].every(Number.isFinite)) throw failure(400, "起终点坐标无效");
        return send(res, 200, {
          route: await geo.route(String(x.mode || "drive"), from, to, String(x.city || ""), undefined),
        });
      }
      if (p === "/api/geo/ai-assist" && m === "POST") {
        const x = await body(req);
        limited("geoai:" + s.user_id, 12, 600000);
        const lng = Number(x.lng), lat = Number(x.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw failure(400, "请先在地图上选一个起点");
        const radius = Math.min(Math.max(Number(x.radius) || 2000, 500), 20000);
        const label = String(x.label || "所选位置").slice(0, 60);
        const hotels = (await geo.around(lng, lat, radius, "100000", undefined)).slice(0, 10);
        const housing = [];
        for (const set of datasets.rowsForMap(s.user_id, "housing", 40)) {
          const col = set.mapping?.address;
          for (const row of set.rows.slice(0, 6)) {
            const address = col ? row[col] : "";
            if (!address) continue;
            const pos = await geo.geocode(address, "", undefined).catch(() => null);
            if (!pos) continue;
            housing.push({
              title: (set.mapping?.title && row[set.mapping.title]) || address,
              address,
              rent: (set.mapping?.rent && row[set.mapping.rent]) || "",
              phone: (set.mapping?.phone && row[set.mapping.phone]) || "",
              pos,
            });
          }
        }
        const jobs = [];
        for (const id of applicationPlan.jobIds(s.user_id).slice(0, 4)) {
          const job = getJob(id);
          if (!job) continue;
          const pos = await geo.geocode(job.address || job.city, job.city, undefined).catch(() => null);
          if (!pos) continue;
          const r = await geo.route("drive", { lng, lat }, pos, job.city, undefined).catch(() => null);
          jobs.push({ title: job.title, company: job.company, minutes: r ? Math.round(r.duration / 60) : null, pos });
        }
        const payload = {
          place: label,
          radius,
          need: String(x.need || "").slice(0, 300),
          anchorType: x.anchorType === "housing" ? "housing" : "job",
          hotels: hotels.map((h) => ({ name: h.name, distance: h.distance, tel: h.tel, address: h.address })),
          housing: housing.map((h) => ({ title: h.title, rent: h.rent, address: h.address })),
          jobs,
        };
        const ai = await aiGateway.geo(s.user_id, payload).catch((e) => ({ geo: { advice: "AI 暂时不可用：" + (e.message || ""), picks: [], tips: [] } }));
        return send(res, 200, { advice: ai.geo?.advice || "", picks: ai.geo?.picks || [], tips: ai.geo?.tips || [], candidates: { hotels, housing, jobs } });
      }
      if (p === "/api/datasets" && m === "GET")
        return send(res, 200, { datasets: datasets.list(s.user_id) });
      if (p === "/api/datasets" && m === "POST") {
        limited("dataset:" + s.user_id, 20, 600000);
        const length = Number(req.headers["content-length"]);
        if (!Number.isFinite(length) || length <= 0 || length > 8 * 1024 * 1024)
          throw failure(413, "文件需小于 8MiB");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        if (buffer.length !== length) throw failure(400, "上传不完整，请重新选择文件");
        const rawName = String(req.headers["x-file-name"] || "未命名数据");
        let name = rawName;
        try { name = decodeURIComponent(rawName); } catch {}
        name = name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 120);
        const ext = (name.split(".").pop() || "").toLowerCase();
        const created = await datasets.create(s.user_id, {
          category: String(req.headers["x-category"] || ""),
          name,
          buffer,
          ext,
        });
        return send(res, 201, { dataset: created });
      }
      const datasetMatch = p.match(/^\/api\/datasets\/([a-f0-9]{24})$/);
      if (datasetMatch && m === "GET") {
        const url = new URL(req.url, "http://x");
        return send(res, 200, {
          dataset: datasets.detail(s.user_id, datasetMatch[1], Number(url.searchParams.get("offset") || 0), Number(url.searchParams.get("limit") || 100)),
        });
      }
      if (datasetMatch && m === "DELETE")
        return send(res, 200, datasets.remove(s.user_id, datasetMatch[1]));
      if (p === "/api/dashboard/summary" && m === "GET") {
        limited("dash:" + req.socket.remoteAddress, 120);
        const city = new URL(req.url, "http://x").searchParams.get("city") || "全国";
        return send(res, 200, dashboardData.summary(city.slice(0, 20)));
      }
      if (p === "/api/jobs" && m === "GET") {
        const allowed = [
          "q",
          "direction",
          "city",
          "education",
          "recruitmentType",
          "source",
          "page",
          "pageSize",
        ];
        const u = new URL(req.url, "http://local");
        const q = Object.fromEntries(
          allowed
            .filter((k) => u.searchParams.has(k))
            .map((k) => [k, u.searchParams.get(k)]),
        );
        if ((q.q || "").length > 100) throw failure(400, "搜索词过长");
        return send(res, 200, listJobs(q));
      }
      if (p === "/api/jobs/facets" && m === "GET")
        return send(res, 200, facets());
      const jobMatch = p.match(/^\/api\/jobs\/([a-f0-9]{24})$/);
      if (jobMatch && m === "GET") {
        const job = getJob(jobMatch[1]);
        if (!job) throw failure(404, "岗位不存在");
        return send(res, 200, { job });
      }
      if (p === "/api/job-intents" && m === "GET")
        return send(res, 200, { jobIds: applicationPlan.jobIds(s.user_id) });
      if (p === "/api/job-intents" && m === "PUT") {
        const x = await body(req);
        return send(
          res,
          200,
          applicationPlan.replaceIntents(s.user_id, x.jobIds, x.expected),
        );
      }
      const intentMatch = p.match(/^\/api\/job-intents\/([a-f0-9]{24})$/);
      if (intentMatch && (m === "PUT" || m === "DELETE"))
        return send(
          res,
          200,
          applicationPlan.mutateIntent(s.user_id, intentMatch[1], m === "PUT"),
        );
      if (p === "/api/application-plan" && m === "GET")
        return send(res, 200, applicationPlan.list(s.user_id));
      const planMatch = p.match(/^\/api\/application-plan\/([a-f0-9]{24})$/);
      if (planMatch && m === "GET")
        return send(res, 200, applicationPlan.detail(s.user_id, planMatch[1]));
      if (planMatch && m === "PUT")
        return send(
          res,
          200,
          applicationPlan.save(s.user_id, planMatch[1], await body(req)),
        );
      if (p === "/api/ai/application-copy" && m === "POST") {
        const x = await body(req);
        const job = typeof x.jobId === "string" && getJob(x.jobId);
        if (!job) throw failure(404, "岗位不存在");
        const controller = new AbortController();
        const cancel = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", cancel);
        try {
          return send(
            res,
            200,
            await applicationCopy.generate(
              s.user_id,
              { job, text: x.text, mode: x.mode },
              controller.signal,
            ),
          );
        } finally {
          res.off("close", cancel);
        }
      }
      if (p === "/api/ai/status" && m === "GET")
        return send(res, 200, aiGateway.status());
      if (p === "/api/ai/resume-review" && m === "POST") {
        const x = await body(req);
        const document = validateDocument(x.document);
        return send(
          res,
          200,
          await aiGateway.review(s.user_id, {
            document,
            prompt: typeof x.prompt === "string" ? x.prompt.slice(0, 1000) : "",
          }),
        );
      }
      const decorAsset = p.match(/^\/api\/decoration-assets\/([a-f0-9]{24})\.png$/);
      if (decorAsset && m === "GET") {
        const file = path.join(dataDir, "decoration-assets", decorAsset[1] + ".png");
        let buf;
        try {
          buf = await fs.promises.readFile(file);
        } catch {
          throw failure(404, "装饰图不存在");
        }
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        });
        return res.end(buf);
      }
      if (p === "/api/ai/resume-decoration" && m === "POST") {
        const x = await body(req);
        const document = validateDocument(x.document);
        limited("decor:" + s.user_id, 6, 600000);
        const input = {
          style: ["minimal", "tech", "warm"].includes(x.style) ? x.style : "minimal",
          slot: x.slot === "footer" ? "footer" : "header",
          size: /^[0-9]{3,4}x[0-9]{3,4}$/.test(String(x.size || "")) ? x.size : "1024x1024",
          accentText: typeof x.accent === "string" ? x.accent.slice(0, 40) : "",
          outputFormat: ["png", "jpeg", "webp"].includes(x.outputFormat) ? x.outputFormat : "png",
          sectionCount: document.sections.length,
        };
        const result = await aiGateway.decorate(s.user_id, input);
        return send(res, 200, result);
      }
      if (p === "/api/ai/resume-appearance" && m === "POST") {
        const x = await body(req);
        const document = validateDocument(x.document);
        limited("appearance:" + s.user_id, 20, 600000);
        return send(
          res,
          200,
          await aiGateway.appearance(s.user_id, {
            document,
            prompt: typeof x.prompt === "string" ? x.prompt.slice(0, 1000) : "",
          }),
        );
      }
      if (p === "/api/ai/resume-section" && m === "POST") {
        const x = await body(req);
        const document = validateDocument(x.document);
        limited("section:" + s.user_id, 12, 600000);
        return send(
          res,
          200,
          await aiGateway.section(s.user_id, {
            document,
            description: typeof x.description === "string" ? x.description.slice(0, 2000) : "",
          }),
        );
      }
      if (p === "/api/ai/resume-layout" && m === "POST") {
        const x = await body(req);
        const document = validateDocument(x.document);
        const layoutInput = validateLayoutInput({ document, extras: x.extras, prompt: typeof x.prompt === "string" ? x.prompt.slice(0, 1000) : "" });
        return send(res, 200, await aiGateway.layout(s.user_id, layoutInput));
      }
      if (p === "/api/resume-extractions/limits" && m === "GET")
        return send(res, 200, extraction.status());
      if (p === "/api/resume-extractions" && m === "POST") {
        if (req.headers["x-ai-consent"] !== "true")
          throw failure(400, "上传简历须同意AI识别；请刷新页面后重新上传");
        return send(res, 202, { job: await extraction.create(req, s.user_id, true) });
      }
      const extractionMatch = p.match(
        /^\/api\/resume-extractions\/([a-f0-9-]{36})$/,
      );
      if (extractionMatch) {
        if (m === "GET")
          return send(res, 200, {
            job: extraction.get(extractionMatch[1], s.user_id),
          });
        if (m === "DELETE") {
          extraction.delete(extractionMatch[1], s.user_id);
          return send(res, 200, { ok: true });
        }
      }
      if (p === "/api/auth/logout" && m === "POST") {
        const token = String(req.headers.cookie || "").match(
          /career_session=([a-f0-9]{64})/,
        )?.[1];
        if (token)
          db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(token));
        res.setHeader(
          "Set-Cookie",
          "career_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" +
            (process.env.CAREER_SECURE_COOKIE === "true" ? "; Secure" : ""),
        );
        return send(res, 200, { ok: true });
      }
      if (p === "/api/profile" && m === "GET") {
        const r = stmt.profile.get(s.user_id);
        return send(
          res,
          200,
          r
            ? {
                profile: JSON.parse(r.body),
                revision: r.revision,
                updatedAt: r.updated_at,
              }
            : { profile: null, revision: 0 },
        );
      }
      if (p === "/api/profile" && m === "PUT") {
        const x = await body(req),
          profile = profileData(x.profile),
          r = stmt.profile.get(s.user_id),
          revision = r?.revision || 0;
        if (x.revision !== revision)
          throw failure(
            409,
            "资料已在另一页面更新，请重新载入后合并；当前编辑未丢失",
          );
        const now = Date.now();
        const result = db
          .prepare(
            "INSERT INTO profiles VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET body=excluded.body,revision=excluded.revision,updated_at=excluded.updated_at WHERE profiles.revision=excluded.revision-1",
          )
          .run(s.user_id, JSON.stringify(profile), revision + 1, now);
        if (result.changes !== 1)
          throw failure(409, "资料并发更新，请重新载入后合并；当前编辑仍保留");
        return send(res, 200, {
          profile,
          revision: revision + 1,
          updatedAt: now,
        });
      }
      if (p === "/api/resumes" && m === "GET") {
        const rows = db
          .prepare(
            "SELECT id,title,revision,created_at,updated_at FROM resumes WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 100",
          )
          .all(s.user_id);
        return send(res, 200, { resumes: rows });
      }
      if (p === "/api/resumes" && m === "POST") {
        const x = resumeData(await body(req));
        const n = db
          .prepare("SELECT count(*) as n FROM resumes WHERE user_id=?")
          .get(s.user_id).n;
        if (n >= 100) throw failure(400, "版本已达100个，请删除不需要的版本");
        const id = randomBytes(16).toString("hex"),
          now = Date.now();
        db.prepare("INSERT INTO resumes VALUES(?,?,?,?,?,?,?)").run(
          id,
          s.user_id,
          x.title,
          JSON.stringify(x.body),
          1,
          now,
          now,
        );
        return send(res, 201, {
          resume: resumeOut(stmt.resume.get(id, s.user_id)),
        });
      }
      const match = p.match(/^\/api\/resumes\/([a-f0-9]{32})$/);
      if (match) {
        const id = match[1],
          r = stmt.resume.get(id, s.user_id);
        if (!r) throw failure(404, "简历版本不存在或无访问权限");
        if (m === "GET") return send(res, 200, { resume: resumeOut(r) });
        if (m === "PUT") {
          const x = await body(req),
            v = resumeData(x);
          if (x.revision !== r.revision)
            throw failure(
              409,
              "该版本已在另一页面修改，请先重新载入；当前编辑仍保留",
            );
          const result = db
            .prepare(
              "UPDATE resumes SET title=?,body=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?",
            )
            .run(
              v.title,
              JSON.stringify(v.body),
              Date.now(),
              id,
              s.user_id,
              x.revision,
            );
          if (result.changes !== 1)
            throw failure(
              409,
              "版本并发更新，请重新载入后合并；当前编辑仍保留",
            );
          return send(res, 200, {
            resume: resumeOut(stmt.resume.get(id, s.user_id)),
          });
        }
        if (m === "DELETE") {
          const x = await body(req);
          if (x.revision !== r.revision)
            throw failure(409, "版本已更新，请重新载入确认后删除");
          const result = db
            .prepare(
              "DELETE FROM resumes WHERE id=? AND user_id=? AND revision=?",
            )
            .run(id, s.user_id, x.revision);
          if (result.changes !== 1)
            throw failure(409, "版本并发更新，未执行删除");
          return send(res, 200, { ok: true });
        }
      }
      throw failure(404, "接口不存在或请求方法不支持");
    }
    if (m !== "GET" && m !== "HEAD") throw failure(405, "请求方法不支持");
    let name;
    try {
      name = decodeURIComponent(p);
    } catch {
      throw failure(400, "路径格式错误");
    }
    const preview = name.startsWith("/preview/");
    const publicRoot = preview
      ? path.resolve(root, "../prototype/public")
      : path.resolve(process.env.CAREER_STATIC_DIR || path.join(root, "dist"));
    // 原项目外壳（题库页）：/orig/ 下独立 SPA
    if (!preview && (p === "/orig" || p.startsWith("/orig/"))) {
      const origRoot = path.resolve(process.env.CAREER_STATIC_DIR || path.join(root, "dist"), "orig");
      let rel = p.replace(/^\/orig\/?/, "");
      if (!rel || !fs.existsSync(path.resolve(origRoot, rel)) || fs.statSync(path.resolve(origRoot, rel)).isDirectory()) rel = "index.html";
      const file2 = path.resolve(origRoot, rel);
      if (file2.startsWith(origRoot + path.sep) && fs.existsSync(file2)) {
        res.setHeader("Content-Type", contentTypes[path.extname(file2)] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file2).pipe(res);
        return;
      }
    }
    // 大体积静态资源（Live2D 模型等）直接读 app/public，避免每次构建复制
    if (!preview && p.startsWith("/live2d/")) {
      const liveRoot = path.resolve(root, "public");
      const liveFile = path.resolve(liveRoot, p.replace(/^\//, ""));
      if (liveFile.startsWith(liveRoot + path.sep) && fs.existsSync(liveFile) && fs.statSync(liveFile).isFile()) {
        res.setHeader("Content-Type", contentTypes[path.extname(liveFile)] || "application/octet-stream");
        res.setHeader("Cache-Control", "public,max-age=86400");
        fs.createReadStream(liveFile).pipe(res);
        return;
      }
    }
    const relative = preview ? name.slice("/preview".length) : name;
    let file = path.resolve(
      publicRoot,
      "." + (relative === "/" ? "/index.html" : relative),
    );
    if (!file.startsWith(publicRoot + path.sep) || relative.includes("\0"))
      throw failure(404, "页面不存在");
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      if (!preview && !relative.startsWith("/assets/")) {
        const candidate = path.resolve(
          root,
          "../prototype/public",
          "." + relative,
        );
        const legacyRoot = path.resolve(root, "../prototype/public");
        if (!candidate.startsWith(legacyRoot + path.sep))
          throw failure(404, "页面不存在");
        try {
          stat = fs.statSync(candidate);
          file = candidate;
        } catch {
          throw failure(404, "页面不存在");
        }
      } else throw failure(404, "页面不存在");
    }
    if (!stat.isFile()) throw failure(404, "页面不存在");
    res.setHeader(
      "Content-Type",
      contentTypes[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader("Content-Length", stat.size);
    res.setHeader(
      "Cache-Control",
      /\/assets\/.*-[A-Z0-9]{8}\.js$/.test(relative)
        ? "public,max-age=31536000,immutable"
        : "no-cache",
    );
    if (m === "HEAD") return res.end();
    const stream = fs.createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (e) {
    if (!res.headersSent) {
      send(res, e.status || 500, {
        error: e.status ? e.message : "服务暂时出错，请保留草稿后重试",
        requestId,
        ...(e.status === 409 && e.state ? { state: e.state } : {}),
      });
    } else res.destroy();
    if (!e.status)
      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          code: e.code || "INTERNAL",
        }),
      );
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.listen(
  Number(process.env.PORT || 5174),
  process.env.HOST || "0.0.0.0",
  () => console.log("Career batch 3 listening on " + server.address().port),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  const cleanup = extraction.close();
  server.close(async () => {
    await cleanup;
    resumeImports.close();
    await extraction.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
