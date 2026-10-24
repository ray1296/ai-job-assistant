import { loadCompanies, loadPlatformHousing } from "./data-catalog.mjs";
import { listJobs } from "./jobs-catalog.mjs";

export const TOOLS = [
  { name: "search_jobs", description: "按关键词/城市搜索岗位", inputSchema: { type: "object", properties: { keyword: { type: "string" }, city: { type: "string" }, limit: { type: "number" } } } },
  { name: "company_review", description: "查询企业风评与工商信息", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "find_housing", description: "查询城市租房（可按租金上限）", inputSchema: { type: "object", properties: { city: { type: "string" }, maxRent: { type: "number" } } } },
  { name: "my_progress", description: "查询当前用户的学习题库进度", inputSchema: { type: "object", properties: {} } },
];

export function callTool(name, args = {}, ctx = {}) {
  if (name === "search_jobs") {
    const kw = String(args.keyword || "").toLowerCase();
    const city = String(args.city || "");
    const limit = Math.min(10, Number(args.limit) || 5);
    const list = listJobs({}).filter((j) => {
      const hay = [j.title, j.company, j.city, j.direction].join(" ").toLowerCase();
      return (!kw || hay.includes(kw)) && (!city || String(j.city || "").includes(city));
    }).slice(0, limit);
    return { count: list.length, items: list.map((j) => ({ title: j.title, company: j.company, city: j.city, salary: j.salary, url: j.url })) };
  }
  if (name === "company_review") {
    const kw = String(args.name || "").trim();
    const c = loadCompanies().find((x) => x.name.includes(kw) || kw.includes(x.name));
    if (!c) return { error: "没有这家企业的数据" };
    return { name: c.name, rating: c.rating, summary: c.summary, pros: c.pros, cons: c.cons, salary: c.salary, overtime: c.overtime };
  }
  if (name === "find_housing") {
    const city = String(args.city || "");
    const maxRent = Number(args.maxRent) || 0;
    const list = loadPlatformHousing(city).filter((h) => !maxRent || Number(h.rent || 0) <= maxRent).slice(0, 6);
    return { count: list.length, items: list.map((h) => ({ community: h.community, rent: h.rent, layout: h.layout, url: h.url })) };
  }
  if (name === "my_progress") {
    const study = ctx.study;
    if (!study) return { error: "无法读取学习数据" };
    const subs = study.subjects(ctx.userId);
    return {
      subjects: subs.map((s) => ({ name: s.name, versions: s.versions.map((v) => ({ name: v.name, total: v.total })) })),
    };
  }
  return { error: "未知工具：" + name };
}
