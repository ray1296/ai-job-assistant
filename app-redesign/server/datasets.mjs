import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { toMonthlyK } from "./dashboard.mjs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

export const CATEGORIES = ["jobs", "companies", "housing", "knowledge"];
export const FIELDS = {
  jobs: { title: "岗位名称", company: "公司", city: "城市", salary: "薪资", education: "学历", address: "详细地址", status: "投递状态", link: "链接", appliedAt: "投递时间", notes: "备注" },
  companies: { name: "企业名称", industry: "行业", scale: "规模", city: "城市", address: "地址", website: "官网", notes: "备注" },
  housing: { title: "房源标题", address: "地址", rent: "月租", area: "面积", layout: "户型", city: "城市", contact: "联系人", phone: "电话", notes: "备注" },
  knowledge: { topic: "主题", question: "问题", answer: "答案", tags: "标签", source: "来源" },
};
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS_SERVED = 500;
const execFileAsync = promisify(execFile);

const fail = (status, message) => Object.assign(new Error(message), { status });

// 展示脱敏：手机号/邮箱/身份证/座机打码。库里存原文，只有本人能看到明细。
export function mask(text) {
  return String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => m[0] + "***@" + m.split("@")[1])
    .replace(/(?<!\d)(\d{3})\d{4}(\d{4})(?!\d)/g, "$1****$2")
    .replace(/(?<!\d)(\d{6})\d{8}(\d{3}[0-9Xx])(?!\d)/g, "$1********$2")
    .replace(/(?<!\d)(\d{3,4})[- ]?(\d{7,8})(?!\d)/g, (m, a, b) => a + "-****" + String(b).slice(-2));
}

const norm = (s) => String(s || "").toLowerCase().replace(/[\s_\-()（）]/g, "");

// AI 不可用或返回不合规时的兜底：中英文列名都做包含匹配。
const ALIASES = {
  jobs: {
    title: /岗位|职位|职务|title|job|position/i,
    company: /公司|企业|company|employer|firm/i,
    city: /城市|地点|city|location/i,
    salary: /薪资|工资|待遇|salary|pay|compensation/i,
    education: /学历|education|degree/i,
    address: /地址|address/i,
    status: /状态|status/i,
    link: /链接|网址|url|link/i,
    appliedAt: /投递|申请时间|applied/i,
    notes: /备注|note|remark/i,
  },
  companies: {
    name: /企业|公司|名称|name|company/i,
    industry: /行业|industry/i,
    scale: /规模|scale|size/i,
    city: /城市|地点|city|location/i,
    address: /地址|address/i,
    website: /官网|网站|website|url/i,
    notes: /备注|note|remark/i,
  },
  housing: {
    title: /房源|标题|title|name/i,
    address: /地址|address|location/i,
    rent: /租金|月租|rent|price/i,
    area: /面积|area|size/i,
    layout: /户型|layout|room/i,
    city: /城市|city/i,
    contact: /联系人|contact|name/i,
    phone: /电话|手机|phone|tel/i,
    notes: /备注|note|remark/i,
  },
  knowledge: {
    topic: /主题|topic|category/i,
    question: /问题|题目|question/i,
    answer: /答案|answer/i,
    tags: /标签|tags/i,
    source: /来源|source/i,
  },
};
function heuristicMap(category, columns) {
  const wanted = FIELDS[category] || {};
  const rules = ALIASES[category] || {};
  const map = {};
  for (const [field, label] of Object.entries(wanted)) {
    const hit = columns.find((c) => {
      const n = norm(c);
      const rule = rules[field];
      return (rule && rule.test(c)) || n === norm(label) || n.includes(norm(label)) || norm(label).includes(n);
    });
    if (hit && !Object.values(map).includes(hit)) map[field] = hit;
  }
  return map;
}

const normKey = (v) => String(v ?? "").toLowerCase().replace(/[\s\-_/\\|,，。.;；:：()（）\[\]【】]/g, "");

function identityOf(category, mapping, obj) {
  const get = (field) => normKey(obj?.[mapping?.[field]] ?? "");
  if (category === "jobs") {
    const link = get("link");
    if (link) return "link:" + link;
    const title = get("title"), company = get("company"), city = get("city");
    return title || company ? "job:" + company + "|" + title + "|" + city : "";
  }
  if (category === "companies") {
    const key = get("name") || get("website");
    return key ? "company:" + key : "";
  }
  if (category === "housing") {
    const address = get("address");
    return address ? "house:" + address + "|" + get("title") : "";
  }
  if (category === "knowledge") {
    const question = get("question");
    return question ? "knowledge:" + question + "|" + get("source") : "";
  }
  return "";
}

function runParser(script, file, ext) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, file, ext], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 25000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(fail(500, "解析进程启动失败：" + e.message)); });
    child.on("close", () => {
      clearTimeout(timer);
      let data;
      try { data = JSON.parse(out.trim() || "{}"); } catch { return reject(fail(422, "解析结果无效" + (err ? "：" + err.slice(0, 80) : ""))); }
      if (data.error) return reject(fail(422, data.error));
      resolve(data);
    });
  });
}

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS datasets(",
  "  id TEXT PRIMARY KEY,",
  "  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
  "  category TEXT NOT NULL,",
  "  name TEXT NOT NULL,",
  "  source TEXT NOT NULL,",
  "  columns TEXT NOT NULL,",
  "  field_map TEXT NOT NULL,",
  "  mapped_by TEXT NOT NULL DEFAULT 'heuristic',",
  "  row_count INTEGER NOT NULL,",
  "  created_at INTEGER NOT NULL",
  ");",
  "CREATE INDEX IF NOT EXISTS datasets_owner ON datasets(user_id, created_at DESC);",
  "CREATE TABLE IF NOT EXISTS dataset_rows(",
  "  dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,",
  "  row_index INTEGER NOT NULL,",
  "  data TEXT NOT NULL,",
  "  PRIMARY KEY(dataset_id, row_index)",
  ");",
].join("\n");

export function createDatasets(db, privateDir, options = {}) {
  const script = path.join(path.dirname(new URL(import.meta.url).pathname), "parse-dataset.py");
  const ai = options.ai; // aiGateway（可选）
  db.exec(SCHEMA);

  async function mapWithAi(category, columns, sample) {
    if (!ai?.dataset) return null;
    try {
      const r = await ai.dataset({ category, columns, sample });
      const mapping = r?.mapping;
      if (!mapping || typeof mapping !== "object") return null;
      const clean = {};
      for (const [field, col] of Object.entries(mapping)) {
        if (field in (FIELDS[category] || {}) && typeof col === "string" && columns.includes(col))
          clean[field] = col;
      }
      return Object.keys(clean).length ? clean : null;
    } catch {
      return null;
    }
  }

  async function create(userId, { category, name, buffer, ext }) {
    if (!CATEGORIES.includes(category)) throw fail(400, "请选择数据类别");
    if (!buffer || !buffer.length) throw fail(400, "文件是空的");
    if (buffer.length > MAX_BYTES) throw fail(413, "文件需小于 8MiB");
    const e = String(ext || "").toLowerCase().replace(/^\./, "");
    if (!["csv", "tsv", "json", "ndjson", "jsonl", "xml", "xlsx", "xls", "txt"].includes(e))
      throw fail(415, "支持 CSV / TSV / JSON / NDJSON / XML / XLSX");
    const folder = path.join(privateDir, "dataset-tmp");
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const tmp = path.join(folder, randomUUID() + "." + (e === "txt" ? "csv" : e));
    try {
      await fs.writeFile(tmp, buffer, { mode: 0o600 });
      let parsePath = tmp;
      let parseExt = e === "txt" ? "csv" : e;
      if (e === "xls") {
        // 旧版 .xls 没有标准库解析器；有 LibreOffice 时先转 xlsx，否则明确提示用户另存。
        try {
          await execFileAsync("libreoffice", ["--headless", "--convert-to", "xlsx", "--outdir", folder, tmp], { timeout: 30000, maxBuffer: 1024 * 1024 });
          const converted = tmp.replace(/\.xls$/i, ".xlsx");
          if (!fsSync.existsSync(converted)) throw new Error("convert output missing");
          parsePath = converted;
          parseExt = "xlsx";
        } catch {
          throw fail(422, "旧版 .xls 无法解析，请另存为 .xlsx 或 CSV 再上传");
        }
      }
      const parsed = await runParser(script, parsePath, parseExt);
      const columns = parsed.columns;
      const rows = parsed.rows;
      if (!columns?.length || !rows?.length) throw fail(422, "没有解析到有效数据");
      const sample = rows.slice(0, 3).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
      let mapping = await mapWithAi(category, columns, sample);
      const aiUsed = !!mapping;
      const heuristic = heuristicMap(category, columns);
      // AI 只映射到部分列时，用中英文列名规则补齐，避免 company/city 等全部丢失。
      if (mapping) {
        for (const [field, column] of Object.entries(heuristic)) if (!mapping[field]) mapping[field] = column;
      } else {
        mapping = heuristic;
      }
      const mappedBy = aiUsed ? "ai" : "heuristic";
      // 岗位数据：把薪资统一折算成"月薪(K)"，规则算不出的交给 AI
      let salaryCol = null;
      const salaryValues = {};
      if (category === "jobs") {
        salaryCol = mapping.salary || columns.find((c) => /薪|工资|待遇/.test(c)) || null;
        if (salaryCol) {
          const idx = columns.indexOf(salaryCol);
          const raws = [...new Set(rows.map((r) => String(r[idx] || "").trim()).filter(Boolean))].slice(0, 40);
          const unresolved = [];
          for (const raw of raws) {
            const k = toMonthlyK(raw);
            if (k === null) unresolved.push(raw);
            else salaryValues[raw] = Math.round(k * 10) / 10;
          }
          if (unresolved.length && ai?.salary) {
            try {
              const r = await ai.salary({ values: unresolved });
              Object.assign(salaryValues, r?.mapping || {});
            } catch { /* AI 失败就留空 */ }
          }
        }
      }
      const rowObjects = rows.map((row) => {
        const obj = Object.fromEntries(columns.map((c, k) => [c, row[k]]));
        if (salaryCol) {
          const v = salaryValues[String(row[columns.indexOf(salaryCol)] || "").trim()];
          obj["月薪(K)"] = v == null ? "" : String(v);
        }
        return obj;
      });
      // 同一份文件内按业务主键去重，保留最后出现的那一行。
      const seen = new Map();
      const uniqueRows = [];
      let deduped = 0;
      for (const obj of rowObjects) {
        const key = identityOf(category, mapping, obj);
        if (key && seen.has(key)) {
          uniqueRows[seen.get(key)] = obj;
          deduped++;
        } else {
          if (key) seen.set(key, uniqueRows.length);
          uniqueRows.push(obj);
        }
      }
      const newKeys = new Set(uniqueRows.map((obj) => identityOf(category, mapping, obj)).filter(Boolean));
      const id = randomUUID().replace(/-/g, "").slice(0, 24);
      const insertRow = db.prepare("INSERT INTO dataset_rows(dataset_id,row_index,data) VALUES(?,?,?)");
      db.exec("BEGIN");
      let replaced = 0;
      try {
        // 同一岗位/企业/房源/问题在旧上传里再次出现时，以本次为准，删除旧行。
        const oldSets = db.prepare("SELECT id,field_map FROM datasets WHERE user_id=? AND category=?").all(userId, category);
        for (const old of oldSets) {
          let oldMap = {};
          try { oldMap = JSON.parse(old.field_map) || {}; } catch {}
          const oldRows = db.prepare("SELECT row_index,data FROM dataset_rows WHERE dataset_id=? ORDER BY row_index").all(old.id);
          let removed = 0;
          for (const row of oldRows) {
            let obj = {};
            try { obj = JSON.parse(row.data) || {}; } catch {}
            const key = identityOf(category, oldMap, obj);
            if (key && newKeys.has(key)) {
              db.prepare("DELETE FROM dataset_rows WHERE dataset_id=? AND row_index=?").run(old.id, row.row_index);
              removed++;
            }
          }
          if (removed) {
            replaced += removed;
            const remaining = db.prepare("SELECT count(*) AS n FROM dataset_rows WHERE dataset_id=?").get(old.id).n;
            if (remaining) db.prepare("UPDATE datasets SET row_count=? WHERE id=?").run(remaining, old.id);
            else {
              db.prepare("DELETE FROM datasets WHERE id=?").run(old.id);
              db.prepare("DELETE FROM dataset_rows WHERE dataset_id=?").run(old.id);
            }
          }
        }
        db.prepare(
          "INSERT INTO datasets(id,user_id,category,name,source,columns,field_map,mapped_by,row_count,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(id, userId, category, String(name || "未命名数据").slice(0, 120), e, JSON.stringify(columns), JSON.stringify(mapping), mappedBy, uniqueRows.length, Date.now());
        uniqueRows.forEach((obj, i) => insertRow.run(id, i, JSON.stringify(obj)));
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      const finalColumns = salaryCol ? [...columns, "月薪(K)"] : columns;
      return { id, category, name, columns: finalColumns, mapping, mappedBy, rowCount: uniqueRows.length, deduped, replaced, truncated: !!parsed.truncated };
    } finally {
      fs.rm(tmp, { force: true }).catch(() => {});
    }
  }

  function list(userId) {
    return db
      .prepare("SELECT id,category,name,source,columns,field_map,mapped_by,row_count,created_at FROM datasets WHERE user_id=? ORDER BY created_at DESC")
      .all(userId)
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: r.name,
        source: r.source,
        columns: JSON.parse(r.columns),
        mapping: JSON.parse(r.field_map),
        mappedBy: r.mapped_by,
        rowCount: r.row_count,
        createdAt: r.created_at,
      }));
  }

  function detail(userId, id, offset = 0, limit = 100) {
    const d = db.prepare("SELECT * FROM datasets WHERE id=? AND user_id=?").get(id, userId);
    if (!d) throw fail(404, "数据不存在或不属于当前账号");
    const rows = db
      .prepare("SELECT data FROM dataset_rows WHERE dataset_id=? ORDER BY row_index LIMIT ? OFFSET ?")
      .all(id, Math.min(Number(limit) || 100, MAX_ROWS_SERVED), Math.max(0, Number(offset) || 0))
      .map((r) => {
        const raw = JSON.parse(r.data);
        return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, mask(v)]));
      });
    return {
      id: d.id,
      category: d.category,
      name: d.name,
      source: d.source,
      columns: JSON.parse(d.columns),
      mapping: JSON.parse(d.field_map),
      mappedBy: d.mapped_by,
      rowCount: d.row_count,
      createdAt: d.created_at,
      offset,
      rows,
    };
  }

  function remove(userId, id) {
    const info = db.prepare("DELETE FROM datasets WHERE id=? AND user_id=?").run(id, userId);
    if (!info.changes) throw fail(404, "数据不存在或不属于当前账号");
    db.prepare("DELETE FROM dataset_rows WHERE dataset_id=?").run(id);
    return { ok: true };
  }

  // 给地图用：按数据集分组返回，附带字段映射，方便定位"地址"列
  function rowsForMap(userId, category, perSet = 200) {
    const sets = db.prepare("SELECT id,name,field_map FROM datasets WHERE user_id=? AND category=?").all(userId, category);
    return sets.map((set) => ({
      datasetId: set.id,
      datasetName: set.name,
      mapping: JSON.parse(set.field_map),
      rows: db
        .prepare("SELECT data FROM dataset_rows WHERE dataset_id=? ORDER BY row_index LIMIT ?")
        .all(set.id, perSet)
        .map((r) => {
          const raw = JSON.parse(r.data);
          return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, mask(v)]));
        }),
    }));
  }

  return { create, list, detail, remove, rowsForMap, fields: FIELDS, categories: CATEGORIES };
}
