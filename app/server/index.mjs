import http from "node:http";
import { createExtractionService } from "./resume-extraction.mjs";
import { createAiGateway } from "./ai-gateway.mjs";
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
const extraction = createExtractionService(dataDir);
const aiGateway = createAiGateway(dataDir);
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
PRAGMA user_version=1;`);
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
const fields = {
  name: 120,
  phone: 64,
  email: 254,
  summary: 4000,
  skills: 8000,
  honors: 8000,
};
function string(v, max, label) {
  if (typeof v !== "string" || v.length > max)
    throw failure(400, label + "格式错误或过长");
  return v;
}
function profileData(p) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw failure(400, "个人信息格式错误");
  const out = {};
  for (const [k, n] of Object.entries(fields))
    out[k] = string(p[k] ?? "", n, k);
  for (const k of ["cities", "directions"]) {
    if (!Array.isArray(p[k]) || p[k].length > 40)
      throw failure(400, "意向标签过多");
    out[k] = [
      ...new Set(
        p[k]
          .map((v) => string(v, 80, k))
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  }
  for (const k of ["education", "projects", "experience"]) {
    if (!Array.isArray(p[k]) || p[k].length > 30)
      throw failure(400, "经历数量过多");
    out[k] = p[k].map((x) => ({
      title: string(x?.title ?? "", 200, k),
      period: string(x?.period ?? "", 100, k),
      detail: string(x?.detail ?? "", 8000, k),
    }));
  }
  return out;
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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
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
          localExtraction: true,
          ai: false,
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
      if (p === "/api/resume-extractions/limits" && m === "GET")
        return send(res, 200, extraction.status());
      if (p === "/api/resume-extractions" && m === "POST") {
        limited("extract:" + s.user_id, 8);
        return send(res, 202, { job: await extraction.create(req, s.user_id) });
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
      : path.join(root, "dist");
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
      /\/assets\//.test(relative) ? "public,max-age=3600" : "no-cache",
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
    await extraction.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
