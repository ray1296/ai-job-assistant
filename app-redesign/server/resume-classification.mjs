import { randomUUID } from "node:crypto";
const fail = (message) => Object.assign(new Error(message), { status: 502 });

/** 去除空白和常见中英文标点，只用于证据比对，不改变展示原文。 */
export function normalizeEvidence(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。；、：:,.!?！？;；·•\-—_/|\\()（）【】\[\]“”"'‘’]/g, "");
}
export function evidenceMatches(source, value) {
  const s = normalizeEvidence(source), v = normalizeEvidence(value);
  if (!v) return true;
  if (s.includes(v)) return true;
  // AI 常把换行、项目符号、空格重排；按分句/项目符号拆开，要求多数片段能落到原文。
  const parts = String(value || "").split(/[\n\r，,。.；;、/|]+/).map(normalizeEvidence).filter((x) => x.length >= 2);
  if (!parts.length) return false;
  const hits = parts.filter((p) => s.includes(p)).length;
  return hits / parts.length >= 0.6;
}
export function assembleDocument(profile, extras = []) {
  const rows = (title, items) => ({ id: randomUUID(), title, items: items.map(x => ({ id: randomUUID(), title: x.title || "", meta: x.period || "", content: x.detail || "" })) });
  return { schemaVersion: 2, header: { name: profile.name, headline: "", contact: [profile.phone, profile.email].filter(Boolean).join(" / "), summary: profile.summary }, sections: [
    ...[["education", "教育经历"], ["projects", "项目经历"], ["experience", "实习与工作经历"]].filter(([k]) => profile[k].length).map(([k,title]) => rows(title, profile[k])),
    ...[["skills", "掌握技能"], ["honors", "荣誉与证书"]].filter(([k]) => profile[k]).map(([k,title]) => rows(title, [{detail: profile[k]}])),
    ...(extras.length ? [rows("其他信息", extras.map(x => ({title:x.title, detail:x.content})))] : []),
  ] };
}
export function validateExtras(rawExtras) {
  if (rawExtras !== undefined && (!Array.isArray(rawExtras) || rawExtras.length > 40)) throw fail("其他信息格式无效或数量过多");
  const extras = (rawExtras || []).map(x => {
    if (typeof x?.title !== "string" || x.title.length > 160 || typeof x.content !== "string" || !x.content.trim() || x.content.length > 8000) throw fail("其他信息格式无效");
    return { title: x.title, content: x.content };
  });
  if (extras.map(x => x.title + x.content).join("\n").length > 16000) throw fail("其他信息过长，请分批导入");
  return extras;
}
export function validateClassification(raw, sourceText, validateProfile) {
  const source = sourceText || raw?.sourceText;
  if (typeof source !== "string" || !source.trim() || source.length > 40000)
    throw fail("AI未返回可核对的原文（可能内容过长或页面不清晰），请重试或换一份清晰 PDF");
  const profile = validateProfile({ ...raw?.profile, notes: "" });
  const extras = validateExtras(raw?.extras);
  const evidence = [];
  const visit = (value, path) => {
    if (typeof value === "string" && value.trim()) {
      if (!evidenceMatches(source, value)) throw fail("AI字段缺少原文证据：" + path);
      evidence.push({path, quote:value, page:null, derived:true});
    } else if (value && typeof value === "object") for (const [key,v] of Object.entries(value)) visit(v, path + "." + key);
  };
  // 照片不是文字事实，不能要求它出现在 sourceText 里；由用户在页面单独确认。
  visit({ ...profile, photos: [] }, "profile");
  extras.forEach((x,i) => visit(x.content, "extras." + i + ".content"));
  profile.notes = extras.map(x => x.title + "：\n" + x.content).join("\n\n");
  return {sourceText:source, profile, extras, evidence};
}
