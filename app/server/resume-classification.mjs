import { randomUUID } from "node:crypto";
const fail = (message) => Object.assign(new Error(message), { status: 502 });
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
  if (typeof source !== "string" || !source.trim() || source.length > 40000) throw fail("AI原文识别无效");
  const profile = validateProfile({ ...raw?.profile, notes: "" });
  const extras = validateExtras(raw?.extras);
  const evidence = [];
  const visit = (value, path) => {
    if (typeof value === "string" && value.trim()) {
      if (!source.includes(value)) throw fail("AI字段缺少原文证据：" + path);
      evidence.push({path, quote:value, page:null, derived:true});
    } else if (value && typeof value === "object") for (const [key,v] of Object.entries(value)) visit(v, path + "." + key);
  };
  visit(profile, "profile");
  extras.forEach((x,i) => visit(x.content, "extras." + i + ".content"));
  profile.notes = extras.map(x => x.title + "：\n" + x.content).join("\n\n");
  return {sourceText:source, profile, extras, evidence};
}
