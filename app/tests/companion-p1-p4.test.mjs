import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { callTool, TOOLS } from "../server/tools.mjs";
import { createAgents } from "../server/agents.mjs";

let n = 0;
const ok = (name) => { n++; console.log("PASS", name); };

// 1) 工具白名单 + 危险工具强制拦截（P3）
assert.throws(() => callTool("delete_all_users", {}), (e) => e.code === "BLOCKED_TOOL");
assert.throws(() => callTool("drop_table", {}), (e) => e.code === "BLOCKED_TOOL");
assert.throws(() => callTool("overwrite_resume", {}), (e) => e.code === "BLOCKED_TOOL");
assert.throws(() => callTool("search_jobs", { overwrite: true }), (e) => e.code === "BLOCKED_TOOL");
const unknown = callTool("unknown_tool", {});
assert.match(unknown.error, /未知工具/);
assert.throws(() => callTool("my_progress", { userId: "someone-else" }), (e) => e.code === "BLOCKED_TOOL");
assert.throws(() => callTool("my_progress", { user_id: "someone-else" }), (e) => e.code === "BLOCKED_TOOL");
assert.match(callTool("company_review", { name: "" }).error, /企业名称/);
ok("dangerous tools and cross-user identity args are rejected; empty company name is refused");

// 2) 正常工具仍可用（search_jobs 之前把对象当数组，已修复）
const jobs = callTool("search_jobs", { keyword: "前端", city: "深圳" });
assert.ok(Array.isArray(jobs.items) && jobs.items.length > 0);
assert.ok(jobs.items.every((j) => j.title && j.company));
ok("search_jobs returns real job rows");

// 3) 四个 agent 都有板块 prompt（P3）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zg-agents-"));
const agents = createAgents(tmp);
const list = agents.list();
assert.equal(list.length, 4);
for (const a of list) {
  assert.ok(typeof a.prompt === "string" && a.prompt.length > 20, a.id + " prompt");
  assert.match(a.prompt, /不得|不能|只|先/, a.id + " prompt has behavior rules");
}
ok("four agents have role prompts");
const zhiwei = agents.list().find((a) => a.id === "zhiwei");
assert.match(zhiwei.prompt, /学习/);
const yanzhou = agents.list().find((a) => a.id === "yanzhou");
assert.match(yanzhou.prompt, /求职|简历/);
const qichi = agents.list().find((a) => a.id === "qichi");
assert.match(qichi.prompt, /租房|生活/);
ok("prompts are mapped to the right boards");

// 4) 工具 schema 不会泄露写操作能力
assert.ok(TOOLS.every((t) => !/delete|drop|overwrite/i.test(t.name)));
ok("no destructive tool is exposed");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("ALL", n, "CHECKS PASSED");
