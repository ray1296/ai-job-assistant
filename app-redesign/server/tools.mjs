import { loadCompanies, loadPlatformHousing } from "./data-catalog.mjs";
import { listJobs } from "./jobs-catalog.mjs";
import { guideFor, guideText } from "./project-guide.mjs";
import { inventorySections } from "./ui-inventory.mjs";

export const TOOLS = [
  { name: "search_jobs", description: "按关键词/城市搜索岗位", inputSchema: { type: "object", properties: { keyword: { type: "string" }, city: { type: "string" }, limit: { type: "number" } } } },
  { name: "company_review", description: "查询企业风评与工商信息", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "find_housing", description: "查询城市租房（可按租金上限）", inputSchema: { type: "object", properties: { city: { type: "string" }, maxRent: { type: "number" } } } },
  { name: "my_progress", description: "查询当前用户的学习题库进度", inputSchema: { type: "object", properties: {} } },
  { name: "project_guide", description: "查项目各功能的作用和使用方法；用户问“这个功能怎么用/项目有哪些功能”时使用", inputSchema: { type: "object", properties: { topic: { type: "string" } } } },
  { name: "add_job_intent", description: "写操作：把匹配岗位加入投递意向；必须经用户确认后才执行", inputSchema: { type: "object", properties: { jobTitle: { type: "string" }, company: { type: "string" } }, required: ["jobTitle"] } },
  { name: "create_wish", description: "写操作：提交一条待审核心愿；必须经用户确认后才执行", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
];
export const WRITE_TOOLS = new Set(["add_job_intent", "create_wish"]);

/** 工具端强制拦截：任何删除 / 覆盖 / 执行类工具名都不会被派发。 */
const BLOCKED_TOOL = /^(delete|drop|truncate|reset|clear|wipe|remove|purge|destroy|overwrite|format|exec|shell|run_)/i;
const BLOCKED_ARG = /^(delete|drop|truncate|wipe|purge|overwrite|recursive|force_delete)$/i;
/** 身份只能由服务端会话提供；工具参数里出现身份字段一律视为越权尝试。 */
const IDENTITY_ARG = /^(user_?id|owner_?id|account_?id|tenant_?id|openid)$/i;

export function callTool(name, args = {}, ctx = {}) {
  const toolName = typeof name === "string" ? name.trim() : "";
  if (!toolName || BLOCKED_TOOL.test(toolName))
    throw Object.assign(new Error("该工具被安全策略拒绝"), { code: "BLOCKED_TOOL" });
  if (!TOOLS.some((t) => t.name === toolName))
    return { error: "未知工具：" + toolName };
  if (args && typeof args === "object" && Object.keys(args).some((k) => BLOCKED_ARG.test(k) || IDENTITY_ARG.test(k)))
    throw Object.assign(new Error("该工具参数被安全策略拒绝"), { code: "BLOCKED_TOOL" });
  if (toolName === "search_jobs") {
    const kw = String(args.keyword || "").trim();
    const city = String(args.city || "").trim();
    const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));
    // listJobs 返回 { jobs, total, ... }，不是数组。
    const page = listJobs({ q: kw, city, pageSize: limit });
    const list = Array.isArray(page?.jobs) ? page.jobs.slice(0, limit) : [];
    return {
      count: list.length,
      total: page?.total || list.length,
      items: list.map((j) => ({ title: j.title, company: j.company, city: (j.cities || [j.city]).filter(Boolean).join("/"), salary: j.salary, url: j.url })),
    };
  }
  if (toolName === "company_review") {
    const kw = String(args.name || "").trim().slice(0, 60);
    // 空名称会让 includes("") 命中第一家企业，返回完全错误的数据
    if (!kw) return { error: "请提供要查询的企业名称" };
    const c = loadCompanies().find((x) => x.name.includes(kw) || kw.includes(x.name));
    if (!c) return { error: "没有这家企业的数据" };
    return { name: c.name, rating: c.rating, summary: c.summary, pros: c.pros, cons: c.cons, salary: c.salary, overtime: c.overtime };
  }
  if (toolName === "find_housing") {
    const city = String(args.city || "");
    const maxRent = Number(args.maxRent) || 0;
    const list = loadPlatformHousing(city).filter((h) => !maxRent || Number(h.rent || 0) <= maxRent).slice(0, 6);
    return { count: list.length, items: list.map((h) => ({ community: h.community, rent: h.rent, layout: h.layout, url: h.url })) };
  }
  if (WRITE_TOOLS.has(toolName)) {
    return { requiresConfirmation: true, tool: toolName, args, summary: toolName === "add_job_intent" ? "把岗位「" + String(args.jobTitle || args.title || "匹配岗位") + "」加入投递意向" : "提交心愿：" + String(args.text || "").slice(0, 80) };
  }
  if (toolName === "project_guide") {
    const topic = String(args.topic || "").trim();
    const secs = guideFor(topic).map((s) => ({ id: s.id, title: s.title, summary: s.summary, steps: s.steps }));
    // 再按界面元素清单补按钮级说明（"批量简化答案"、"收藏"这类）
    const q = topic.toLowerCase();
    const inv = (q ? inventorySections().filter((x) => {
      const name = String(x.title || "").split("（")[0].toLowerCase();
      return name.length >= 2 && (q.includes(name) || name.includes(q.slice(0, 4)));
    }).slice(0, 3) : []).map((x) => ({ id: x.id, title: x.title, summary: x.summary, steps: [] }));
    return { sections: [...inv, ...secs].slice(0, 5), text: [inv.map((x) => x.title + "：" + x.summary).join("\n"), guideText(topic)].filter(Boolean).join("\n") };
  }
  if (toolName === "my_progress") {
    const study = ctx.study;
    if (!study) return { error: "无法读取学习数据" };
    const subs = study.subjects(ctx.userId);
    return {
      subjects: subs.map((s) => ({ name: s.name, versions: s.versions.map((v) => ({ name: v.name, total: v.total })) })),
    };
  }
  return { error: "工具没有返回结果" };
}
