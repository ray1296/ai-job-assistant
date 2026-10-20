const fail = (message) => Object.assign(new Error(message), { status: 400 });
function text(v, max, label) {
  if (typeof v !== "string" || v.length > max)
    throw fail(label + "格式错误或过长");
  return v;
}
function id(v) {
  if (typeof v !== "string" || !/^[-a-zA-Z0-9_]{1,80}$/.test(v))
    throw fail("简历板块标识无效");
  return v;
}
export function validateDocument(v) {
  if (
    !v ||
    v.schemaVersion !== 2 ||
    !v.header ||
    typeof v.header !== "object" ||
    Array.isArray(v.header) ||
    !Array.isArray(v.sections) ||
    v.sections.length > 24
  )
    throw fail("简历文档结构无效");
  const header = {};
  for (const [k, n] of Object.entries({
    name: 120,
    headline: 400,
    contact: 600,
    summary: 8000,
  }))
    header[k] = text(v.header[k] ?? "", n, k);
  const seen = new Set();
  const unique = (v) => {
    const x = id(v);
    if (seen.has(x)) throw fail("简历板块标识重复");
    seen.add(x);
    return x;
  };
  const sections = v.sections.map((s) => {
    if (!s || !Array.isArray(s.items) || s.items.length > 40)
      throw fail("简历条目数量过多");
    return {
      id: unique(s.id),
      title: text(s.title, 160, "板块名称"),
      items: s.items.map((i) => {
        if (!i || typeof i !== "object") throw fail("简历条目格式无效");
        return {
          id: unique(i.id),
          title: text(i.title ?? "", 240, "条目名称"),
          meta: text(i.meta ?? "", 200, "时间信息"),
          content: text(i.content ?? "", 12000, "条目内容"),
        };
      }),
    };
  });
  const layout = {
    template: ["classic", "compact"].includes(v.layout?.template)
      ? v.layout.template
      : "classic",
    fontSize: [13, 14, 15, 16].includes(v.layout?.fontSize)
      ? v.layout.fontSize
      : 14,
    accent: ["purple", "navy", "charcoal"].includes(v.layout?.accent)
      ? v.layout.accent
      : "purple",
  };
  return { schemaVersion: 2, header, sections, layout };
}
export function documentText(d) {
  return [
    d.header.name,
    d.header.headline,
    d.header.contact,
    d.header.summary,
    ...d.sections.flatMap((s) => [
      s.title,
      ...s.items.flatMap((i) => [i.title, i.meta, i.content]),
    ]),
  ]
    .filter(Boolean)
    .join("\n\n");
}
