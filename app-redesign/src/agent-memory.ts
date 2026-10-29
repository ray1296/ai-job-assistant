const PREFIX = "zg.agentMemory.";
export const MEMORY_LIMIT = 2000; // 每个 agent 本地记忆字符上限
export const MEMORY_TTL_DAYS = 14; // 本地记忆保留天数
const MAX_ENTRIES = 40;
const TTL_MS = MEMORY_TTL_DAYS * 24 * 60 * 60 * 1000;
const WARN_AT = 0.8;

export type MemoryEntry = { text: string; ts: number };

function key(name: string) {
  return PREFIX + name;
}

function readRaw(name: string): MemoryEntry[] {
  try {
    const arr = JSON.parse(localStorage.getItem(key(name)) || "[]");
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    const seen = new Set<string>();
    const out: MemoryEntry[] = [];
    for (const item of arr) {
      const text = typeof item === "string" ? item : item?.text;
      const ts = typeof item === "string" ? now : Number(item?.ts) || now;
      const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
      if (!clean || seen.has(clean)) continue;
      if (now - ts > TTL_MS) continue;
      seen.add(clean);
      out.push({ text: clean, ts });
    }
    return out.slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function write(name: string, entries: MemoryEntry[]) {
  try {
    localStorage.setItem(key(name), JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {}
}

export function memoryEntries(name: string): MemoryEntry[] {
  return readRaw(name);
}

/** 序列化后给 AI 的文本（每行一条）。 */
export function memoryText(name: string): string {
  return readRaw(name).map((e) => e.text).join("\n");
}

export function memoryStats(name: string) {
  const entries = readRaw(name);
  const chars = memoryText(name).length;
  const pct = Math.min(1, chars / MEMORY_LIMIT);
  return { chars, pct, count: entries.length, warning: pct >= WARN_AT, limit: MEMORY_LIMIT };
}

/** 只允许 AI 写入稳定信息；太短、空、重复的直接丢弃。 */
export function addMemory(name: string, text: string): boolean {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (clean.length < 4) return false;
  const entries = readRaw(name);
  if (entries.some((e) => e.text === clean)) return false;
  entries.push({ text: clean, ts: Date.now() });
  // 先按条数，再按字符上限删最旧
  let trimmed = entries.slice(-MAX_ENTRIES);
  while (trimmed.length > 1 && trimmed.map((e) => e.text).join("\n").length > MEMORY_LIMIT) {
    trimmed = trimmed.slice(1);
  }
  write(name, trimmed);
  return true;
}

export function clearMemory(name: string) {
  try { localStorage.removeItem(key(name)); } catch {}
}

export function memoryWarningText(name: string) {
  const s = memoryStats(name);
  return "我的长期记忆快满了（" + Math.round(s.pct * 100) + "%），要上传到服务器（保留 30 天）或清空本地记忆吗？";
}
