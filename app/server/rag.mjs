import fs from "node:fs";
import { createHash } from "node:crypto";

const ROOT = new URL("../data/", import.meta.url);
const EMBED_DIM = 1024;
const MAX_CONTENT = 1200;
const CHUNK_OVERLAP = 150;

const readJson = (name, fallback) => {
  try { return JSON.parse(fs.readFileSync(new URL(name, ROOT), "utf8")); } catch { return fallback; }
};
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const clean = (s, n = 4000) => String(s || "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const safeUrl = (v) => {
  try {
    const u = new URL(String(v));
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
};

function splitContent(text) {
  const s = clean(text, 12000);
  if (s.length <= MAX_CONTENT) return [s];
  const out = [];
  for (let start = 0; start < s.length; start += MAX_CONTENT - CHUNK_OVERLAP) {
    const part = s.slice(start, start + MAX_CONTENT).trim();
    if (part) out.push(part);
    if (start + MAX_CONTENT >= s.length) break;
  }
  return out;
}

function publicDocs() {
  const docs = [];
  const catalog = readJson("learning-catalog.json", { questions: [] });
  for (const q of Array.isArray(catalog.questions) ? catalog.questions : []) {
    if (!q || !q.question) continue;
    const title = "[" + (q.direction || "通用") + "] " + clean(q.question, 160);
    const answer = clean(q.answer || "暂无答案", 5000);
    const body = title + "\n答案：" + answer;
    splitContent(body).forEach((content, i) => docs.push({
      sourceType: "question", sourceId: String(q.id || "") + (i ? "#" + i : ""), title,
      content, direction: q.direction || "", category: q.category || "",
      metadata: {
        questionId: q.id, direction: q.direction || "", category: q.category || "",
        importance: q.importance || "", source: q.source || "", sourceUrl: safeUrl(q.sourceUrl),
        answerSource: q.answerSource || "", publishedAt: q.publishedAt || "",
      },
    }));
  }
  const jobs = readJson("jobs-catalog.json", { jobs: [] }).jobs || [];
  for (const j of jobs) {
    const title = clean((j.title || "岗位") + " · " + (j.company || ""), 160);
    const body = title + "\n城市：" + (j.city || "") + "\n薪资：" + (j.salary || "未公开") + "\n方向：" + (j.direction || "") +
      "\n岗位职责：" + clean(j.jd || "", 3500) + "\n任职要求：" + clean(j.requirements || "", 2500);
    splitContent(body).forEach((content, i) => docs.push({
      sourceType: "job", sourceId: String(j.id || "") + (i ? "#" + i : ""), title, content,
      direction: j.direction || "", category: j.category || "",
      metadata: {
        jobId: j.id, company: j.company || "", city: j.city || "", salary: j.salary || "",
        education: j.education || "", source: j.platform || "", sourceUrl: safeUrl(j.url),
      },
    }));
  }
  const companies = readJson("companies-catalog.json", { items: [] }).items || [];
  for (const c of companies) {
    const title = clean((c.name || "企业") + " · 企业观察", 160);
    const body = title + "\n行业：" + (c.industry || "") + "\n规模：" + (c.scale || "") +
      "\n简介：" + clean(c.summary || "", 2000) + "\n优点：" + clean(c.pros || "", 1000) +
      "\n风险：" + clean(c.cons || "", 1000) + "\n面试体验：" + clean(c.interviewExp || "", 1000);
    splitContent(body).forEach((content, i) => docs.push({
      sourceType: "company", sourceId: String(c.id || "") + (i ? "#" + i : ""), title, content,
      direction: "", category: c.industry || "",
      metadata: { companyId: c.id, company: c.name || "", source: c.source || "", sourceUrl: safeUrl(c.source) },
    }));
  }
  const housing = readJson("housing-catalog.json", { items: [] }).items || [];
  for (const h of housing) {
    const title = clean((h.title || "房源") + " · " + (h.district || ""), 160);
    const body = title + "\n城市：" + (h.city || "") + "\n区域：" + (h.businessArea || "") +
      "\n小区：" + (h.community || "") + "\n户型：" + (h.layout || "") + "\n面积：" + (h.area || "") +
      "\n月租：" + (h.rent || "") + "\n平台：" + (h.platform || "");
    splitContent(body).forEach((content, i) => docs.push({
      sourceType: "housing", sourceId: String(h.id || "") + (i ? "#" + i : ""), title, content,
      direction: h.city || "", category: h.district || "",
      metadata: { housingId: h.id, city: h.city || "", district: h.district || "", rent: h.rent || "", platform: h.platform || "", sourceUrl: safeUrl(h.url) },
    }));
  }
  for (const d of docs) {
    d.id = hash([d.sourceType, d.sourceId, d.title, d.content].join("\n")).slice(0, 32);
    d.contentHash = hash(d.content);
  }
  return docs;
}

function toBuffer(vec) {
  const arr = new Float32Array(vec.length);
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += Number(vec[i]) ** 2;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) arr[i] = Number(vec[i]) / norm;
  return Buffer.from(arr.buffer);
}
function fromBuffer(buf) {
  if (!buf || !buf.length) return null;
  const arr = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return arr;
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function tokenize(text) {
  const s = String(text || "").toLowerCase().normalize("NFKC");
  const out = new Set();
  for (const w of s.match(/[a-z0-9]+/g) || []) if (w.length > 1) out.add(w);
  for (const run of s.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

export function createRag(db, aiGateway) {
  db.exec(`CREATE TABLE IF NOT EXISTS rag_chunks(
    id TEXT PRIMARY KEY, source_type TEXT NOT NULL, source_id TEXT NOT NULL,
    title TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT NOT NULL,
    content_hash TEXT NOT NULL, embedding BLOB, dim INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS rag_chunks_type ON rag_chunks(source_type);
    CREATE TABLE IF NOT EXISTS rag_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  let bm25 = null;
  let dense = null;
  let lastDigestAt = 0;
  let lastDigest = "";
  const status = { running: false, done: 0, total: 0, error: "", startedAt: 0, finishedAt: 0 };
  const invalidate = () => { bm25 = null; dense = null; };

  function sourceDigest() {
    try {
      const files = ["learning-catalog.json", "jobs-catalog.json", "companies-catalog.json", "housing-catalog.json"];
      const h = createHash("sha256");
      for (const name of files) h.update(fs.readFileSync(new URL(name, ROOT)));
      return h.digest("hex");
    } catch { return ""; }
  }
  function maybeRefresh() {
    const now = Date.now();
    if (now - lastDigestAt < 60000) return;
    lastDigestAt = now;
    lastDigest = sourceDigest();
    if (lastDigest && meta("sourceDigest") && meta("sourceDigest") !== lastDigest && !status.running)
      startBackgroundBuild();
  }
  function meta(key) { return db.prepare("SELECT value FROM rag_meta WHERE key=?").get(key)?.value || ""; }
  function setMeta(key, value) { db.prepare("INSERT INTO rag_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value)); }

  function ensureBm25() {
    if (bm25) return bm25;
    const rows = db.prepare("SELECT id,title,content,metadata,source_type FROM rag_chunks").all();
    const docs = rows.map((r) => {
      let metadata = {}; try { metadata = JSON.parse(r.metadata); } catch {}
      const text = (r.title + " " + r.content).toLowerCase();
      const tf = new Map();
      const toks = tokenize(text);
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      return { id: r.id, title: r.title, content: r.content, metadata, sourceType: r.source_type, tf, len: toks.length };
    });
    const df = new Map();
    for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    const N = Math.max(1, docs.length);
    const avg = docs.reduce((a, d) => a + d.len, 0) / N;
    bm25 = { docs, df, N, avg, byId: new Map(docs.map((d) => [d.id, d])) };
    return bm25;
  }
  function ensureDense() {
    if (dense) return dense;
    const rows = db.prepare("SELECT id,embedding,dim FROM rag_chunks WHERE dim>0").all();
    dense = rows.map((r) => ({ id: r.id, vec: fromBuffer(r.embedding) })).filter((x) => x.vec);
    return dense;
  }
  function bm25Rank(query, filter) {
    const data = ensureBm25();
    const terms = tokenize(query);
    const scores = [];
    for (const d of data.docs) {
      if (filter && !filter(d)) continue;
      let score = 0;
      for (const t of terms) {
        const f = d.tf.get(t) || 0;
        if (!f) continue;
        const df = data.df.get(t) || 0;
        const idf = Math.log(1 + (data.N - df + 0.5) / (df + 0.5));
        score += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / Math.max(1, data.avg)));
      }
      if (score > 0) scores.push({ id: d.id, score });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, 60);
  }
  async function denseRank(query, filter) {
    const d = ensureDense();
    if (!d.length) return [];
    let vec = null;
    try { const rows = await aiGateway.embedTexts([query]); vec = rows[0]; } catch { return []; }
    if (!vec) return [];
    const norm = Math.sqrt(vec.reduce((a, x) => a + Number(x) ** 2, 0)) || 1;
    const q = vec.map((x) => Number(x) / norm);
    const scores = [];
    for (const x of d) {
      const row = ensureBm25().byId.get(x.id);
      if (!row || (filter && !filter(row))) continue;
      scores.push({ id: x.id, score: cosine(q, x.vec) });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, 60);
  }
  function buildFilter(opts = {}) {
    const types = Array.isArray(opts.sourceTypes) ? opts.sourceTypes.filter((x) => typeof x === "string") : [];
    const direction = String(opts.direction || "").trim();
    return (d) => {
      if (types.length && !types.includes(d.sourceType)) return false;
      if (direction && String(d.metadata.direction || "") !== direction) return false;
      return true;
    };
  }
  function rrf(lists, limit = 24) {
    const scores = new Map();
    lists.forEach((list, li) => {
      list.forEach((x, i) => scores.set(x.id, (scores.get(x.id) || 0) + (1 / (60 + i + 1)) * (li === 1 ? 1.15 : 1)));
    });
    return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, score]) => ({ id, score }));
  }
  async function search(query, opts = {}) {
    maybeRefresh();
    if (!db.prepare("SELECT count(*) AS n FROM rag_chunks").get().n) {
      return { hits: [], mode: "empty", candidates: 0 };
    }
    const filter = buildFilter(opts);
    const lexical = bm25Rank(query, filter);
    const vector = await denseRank(query, filter).catch(() => []);
    const merged = rrf([lexical, vector]);
    const docs = merged.map((x) => ensureBm25().byId.get(x.id)).filter(Boolean);
    if (!docs.length) return { hits: [], mode: vector.length ? "hybrid" : "bm25", candidates: 0 };
    let ranked = [];
    try {
      const rr = await aiGateway.rerankDocuments(query, docs.map((d) => d.title + "\n" + d.content), Math.min(12, docs.length));
      if (rr.length) ranked = rr.map((x) => ({ doc: docs[x.index], score: x.score })).filter((x) => x.doc);
    } catch {}
    if (!ranked.length) ranked = docs.slice(0, 12).map((d, i) => ({ doc: d, score: 1 / (i + 1) }));
    const min = Number(opts.minScore ?? 0.38);
    const seen = new Set();
    const chosen = [];
    for (const x of ranked) {
      if (!(x.score >= min || x.score === 1)) continue;
      const key = String(x.doc.metadata?.questionId || x.doc.metadata?.jobId || x.doc.metadata?.companyId || x.doc.metadata?.housingId || x.doc.title);
      if (seen.has(key)) continue;
      seen.add(key);
      chosen.push(x);
      if (chosen.length >= Math.max(1, Math.min(8, Number(opts.limit) || 6))) break;
    }
    const hits = chosen.map((x) => ({
      id: x.doc.id, title: x.doc.title, content: x.doc.content, sourceType: x.doc.sourceType,
      metadata: x.doc.metadata, score: x.score,
    }));
    return { hits, mode: vector.length ? "hybrid+rerank" : "bm25+rerank", candidates: docs.length };
  }
  async function ask(query, opts = {}) {
    const result = await search(query, opts);
    if (!result.hits.length) {
      return {
        answer: "知识库里没有找到足够依据。我只检索平台公开题库、岗位、企业和房源资料，不检索你的个人资料或上传文件。",
        sources: [], retrieval: { mode: result.mode, candidates: result.candidates, hits: 0 },
      };
    }
    const sources = result.hits.map((h, i) => ({
      index: i + 1, refType: h.sourceType, refId: h.metadata.questionId || h.metadata.jobId || h.metadata.companyId || h.metadata.housingId || h.id,
      title: h.title, content: h.content.slice(0, 500), source: h.metadata.source || "",
      sourceUrl: h.metadata.sourceUrl || "", answerSource: h.metadata.answerSource || "", score: h.score,
    }));
    const context = sources.map((s) => "[" + s.index + "] " + s.title + "\n" + s.content).join("\n\n");
    let answer = "";
    try {
      const r = await aiGateway.ragAnswer({ query, context });
      answer = String(r.text || "").trim();
    } catch {}
    if (!answer) answer = "我检索到了资料，但生成回答失败。你可以看下面的来源，或稍后重试。";
    return { answer, sources, retrieval: { mode: result.mode, candidates: result.candidates, hits: sources.length } };
  }

  async function build(onProgress) {
    if (status.running) return { already: true };
    status.running = true; status.done = 0; status.total = 0; status.error = ""; status.startedAt = Date.now(); status.finishedAt = 0;
    try {
      const docs = publicDocs();
      status.total = docs.length;
      const existing = new Map(db.prepare("SELECT id,content_hash,dim FROM rag_chunks").all().map((r) => [r.id, r]));
      const changed = docs.filter((d) => { const e = existing.get(d.id); return !e || e.content_hash !== d.contentHash || !e.dim; });
      const keep = new Set(docs.map((d) => d.id));
      const insert = db.prepare("INSERT INTO rag_chunks(id,source_type,source_id,title,content,metadata,content_hash,embedding,dim,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,content=excluded.content,metadata=excluded.metadata,content_hash=excluded.content_hash,embedding=excluded.embedding,dim=excluded.dim,updated_at=excluded.updated_at");
      for (let i = 0; i < changed.length; i += 10) {
        const batch = changed.slice(i, i + 10);
        const vectors = await aiGateway.embedTexts(batch.map((d) => d.title + "\n" + d.content));
        batch.forEach((d, j) => {
          const vec = vectors[j];
          insert.run(d.id, d.sourceType, d.sourceId, d.title, d.content, JSON.stringify(d.metadata), d.contentHash, vec ? toBuffer(vec) : null, vec ? vec.length : 0, Date.now());
          status.done++;
        });
        onProgress?.(status.done, status.total);
      }
      // remove stale chunks in batches
      const stale = [...existing.keys()].filter((id) => !keep.has(id));
      for (let i = 0; i < stale.length; i += 200) {
        const part = stale.slice(i, i + 200);
        db.prepare("DELETE FROM rag_chunks WHERE id IN (" + part.map(() => "?").join(",") + ")").run(...part);
      }
      setMeta("builtAt", String(Date.now()));
      setMeta("count", String(docs.length));
      setMeta("sourceDigest", sourceDigest());
      setMeta("embeddingModel", "text-embedding-v4");
      setMeta("rerankModel", "qwen3-rerank");
      invalidate();
      status.finishedAt = Date.now();
      return { built: true, total: docs.length, changed: changed.length };
    } catch (e) {
      status.error = String(e?.message || e).slice(0, 300);
      throw e;
    } finally {
      status.running = false;
    }
  }

  function stats() {
    const total = db.prepare("SELECT count(*) AS n FROM rag_chunks").get().n;
    const embedded = db.prepare("SELECT count(*) AS n FROM rag_chunks WHERE dim>0").get().n;
    const byType = db.prepare("SELECT source_type AS type,count(*) AS n FROM rag_chunks GROUP BY source_type").all();
    return {
      total, embedded, byType,
      builtAt: Number(meta("builtAt")) || null,
      count: Number(meta("count")) || total,
      embeddingModel: meta("embeddingModel") || "text-embedding-v4",
      rerankModel: meta("rerankModel") || "qwen3-rerank",
      sourceDigest: meta("sourceDigest") || "",
      fresh: !!meta("sourceDigest") && meta("sourceDigest") === (lastDigest || sourceDigest()),
      status: { ...status },
    };
  }
  function startBackgroundBuild() {
    if (status.running) return false;
    void build().catch((e) => console.error("[rag] build failed", String(e?.message || e)));
    return true;
  }
  return { search, ask, build, stats, startBackgroundBuild, invalidate };
}
