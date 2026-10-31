import { readFileSync } from "node:fs";
const file = new URL("../data/ui-inventory.json", import.meta.url);
let cache = null;
/** 站内界面元素清单（按钮/入口级），供 RAG 检索。 */
export function inventorySections() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    cache = raw.map((x) => ({
      id: x.id,
      title: x.text + "（" + x.page + " 页面）",
      summary: x.desc || ("页面「" + x.page + "」里的「" + x.text + "」入口"),
      steps: [],
      keywords: x.text + " " + x.page + " " + (x.desc || ""),
    }));
  } catch { cache = []; }
  return cache;
}
