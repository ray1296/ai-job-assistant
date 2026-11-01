import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
const file = path.resolve(process.argv[2] || "/home/ubuntu/workspaces/competition/app-redesign/private/access.jsonl");
if (!existsSync(file)) { console.log("还没有访问日志：", file); process.exit(0); }
const lines = readFileSync(file, "utf8").trim().split("\n").slice(-20000);
const rows = [];
for (const l of lines) { try { rows.push(JSON.parse(l)); } catch {} }
const since = Date.now() - Number(process.argv[3] || 24) * 3600 * 1000;
const recent = rows.filter((r) => r.t >= since);
const top = (key, n = 12) => {
  const m = new Map();
  for (const r of recent) m.set(r[key], (m.get(r[key]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};
console.log("窗口内请求:", recent.length, "| 独立 IP:", new Set(recent.map((r) => r.ip)).size);
console.log("\n访问最多的 IP:");
for (const [ip, n] of top("ip")) console.log("  " + String(ip).padEnd(18), n);
console.log("\n访问最多的路径:");
for (const [p, n] of top("p")) console.log("  " + String(p).padEnd(34), n);
console.log("\n错误状态码:");
const bad = new Map();
for (const r of recent) if (r.s >= 400) bad.set(r.s, (bad.get(r.s) || 0) + 1);
for (const [s, n] of bad) console.log("  " + s, n);
const hours = new Map();
for (const r of recent) { const h = new Date(r.t).toISOString().slice(0, 13); hours.set(h, (hours.get(h) || 0) + 1); }
console.log("\n最近小时分布:");
for (const [h, n] of [...hours.entries()].sort().slice(-12)) console.log("  " + h, n);
