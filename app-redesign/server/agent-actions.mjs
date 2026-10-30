import { randomBytes } from "node:crypto";

/**
 * Agent 写操作必须经过两阶段确认：
 * 1. 模型/路由只提出 proposal，绝不直接改库；
 * 2. 用户在 UI 点确认后，才用一次性 token 执行。
 */
export function createAgentActions({ db, plan, listJobs, getDatasets }) {
  const pending = new Map(); // token -> {userId,tool,args,summary,expires}
  const TTL = 5 * 60 * 1000;
  const clean = () => {
    const now = Date.now();
    for (const [k, v] of pending) if (v.expires <= now) pending.delete(k);
  };
  function resolveJob(args = {}) {
    const title = String(args.jobTitle || args.title || "").trim().slice(0, 120);
    const company = String(args.company || "").trim().slice(0, 80);
    const id = String(args.jobId || "").trim();
    let jobs = listJobs({ q: title || company, pageSize: 20 }).jobs || [];
    if (id) jobs = jobs.filter((j) => j.id === id).concat(jobs.filter((j) => j.id !== id));
    const hit = jobs.find((j) => (!title || j.title === title || j.title.includes(title)) && (!company || j.company.includes(company))) || jobs[0];
    if (!hit) throw Object.assign(new Error("没有找到匹配岗位"), { status: 404 });
    return hit;
  }
  async function execute(userId, tool, args) {
    if (tool === "import_dataset") {
      const datasets = getDatasets?.();
      if (!datasets?.create) throw Object.assign(new Error("导入服务不可用"), { status: 503 });
      const text = String(args.text || "");
      if (!text.trim()) throw Object.assign(new Error("导入内容为空"), { status: 400 });
      const out = await datasets.create(userId, {
        category: String(args.category || "jobs"),
        name: String(args.name || "导入的岗位数据").slice(0, 80),
        buffer: Buffer.from(text, "utf8"),
        ext: String(args.ext || "csv"),
      });
      return { ok: true, tool, datasetId: out.id, rows: out.rowCount, deduped: out.deduped || 0, name: out.name };
    }
    if (tool === "add_job_intent") {
      const job = resolveJob(args);
      plan.mutateIntent(userId, job.id, true);
      return { ok: true, tool, job: { id: job.id, title: job.title, company: job.company, city: job.city } };
    }
    if (tool === "create_wish") {
      const text = String(args.text || "").trim().slice(0, 500);
      if (!text) throw Object.assign(new Error("心愿内容为空"), { status: 400 });
      const existed = db.prepare("SELECT id FROM wishes WHERE user_id=? AND text=? AND created_at>?").get(userId, text, Date.now() - 5000);
      if (existed) return { ok: true, tool, wishId: existed.id, deduped: true };
      const id = randomBytes(10).toString("hex"), now = Date.now();
      db.prepare("INSERT INTO wishes(id,user_id,text,done,sort_order,created_at,updated_at,status) VALUES(?,?,?,0,?,?,?,'pending')")
        .run(id, userId, text, (db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM wishes").get().n) || 1, now, now);
      return { ok: true, tool, wishId: id, text, status: "pending" };
    }
    throw Object.assign(new Error("不支持的写操作"), { status: 400 });
  }
  function propose(userId, tool, args, summary) {
    clean();
    const token = randomBytes(16).toString("hex");
    const item = { userId, tool, args: args || {}, summary: String(summary || tool), expires: Date.now() + TTL };
    pending.set(token, item);
    return { token, tool, args: item.args, summary: item.summary, expiresAt: item.expires };
  }
  async function confirm(userId, token) {
    clean();
    const item = pending.get(token);
    if (!item || item.userId !== userId) throw Object.assign(new Error("确认已过期，请重新发起"), { status: 410 });
    pending.delete(token);
    return await execute(userId, item.tool, item.args);
  }
  function cancel(userId, token) {
    const item = pending.get(token);
    if (item?.userId === userId) pending.delete(token);
    return { ok: true };
  }
  return { propose, confirm, cancel };
}
