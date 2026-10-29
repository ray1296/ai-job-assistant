import fs from "node:fs";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const initial = (() => { try { return fs.readFileSync("private/admin-initial.txt", "utf8"); } catch { return ""; } })();
const email = process.env.TEST_EMAIL || (initial.match(/email:\s*(.+)/)?.[1] || "").trim();
const password = process.env.TEST_PASSWORD || (initial.match(/password:\s*(.+)/)?.[1] || "").trim();
if (!email || !password) throw new Error("需要 TEST_EMAIL/TEST_PASSWORD 或 private/admin-initial.txt");
let passed = 0, failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + " " + name + (extra ? " " + extra : "")); ok ? passed++ : failed++; };

const health = await fetch(base + "/api/health");
check("health", health.status === 200);
const anon = await fetch(base + "/api/profile");
check("unauthenticated private data", anon.status === 401);
const login = await fetch(base + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, role: "admin" }),
});
check("admin login", login.ok);
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const j = await login.json();
const h = { Cookie: cookie, "X-CSRF-Token": j.csrf, "Content-Type": "application/json" };
const noCsrf = await fetch(base + "/api/wishes", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
check("CSRF required", noCsrf.status === 403);
const rag = await fetch(base + "/api/ai/rag/ask", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ query: "Nacos 作用" }) });
check("read-only RAG ask", rag.status === 200);
const stats = await (await fetch(base + "/api/ai/rag/stats", { headers: h })).json();
check("RAG index embedded", stats.total > 0 && stats.embedded === stats.total, "total=" + stats.total);
check("RAG index fresh", stats.fresh === true);
for (const [path, label] of [["/orig/../server/index.mjs", "orig traversal"], ["/live2d/../../server/index.mjs", "live2d traversal"]]) {
  const r = await fetch(base + path); check(label, r.status === 404);
}
const home = await fetch(base + "/");
const csp = home.headers.get("content-security-policy") || "";
check("CSP form-action", csp.includes("form-action 'self'"));
check("nosniff", home.headers.get("x-content-type-options") === "nosniff");
const gz = await fetch(base + "/assets/main.js", { headers: { "Accept-Encoding": "gzip" } });
check("static gzip", gz.headers.get("content-encoding") === "gzip");
const users = await (await fetch(base + "/api/admin/users", { headers: h })).json();
const keys = Object.keys(users.users?.[0] || {});
check("admin user fields limited", keys.length > 0 && !keys.some((k) => /password|resumeBody|chat|phone/i.test(k)), keys.join(","));
const mcp = await fetch(base + "/api/mcp", { method: "POST", headers: h, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) });
check("MCP initialize", mcp.status === 200 && (await mcp.json()).result?.serverInfo);
console.log("RESULT " + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
