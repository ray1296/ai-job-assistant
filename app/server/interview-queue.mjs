import { randomBytes } from "node:crypto";

/**
 * 模拟面试并发闸门：只限制“同时进行的面试”，不限制普通页面和聊天。
 * 名额在内存里，进程重启后清空；前端会重新排队。
 */
export function createInterviewQueue(max = 3) {
  const limit = Math.max(1, Math.min(10, Number(max) || 3));
  const active = new Map();   // token -> {userId,lastSeen,created}
  const waiting = [];         // token[]
  const byUser = new Map();   // userId -> token
  const TTL = 20 * 60 * 1000;

  function cleanup() {
    const now = Date.now();
    for (const [token, x] of active) {
      if (now - x.lastSeen > TTL) {
        active.delete(token);
        if (byUser.get(x.userId) === token) byUser.delete(x.userId);
      }
    }
    for (let i = waiting.length - 1; i >= 0; i--) {
      const token = waiting[i];
      // 队列项本身没有独立时间，最多等 30 分钟；这里用 token 编码时间。
      if (now - Number(token.slice(0, 13), 36) > 30 * 60 * 1000) waiting.splice(i, 1);
    }
    promote();
  }
  function promote() {
    while (active.size < limit && waiting.length) {
      const token = waiting.shift();
      const userId = tokenMeta.get(token) || "";
      tokenMeta.delete(token);
      active.set(token, { userId, lastSeen: Date.now(), created: Date.now() });
      if (userId) byUser.set(userId, token);
    }
  }
  const tokenMeta = new Map();
  function makeToken() {
    return Date.now().toString(36) + randomBytes(10).toString("hex");
  }
  function snapshot(token) {
    cleanup();
    if (active.has(token)) {
      active.get(token).lastSeen = Date.now();
      return { state: "active", token, position: 0, active: active.size, max: limit, wait: 0 };
    }
    const pos = waiting.indexOf(token);
    if (pos >= 0) {
      const ahead = pos;
      return { state: "queued", token, position: pos + 1, active: active.size, max: limit, wait: Math.max(5, ahead * 35) };
    }
    return { state: "expired", token, position: 0, active: active.size, max: limit, wait: 0 };
  }
  function join(userId) {
    cleanup();
    const uid = String(userId || "");
    const old = byUser.get(uid);
    if (old && active.has(old)) return snapshot(old);
    if (old) {
      const q = waiting.indexOf(old);
      if (q >= 0) return snapshot(old);
    }
    const token = makeToken();
    if (active.size < limit) {
      active.set(token, { userId: uid, lastSeen: Date.now(), created: Date.now() });
      byUser.set(uid, token);
      return snapshot(token);
    }
    waiting.push(token);
    tokenMeta.set(token, uid);
    byUser.set(uid, token);
    return snapshot(token);
  }
  function leave(token) {
    const t = String(token || "");
    active.delete(t);
    const i = waiting.indexOf(t);
    if (i >= 0) waiting.splice(i, 1);
    tokenMeta.delete(t);
    for (const [uid, x] of byUser) if (x === t) byUser.delete(uid);
    promote();
    return { ok: true };
  }
  setInterval(cleanup, 60 * 1000).unref?.();
  return { join, status: snapshot, leave, stats: () => ({ active: active.size, waiting: waiting.length, max: limit }) };
}
