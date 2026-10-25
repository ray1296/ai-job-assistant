import { TOOLS } from "./tools.mjs";
import { loadCompanies } from "./data-catalog.mjs";
let companyNames = null;
const companies = () => (companyNames ||= loadCompanies().map((c) => String(c.name || "")).filter(Boolean));

/**
 * Tool RAG：工具注册表本身就是检索语料。
 * 工具少时先用确定性关键词/字词重叠，避免为 4 个工具维护一套向量索引；
 * 以后工具变多，只要替换 retrieve() 为向量召回，调用方不变。
 */
const ALIASES = {
  search_jobs: "岗位 职位 招聘 工作 校招 实习 求职 公司 城市 java 前端 测试 数据 运维 agent",
  company_review: "企业 公司 风评 评价 这家公司 加班 薪资 面试体验 工商 规模",
  find_housing: "租房 房租 租金 合租 整租 通勤 小区 房源 房子 找房 住 城市 预算",
  my_progress: "学习 刷题 刷了 多少题 做题 进度 错题 复习 收藏 掌握 题库 题目 学习进度",
  project_guide: "项目 介绍 功能 怎么用 使用说明 帮助 教程 按钮 页面 新手 项目说明",
};

function tokens(text) {
  const s = String(text || "").toLowerCase().normalize("NFKC");
  const out = new Set();
  for (const w of s.match(/[a-z0-9]+/g) || []) if (w.length > 1) out.add(w);
  for (const run of s.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}

function docFor(tool) {
  const params = Object.keys(tool.inputSchema?.properties || {}).join(",");
  const keywords = (ALIASES[tool.name] || "").split(/\s+/).filter(Boolean);
  return {
    name: tool.name,
    text: [tool.name, tool.description, params, keywords.join(" ")].join(" "),
    keywords,
    tool,
  };
}

export function retrieveTools(query, limit = 3) {
  const docs = TOOLS.map(docFor);
  const qt = tokens(query);
  if (!qt.length) return [];
  const counts = new Map();
  for (const t of qt) counts.set(t, 1);
  const scored = docs.map((d) => {
    const dt = tokens(d.text);
    let score = 0;
    for (const t of dt) if (counts.has(t)) score += t.length >= 2 ? 2 : 0.5;
    for (const k of d.keywords) if (k.length >= 2 && String(query).includes(k)) score += 8;
    if (d.name === "company_review" && companies().some((name) => String(query).includes(name))) score += 50;
    if (String(query).includes(d.name)) score += 20;
    return { ...d, score };
  }).filter((d) => d.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(limit, docs.length)));
}

export function toolPromptFor(query, limit = 3) {
  const selected = retrieveTools(query, limit);
  if (!selected.length) return "（本轮没有检索到匹配的只读工具；不要编造工具结果，直接回答或说明需要什么信息）";
  return selected.map((d) => "- " + d.tool.name + "：" + d.tool.description + "；参数 " + JSON.stringify(d.tool.inputSchema?.properties || {})).join("\n");
}

export function toolNamesFor(query, limit = 3) {
  return retrieveTools(query, limit).map((d) => d.name);
}

export function allToolDocs() {
  return TOOLS.map(docFor);
}
