import fs from "node:fs/promises";
import path from "node:path";
const fail = (status, message) => Object.assign(new Error(message), { status });
const MAX_IN = 50000,
  MAX_OUT = 30000;
function clean(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function configFrom(privateDir) {
  return fs
    .readFile(path.join(privateDir, "ai-config.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
}
function validateSuggestions(data) {
  const a = Array.isArray(data?.suggestions) ? data.suggestions : [];
  if (a.length > 12) throw fail(502, "AI返回建议过多，未采用");
  return a.map((s, i) => {
    if (!s || typeof s !== "object") throw fail(502, "AI返回格式无效");
    const before = clean(s.before, 12000),
      after = clean(s.after, 12000);
    if (!after || after.length > 12000) throw fail(502, "AI返回内容无效");
    return {
      id: clean(s.id, 80) || "suggestion-" + i,
      field: clean(s.field, 160),
      before,
      after,
      reason: clean(s.reason, 800),
      evidence: clean(s.evidence, 800),
    };
  });
}
export function createAiGateway(privateDir) {
  let active = 0,
    queue = [];
  const perUser = new Map();
  async function invoke(userId, input, signal) {
    const cfg = await configFrom(privateDir);
    if (!cfg?.baseUrl || !cfg?.apiKey || !cfg?.model)
      throw fail(503, "AI服务尚未配置；本地识别可用，AI简历建议暂不可用");
    const now = Date.now(),
      bucket = perUser.get(userId) || { start: now, n: 0 };
    if (now - bucket.start > 60000) {
      bucket.start = now;
      bucket.n = 0;
    }
    if (bucket.n >= 3) throw fail(429, "AI建议请求较频繁，请一分钟后重试");
    bucket.n++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const prompt =
        "你是求职简历审阅器。只根据给定文档提出可核对的修改建议，不新增事实，不猜测数字，不暴露思维链。返回严格JSON：{suggestions:[{id,field,before,after,reason,evidence}]}。before必须来自原文；after只做措辞、结构或明确缺失提示的保守改写。" +
        JSON.stringify(input);
      const r = await fetch(
        String(cfg.baseUrl).replace(/\/$/, "") + "/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + cfg.apiKey,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0.1,
            max_tokens: 4000,
            messages: [
              {
                role: "system",
                content: "只输出JSON，不输出markdown，不写思维过程。",
              },
              { role: "user", content: prompt },
            ],
          }),
        },
      );
      if (!r.ok)
        throw fail(
          r.status === 429 ? 429 : 502,
          "AI上游暂时不可用，请稍后重试",
        );
      const raw = await r.json();
      let text = raw?.choices?.[0]?.message?.content || "";
      text = text.replace(/^\s*\?json\s*/i, "").replace(/\s*\s*$/, "");
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw fail(502, "AI返回不是可审核的结构化建议");
      }
      return {
        suggestions: validateSuggestions(data),
        provider: cfg.provider || "compatible",
        model: cfg.model,
      };
    } catch (e) {
      if (e.name === "AbortError")
        throw fail(504, "AI建议超时，当前文档未改变");
      throw e.status ? e : fail(502, "AI建议服务暂时不可用");
    } finally {
      clearTimeout(timer);
    }
  }
  function pump() {
    while (active < 1 && queue.length) {
      const job = queue.shift();
      active++;
      invoke(job.userId, job.input, job.signal)
        .then(job.resolve, job.reject)
        .finally(() => {
          active--;
          pump();
        });
    }
  }
  function review(userId, input, signal) {
    if (!input || typeof input !== "object") throw fail(400, "AI输入格式无效");
    const serialized = JSON.stringify(input);
    if (serialized.length > MAX_IN) throw fail(413, "简历内容过大，请先精简");
    if (queue.length >= 2) throw fail(429, "AI建议队列已满，请稍后重试");
    return new Promise((resolve, reject) => {
      queue.push({ userId, input, signal, resolve, reject });
      pump();
    });
  }
  return {
    review,
    status: () => ({
      configured: false,
      active,
      queued: queue.length,
      maxActive: 1,
      maxQueue: 2,
    }),
  };
}
