import { randomUUID } from "node:crypto";
import fs from "node:fs";

let catalogCache = null;
function catalog() {
  if (!catalogCache) {
    try {
      const parsed = JSON.parse(fs.readFileSync(new URL("../data/learning-catalog.json", import.meta.url), "utf8"));
      catalogCache = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    } catch { catalogCache = []; }
  }
  return Array.isArray(catalogCache) ? catalogCache : [];
}

const fail = (status, message) => Object.assign(new Error(message), { status });
const TYPES = ["single", "judge", "short", "blank"];
const uid = () => randomUUID().replace(/-/g, "").slice(0, 24);

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS study_subjects(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,is_system INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);",
  "CREATE INDEX IF NOT EXISTS study_subjects_owner ON study_subjects(user_id,created_at);",
  "CREATE TABLE IF NOT EXISTS study_versions(id TEXT PRIMARY KEY,subject_id TEXT NOT NULL REFERENCES study_subjects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,source TEXT NOT NULL DEFAULT '',is_system INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);",
  "CREATE INDEX IF NOT EXISTS study_versions_owner ON study_versions(subject_id,created_at);",
  "CREATE TABLE IF NOT EXISTS study_questions(id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES study_versions(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,seq INTEGER NOT NULL,type TEXT NOT NULL,stem TEXT NOT NULL,options TEXT NOT NULL DEFAULT '[]',answer TEXT NOT NULL DEFAULT '',analysis TEXT NOT NULL DEFAULT '',simple_answer TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '[]',difficulty TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);",
  "CREATE INDEX IF NOT EXISTS study_questions_version ON study_questions(version_id,seq);",
  "CREATE TABLE IF NOT EXISTS study_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question_id TEXT NOT NULL REFERENCES study_questions(id) ON DELETE CASCADE,correct INTEGER NOT NULL,created_at INTEGER NOT NULL);",
  "CREATE INDEX IF NOT EXISTS study_attempts_owner ON study_attempts(user_id,created_at);",
].join("\n");

export function createStudy(db, options = {}) {
  const ai = options.ai || null;
  db.exec(SCHEMA);
  // 老库补字段
  for (const [table, col] of [["study_subjects", "is_system"], ["study_versions", "is_system"]]) {
    const cols = db.prepare("PRAGMA table_info(" + table + ")").all().map((c) => c.name);
    if (!cols.includes(col)) db.exec("ALTER TABLE " + table + " ADD COLUMN " + col + " INTEGER NOT NULL DEFAULT 0");
  }
  // 首次进入时把平台面经题库灌进来（所有用户都有，只读）
  const SYSTEM_SUBJECT = "平台面经题库";
  function ensureSystemLibrary(userId) {
    const has = db.prepare("SELECT id FROM study_subjects WHERE user_id=? AND is_system=1").get(userId);
    if (has) return has.id;
    const sid = "sys" + uid().slice(0, 21);
    const now = Date.now();
    db.prepare("INSERT INTO study_subjects(id,user_id,name,is_system,created_at) VALUES(?,?,?,1,?)").run(sid, userId, SYSTEM_SUBJECT, now);
    const stmt = insertQ();
    for (const d of catalogDirections()) {
      const vid = "sys" + uid().slice(0, 21);
      db.prepare("INSERT INTO study_versions(id,subject_id,user_id,name,source,is_system,created_at) VALUES(?,?,?,?,?,1,?)")
        .run(vid, sid, userId, d.name + " · 面经", "平台面经题库", now);
      const rows = questionsFromCatalog(d.name, 200);
      rows.forEach((q, i) => {
        stmt.run(uid(), vid, userId, i + 1, q.type, q.stem,
          JSON.stringify(q.options || []), q.answer || "", q.analysis || "", q.simpleAnswer || "",
          q.source || "", JSON.stringify(q.tags || []), q.difficulty || "", now);
      });
    }
    return sid;
  }

  const ownSubject = (userId, id) => {
    const s = db.prepare("SELECT * FROM study_subjects WHERE id=? AND user_id=?").get(id, userId);
    if (!s) throw fail(404, "科目不存在");
    return s;
  };
  const ownVersion = (userId, id) => {
    const v = db.prepare("SELECT * FROM study_versions WHERE id=? AND user_id=?").get(id, userId);
    if (!v) throw fail(404, "版本不存在");
    return v;
  };
  const ownQuestion = (userId, id) => {
    const q = db.prepare("SELECT * FROM study_questions WHERE id=? AND user_id=?").get(id, userId);
    if (!q) throw fail(404, "题目不存在");
    return q;
  };

  function subjects(userId) {
    ensureSystemLibrary(userId);
    const list = db.prepare("SELECT * FROM study_subjects WHERE user_id=? ORDER BY is_system DESC, created_at DESC").all(userId);
    const versions = db.prepare("SELECT v.*, (SELECT COUNT(*) FROM study_questions q WHERE q.version_id=v.id) AS total FROM study_versions v WHERE v.user_id=? ORDER BY v.created_at DESC").all(userId);
    return list.map((s) => ({
      id: s.id,
      name: s.name,
      isSystem: !!s.is_system,
      createdAt: s.created_at,
      versions: versions.filter((v) => v.subject_id === s.id).map((v) => ({ id: v.id, name: v.name, total: v.total, isSystem: !!v.is_system, createdAt: v.created_at })),
    }));
  }

  function createSubject(userId, name) {
    const n = String(name || "").trim();
    if (!n || n.length > 60) throw fail(400, "科目名称需为 1-60 字");
    const id = uid();
    db.prepare("INSERT INTO study_subjects(id,user_id,name,created_at) VALUES(?,?,?,?)").run(id, userId, n, Date.now());
    return { id, name: n };
  }
  function renameSubject(userId, id, name) {
    const sub = ownSubject(userId, id);
    if (sub.is_system) throw fail(403, "平台题库是只读的，可以另建自己的科目");
    const n = String(name || "").trim();
    if (!n || n.length > 60) throw fail(400, "科目名称需为 1-60 字");
    db.prepare("UPDATE study_subjects SET name=? WHERE id=?").run(n, id);
    return { ok: true };
  }
  function removeSubject(userId, id) {
    const sub = ownSubject(userId, id);
    if (sub.is_system) throw fail(403, "平台题库是只读的，不能删除");
    const versions = db.prepare("SELECT id FROM study_versions WHERE subject_id=?").all(id);
    for (const v of versions) db.prepare("DELETE FROM study_questions WHERE version_id=?").run(v.id);
    db.prepare("DELETE FROM study_versions WHERE subject_id=?").run(id);
    db.prepare("DELETE FROM study_subjects WHERE id=?").run(id);
    return { ok: true };
  }

  const insertQ = () =>
    db.prepare("INSERT INTO study_questions(id,version_id,user_id,seq,type,stem,options,answer,analysis,simple_answer,source,tags,difficulty,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

  function createVersion(userId, subjectId, input) {
    ownSubject(userId, subjectId);
    const name = String(input?.name || "").trim().slice(0, 60) || "未命名版本";
    const rows = Array.isArray(input?.questions) ? input.questions : [];
    if (!rows.length) throw fail(400, "这个版本里没有题目，请先选择要导入的题库或上传文件");
    if (rows.length > 2000) throw fail(400, "单个版本最多 2000 道题");
    const id = uid();
    const now = Date.now();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO study_versions(id,subject_id,user_id,name,source,created_at) VALUES(?,?,?,?,?,?)")
        .run(id, subjectId, userId, name, String(input?.source || "").slice(0, 120), now);
      const stmt = insertQ();
      rows.forEach((q, i) => {
        const type = TYPES.includes(q.type) ? q.type : "short";
        stmt.run(uid(), id, userId, i + 1, type,
          String(q.stem || "").slice(0, 4000),
          JSON.stringify(Array.isArray(q.options) ? q.options.slice(0, 8).map((o) => String(o).slice(0, 400)) : []),
          String(q.answer || "").slice(0, 4000),
          String(q.analysis || "").slice(0, 4000),
          String(q.simpleAnswer || "").slice(0, 2000),
          String(q.source || "").slice(0, 300),
          JSON.stringify(Array.isArray(q.tags) ? q.tags.slice(0, 10).map((t) => String(t).slice(0, 40)) : []),
          String(q.difficulty || "").slice(0, 20),
          now);
      });
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return { id, name, total: rows.length };
  }

  function renameVersion(userId, id, name) {
    const v = ownVersion(userId, id);
    if (v.is_system) throw fail(403, "平台题库是只读的");
    const n = String(name || "").trim();
    if (!n || n.length > 60) throw fail(400, "版本名称需为 1-60 字");
    db.prepare("UPDATE study_versions SET name=? WHERE id=?").run(n, id);
    return { ok: true };
  }
  function removeVersion(userId, id) {
    const v = ownVersion(userId, id);
    if (v.is_system) throw fail(403, "平台题库是只读的");
    db.prepare("DELETE FROM study_questions WHERE version_id=?").run(id);
    db.prepare("DELETE FROM study_versions WHERE id=?").run(id);
    return { ok: true };
  }

  function questions(userId, versionId, opts = {}) {
    const v = ownVersion(userId, versionId);
    const type = TYPES.includes(opts.type) ? opts.type : "";
    const rows = type
      ? db.prepare("SELECT * FROM study_questions WHERE version_id=? AND type=? ORDER BY seq").all(versionId, type)
      : db.prepare("SELECT * FROM study_questions WHERE version_id=? ORDER BY seq").all(versionId);
    const attempts = db.prepare("SELECT question_id, correct FROM study_attempts WHERE user_id=?").all(userId);
    const stat = new Map();
    for (const a of attempts) {
      const cur = stat.get(a.question_id) || { n: 0, ok: 0 };
      cur.n += 1; if (a.correct) cur.ok += 1;
      stat.set(a.question_id, cur);
    }
    return {
      version: { id: v.id, name: v.name, source: v.source },
      total: rows.length,
      questions: rows.map((q) => ({
        id: q.id, type: q.type, stem: q.stem,
        options: JSON.parse(q.options || "[]"),
        answer: q.answer, analysis: q.analysis, simpleAnswer: q.simple_answer,
        source: q.source, tags: JSON.parse(q.tags || "[]"), difficulty: q.difficulty,
        attempts: stat.get(q.id)?.n || 0,
        correct: stat.get(q.id)?.ok || 0,
      })),
    };
  }

  function appendQuestions(userId, versionId, rows, sourceLabel) {
    const v = ownVersion(userId, versionId);
    const list = (Array.isArray(rows) ? rows : []).slice(0, 50);
    if (!list.length) throw fail(400, "没有可追加的题目");
    const max = db.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM study_questions WHERE version_id=?").get(versionId).m;
    const now = Date.now();
    const stmt = insertQ();
    db.exec("BEGIN");
    try {
      list.forEach((q, i) => {
        const type = TYPES.includes(q.type) ? q.type : "short";
        stmt.run(uid(), versionId, userId, max + i + 1, type,
          String(q.stem || "").slice(0, 4000),
          JSON.stringify(Array.isArray(q.options) ? q.options.slice(0, 8) : []),
          String(q.answer || "").slice(0, 4000),
          String(q.analysis || "").slice(0, 4000),
          String(q.simpleAnswer || "").slice(0, 2000),
          String(q.source || sourceLabel || "AI 生成").slice(0, 300),
          JSON.stringify(Array.isArray(q.tags) ? q.tags.slice(0, 10) : ["AI生成"]),
          String(q.difficulty || "").slice(0, 20),
          now);
      });
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    return { appended: list.length, version: v.name };
  }

  function recordAttempt(userId, questionId, correct) {
    ownQuestion(userId, questionId);
    db.prepare("INSERT INTO study_attempts(user_id,question_id,correct,created_at) VALUES(?,?,?,?)")
      .run(userId, questionId, correct ? 1 : 0, Date.now());
    return { ok: true };
  }

  // 从平台面经题库生成题目（按方向）
  function questionsFromCatalog(direction, limit = 200) {
    const all = catalog();
    const rows = direction ? all.filter((q) => q.direction === direction) : all;
    return rows.slice(0, limit).map((q) => ({
      type: "short",
      stem: q.question,
      answer: q.answer || "",
      simpleAnswer: "",
      source: [q.source, q.sourceUrl].filter(Boolean).join(" "),
      tags: [q.direction, q.category, q.importance].filter(Boolean),
      analysis: "",
    }));
  }

  function catalogDirections() {
    const all = catalog();
    const map = new Map();
    for (const q of all) {
      const d = q.direction || "未分类";
      map.set(d, (map.get(d) || 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }

  return {
    subjects, createSubject, renameSubject, removeSubject,
    createVersion, renameVersion, removeVersion,
    questions, recordAttempt, appendQuestions, questionsFromCatalog, catalogDirections, ensureSystemLibrary,
    ownQuestion, ownVersion, ai,
  };
}
