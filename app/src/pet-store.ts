import { reactive } from "vue";

/**
 * 四只看板娘的屏幕坐标（chip 与它自己的对话框共用同一份数据）。
 * 旧版本把位置写在 zg.agents.v2 里，这里保持兼容并继续用它。
 */
const STORE = "zg.agents.v2";
export const AGENT_IDS = ["xingye", "zhiwei", "yanzhou", "qichi"] as const;
type AgentId = (typeof AGENT_IDS)[number];

function read(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
}
function write(v: any) {
  try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {}
}

export function defaultPos(id: string): { x: number; y: number } {
  if (id === "xingye") return { x: 24, y: Math.max(90, window.innerHeight - 190) };
  const slot = id === "zhiwei" ? 1 : id === "yanzhou" ? 2 : 3;
  return {
    x: Math.max(8, window.innerWidth - 320 + slot * 62),
    y: Math.max(90, window.innerHeight - 210),
  };
}

const saved = read();
export const petPositions = reactive<Record<string, { x: number; y: number }>>({});
for (const id of AGENT_IDS) {
  const p = saved?.[id]?.pos;
  petPositions[id] = p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? { x: p.x, y: p.y }
    : defaultPos(id);
}

export function setPetPos(id: string, pos: { x: number; y: number }) {
  petPositions[id] = { x: pos.x, y: pos.y };
  const all = read();
  all[id] = { ...(all[id] || {}), pos: { x: pos.x, y: pos.y } };
  write(all);
}

export function resetPetPositions() {
  write({});
  for (const id of AGENT_IDS) petPositions[id] = defaultPos(id);
}
