import fs from "node:fs";

const base = process.env.RAG_EVAL_BASE || "http://127.0.0.1:5173";
const initial = (() => {
  try { return fs.readFileSync("private/admin-initial.txt", "utf8"); } catch { return ""; }
})();
const email = process.env.RAG_EVAL_EMAIL || (initial.match(/email:\s*(.+)/)?.[1] || "").trim();
const password = process.env.RAG_EVAL_PASSWORD || (initial.match(/password:\s*(.+)/)?.[1] || "").trim();
if (!email || !password) throw new Error("需要 RAG_EVAL_EMAIL/RAG_EVAL_PASSWORD，或 private/admin-initial.txt");

const login = await fetch(base + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password, role: "admin" }),
});
if (!login.ok) throw new Error("登录失败：" + login.status);
const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
const session = await login.json();
const headers = { Cookie: cookie, "X-CSRF-Token": session.csrf, "Content-Type": "application/json" };
const cases = JSON.parse(fs.readFileSync("data/rag-eval.json", "utf8")).cases;
const results = [];
for (const item of cases) {
  const started = Date.now();
  const r = await fetch(base + "/api/ai/rag/ask", {
    method: "POST", headers, body: JSON.stringify({ query: item.query }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await r.json().catch(() => ({}));
  const sources = Array.isArray(data.sources) ? data.sources : [];
  const answer = String(data.answer || "");
  const text = sources.map((s) => (s.title || "") + " " + (s.content || "")).join("\n");
  const hit = item.positive ? (item.expect || []).some((x) => text.includes(x)) : true;
  const cited = item.positive ? /\[\d+\]/.test(answer) : true;
  const refused = item.positive ? true : sources.length === 0 || /没有找到|没有足够|没有依据/.test(answer);
  results.push({ id: item.id, ok: r.ok && hit && cited && refused, hit, cited, refused, sources: sources.length, ms: Date.now() - started });
  console.log((results.at(-1).ok ? "PASS" : "FAIL"), item.id, "sources=" + sources.length, "hit=" + hit, "cited=" + cited, "refused=" + refused, (Date.now() - started) + "ms");
}
const positives = results.filter((_, i) => cases[i].positive);
const negatives = results.filter((_, i) => !cases[i].positive);
const recall = positives.filter((x) => x.hit).length / Math.max(1, positives.length);
const citation = positives.filter((x) => x.cited).length / Math.max(1, positives.length);
const refusal = negatives.filter((x) => x.refused).length / Math.max(1, negatives.length);
const avgMs = Math.round(results.reduce((n, x) => n + x.ms, 0) / Math.max(1, results.length));
console.log(JSON.stringify({ cases: results.length, recall, citation, refusal, avgMs, pass: results.filter((x) => x.ok).length }, null, 2));
if (recall < 0.7 || citation < 0.7 || refusal < 0.8) process.exit(1);
