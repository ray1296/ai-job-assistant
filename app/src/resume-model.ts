import type { Profile } from "./api";
export interface Entry {
  id: string;
  title: string;
  meta: string;
  content: string;
}
export interface Section {
  id: string;
  title: string;
  items: Entry[];
}
export interface Decoration {
  image: string;
  style: "minimal" | "tech" | "warm";
}
export interface ResumeDocument {
  schemaVersion: 2;
  header: { name: string; headline: string; contact: string; summary: string; photos?: string[] };
  sections: Section[];
  /** 板块 id 列表：这些板块前换页（多页/无限页数）。乱序与失效 id 会被忽略。 */
  pageBreaks?: string[];
  /** 生图装饰：服务端存图，文档内只保留引用；null 表示未启用。 */
  decoration?: { image: string; style: "minimal" | "tech" | "warm" } | null;
  /** 页脚装饰；与页眉装饰独立，一张简历通常 2 张 */
  decorationFooter?: { image: string; style: "minimal" | "tech" | "warm" } | null;
  /** AI 自由生成的装饰组，最多15张；旧字段仍兼容 */
  decorations?: Decoration[];
  layout: {
    template: "classic" | "compact";
    fontSize: number;
    accent: "purple" | "navy" | "charcoal";
  };
}
export interface Resume {
  id: string;
  title: string;
  body: { text: string; document?: ResumeDocument };
  revision: number;
  updated_at: number;
}
export const uid = () =>
  crypto.randomUUID?.().replaceAll("-", "") ||
  "s" + Date.now().toString(36) + Math.random().toString(36).slice(2);
export const entry = (): Entry => ({
  id: uid(),
  title: "",
  meta: "",
  content: "",
});
export const blankDocument = (): ResumeDocument => ({
  schemaVersion: 2,
  header: { name: "", headline: "", contact: "", summary: "", photos: [] },
  sections: [
    "教育经历",
    "掌握技能",
    "项目经历",
    "实习与工作经历",
    "荣誉与证书",
  ].map((title) => ({ id: uid(), title, items: [entry()] })),
  pageBreaks: [],
  decoration: null,
  decorationFooter: null,
  decorations: [],
  layout: { template: "classic", fontSize: 14, accent: "purple" },
});
export function fromLegacy(text: string): ResumeDocument {
  const d = blankDocument();
  if (text) {
    d.sections = [
      {
        id: uid(),
        title: "原有简历内容",
        items: [{ ...entry(), content: text }],
      },
    ];
  }
  return d;
}
export function fromProfile(p: Profile): ResumeDocument {
  const d = blankDocument();
  d.header = {
    name: p.name,
    headline: [p.directions.join("、"), p.cities.join("、")]
      .filter(Boolean)
      .join(" · "),
    contact: [p.phone, p.email].filter(Boolean).join(" / "),
    summary: p.summary,
    photos: Array.isArray(p.photos) ? p.photos.slice(0, 3) : [],
  };
  const sections: Section[] = [];
  for (const [key, title] of [
    ["education", "教育经历"],
    ["projects", "项目经历"],
    ["experience", "实习与工作经历"],
  ] as const) {
    const rows = p[key].filter((x) => x.title || x.detail || x.period);
    sections.push({
      id: uid(),
      title,
      items: rows.length
        ? rows.map((x) => ({
            id: uid(),
            title: x.title,
            meta: x.period,
            content: x.detail,
          }))
        : [entry()],
    });
  }
  sections.splice(1, 0, {
    id: uid(),
    title: "掌握技能",
    items: [{ ...entry(), content: p.skills }],
  });
  sections.push({
    id: uid(),
    title: "荣誉与证书",
    items: [{ ...entry(), content: p.honors }],
  });
  d.sections = sections;
  return d;
}
export function plainText(d: ResumeDocument) {
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
export const clone = (d: ResumeDocument): ResumeDocument =>
  JSON.parse(JSON.stringify(d));

/** AI 只处理文字/结构，不把照片 data URL 发给模型。 */
export const withoutPhotos = (d: ResumeDocument): ResumeDocument => ({
  ...d,
  header: { ...d.header, photos: [] },
});
