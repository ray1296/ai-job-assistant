// AI 真实调用冒烟测试：确认换到 DeepSeek 官方 + 阿里云后，主要 AI 功能仍然可用。
// 运行: node tests/ai-provider-live.mjs
import assert from "node:assert/strict";

// 自签证书环境：只在本测试内放宽 TLS 校验
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = process.env.TEST_BASE_URL || "https://127.0.0.1:5175";
const email = "qa-ai-" + Date.now() + "@example.invalid";

// 直接用 fetch + cookie 罐，避开浏览器依赖
let cookie = "";
async function call(path, init = {}) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers || {}) },
  });
  const set = res.headers.getSetCookie?.() || [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}
globalThis.fetch = globalThis.fetch;

async function login() {
  const reg = await call("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password: "Qa-Ai-Test-1234" }) });
  assert.ok([200, 201].includes(reg.status), "注册失败 " + reg.status + " " + reg.text.slice(0, 200));
  const sess = await call("/api/auth/session");
  return sess.json.csrf;
}

const t0 = Date.now();
const csrf = await login();
console.log("注册 + 会话 OK (" + (Date.now() - t0) + "ms)");

const h = { "X-CSRF-Token": csrf };

// 1) AI 协作对话
let t = Date.now();
const chat = await call("/api/companion/chat", { method: "POST", headers: h, body: JSON.stringify({ agentId: "zhiwei", message: "用一句话解释什么是哈希表，不要超过40字。" }) });
console.log("companion/chat:", chat.status, (Date.now() - t) + "ms");
const chatText = chat.json ? JSON.stringify(chat.json).slice(0, 200) : chat.text.slice(0, 200);
console.log("  回复片段:", chatText.replace(/\s+/g, " ").slice(0, 160));
assert.ok(chat.status === 200, "聊天接口应返回 200");

// 2) 学习讲题
t = Date.now();
const tutor = await call("/api/study/tutor", { method: "POST", headers: h, body: JSON.stringify({ question: "进程和线程的区别是什么？", subject: "操作系统" }) });
console.log("study/tutor:", tutor.status, (Date.now() - t) + "ms");
assert.ok(tutor.status === 200, "讲题接口应返回 200: " + tutor.text.slice(0, 200));

// 3) 模拟面试：排队/开始
t = Date.now();
const q = await call("/api/interview/queue", { method: "POST", headers: h, body: JSON.stringify({ jobTitle: "后端开发工程师", style: "标准", mode: "text" }) });
console.log("interview/queue:", q.status, (Date.now() - t) + "ms", q.json ? Object.keys(q.json).join(",") : q.text.slice(0, 80));
assert.ok([200, 201].includes(q.status), "面试排队应成功: " + q.text.slice(0, 200));

// 4) 视觉：发一张 1x1 PNG data URL 看多模态通路
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
t = Date.now();
const vis = await call("/api/ai/vision-frames", { method: "POST", headers: h, body: JSON.stringify({ images: [png], question: "只回复两个字：收到" }) });
console.log("ai/vision-frames:", vis.status, (Date.now() - t) + "ms");
assert.ok([200].includes(vis.status), "视觉接口应返回 200: " + vis.text.slice(0, 300));

console.log("PASS ai-provider-live: 对话 / 讲题 / 面试 / 视觉 全部返回 200");
