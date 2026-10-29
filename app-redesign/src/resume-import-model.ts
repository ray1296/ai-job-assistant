/**
 * 确定性简历导入（纯规则，无 AI / 无网络请求）。
 *
 * 限制（Limitations，务必保留）：
 * - 仅当整行去掉装饰、序号、结尾冒号后恰好等于已知标题时才算板块；句中标题不识别。
 * - 只提取带明确标签的姓名，以及邮箱、大陆手机号；不推断城市、岗位、学校、公司、时间。
 * - 所有数字与指标逐字来自原文，绝不生成或补全 GPA、百分比、人数、URL 等。
 * - 板块正文按原文行归组，一个板块一条内容（超长才分段），不拆成虚构条目。
 * - 无板块归属的原文进入“未分类原文”，不丢弃；超过 40000 字会截断并告警。
 * - 个人资料字段按服务端 profileData 上限截断；完整原文仍保留在简历文档中。
 */
import { emptyProfile, type Experience, type Profile } from "./api";
import {
  blankDocument,
  entry,
  uid,
  type ResumeDocument,
  type Section,
} from "./resume-model";

export interface ImportEvidence {
  field: string;
  source: string;
}

export interface ImportProposal {
  profile: Profile;
  document: ResumeDocument;
  evidence: ImportEvidence[];
  warnings: string[];
}

const MAX_SOURCE = 40000;
const MAX_ITEM_CONTENT = 12000; // 服务端单条 content 上限
const MAX_SECTION_TITLE = 160;
const MAX_NAME = 120;
const MAX_PHONE = 64;
const MAX_EMAIL = 254;
const MAX_SUMMARY = 4000;
const MAX_SKILLS = 8000;
const MAX_HONORS = 8000;
const MAX_DETAIL = 8000;
const MAX_ENTRIES = 30;
const MAX_SECTIONS = 24;
const MAX_DOC_BYTES = 110000;

type Group =
  | "education"
  | "projects"
  | "experience"
  | "skills"
  | "honors"
  | "summary";

/** null 表示“识别为板块但只进简历文档，不写入个人资料”。 */
const HEADINGS: Record<string, Group | null> = {
  教育背景: "education",
  教育经历: "education",
  学历背景: "education",
  教育: "education",
  专业技能: "skills",
  技能特长: "skills",
  掌握技能: "skills",
  技术栈: "skills",
  技能: "skills",
  项目经历: "projects",
  项目经验: "projects",
  项目: "projects",
  实习经历: "experience",
  工作经历: "experience",
  实习与工作经历: "experience",
  工作经验: "experience",
  实践经历: "experience",
  校园经历: "experience",
  荣誉证书: "honors",
  荣誉与证书: "honors",
  获奖情况: "honors",
  获奖经历: "honors",
  荣誉: "honors",
  证书: "honors",
  奖项: "honors",
  个人简介: "summary",
  自我介绍: "summary",
  自我评价: "summary",
  个人总结: "summary",
  关于我: "summary",
  求职意向: null,
  求职目标: null,
  意向岗位: null,
  个人信息: null,
  基本信息: null,
  联系方式: null,
  个人资料: null,
};

interface HeadingGroup {
  title: string;
  group: Group | null;
  lines: string[];
}

interface Bucket {
  title: string;
  text: string;
}

function clip(
  value: string,
  max: number,
  label: string,
  warnings: string[],
): string {
  if (value.length <= max) return value;
  warnings.push(
    `${label}超过 ${max} 字，个人资料中只保留前 ${max} 字；完整原文仍保存在简历文档。`,
  );
  return value.slice(0, max);
}

/** 去掉首尾空行，不改变正文内部换行。 */
function trimBlankLines(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end).join("\n");
}

/** 仅在换行处切分，保证每段不超过服务端单条上限，且不丢字符。 */
function splitContent(text: string, max = MAX_ITEM_CONTENT): string[] {
  if (!text) return [""];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max - 1) + 1;
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

/** 整行标题识别：装饰/序号/冒号被忽略，其余字符必须完全匹配。 */
function headingOf(
  line: string,
): { title: string; group: Group | null } | null {
  let text = line.trim();
  if (!text || text.length > 40) return null;
  text = text.replace(/^[\s#>*\-•·【\[]+/, "");
  text = text.replace(
    /^(?:[（(]?[一二三四五六七八九十]{1,3}[)）、.．]|\d{1,2}[、.．)）])\s*/,
    "",
  );
  text = text
    .replace(/[\s*】\]]+$/, "")
    .replace(/[：:]\s*$/, "")
    .trim();
  const key = text.replace(/\s+/g, "");
  if (
    !key ||
    key.length > 24 ||
    !Object.prototype.hasOwnProperty.call(HEADINGS, key)
  )
    return null;
  return { title: text.slice(0, MAX_SECTION_TITLE), group: HEADINGS[key] };
}

function toEntries(
  list: Bucket[],
  field: "education" | "projects" | "experience",
  label: string,
  warnings: string[],
  evidence: ImportEvidence[],
): Experience[] {
  const usable = list.filter((b) => b.text.trim());
  const out = usable.slice(0, MAX_ENTRIES).map((b, i) => {
    evidence.push({ field: `${field}[${i}]`, source: b.title });
    return {
      title: b.title.slice(0, 200),
      period: "",
      detail: clip(b.text, MAX_DETAIL, `${b.title}内容`, warnings),
    };
  });
  if (usable.length > MAX_ENTRIES)
    warnings.push(
      `${label}识别到 ${usable.length} 个板块，个人资料最多保存 ${MAX_ENTRIES} 段，仅保留前 ${MAX_ENTRIES} 段；完整原文仍在简历文档中。`,
    );
  return out;
}

export function proposeImport(text: string): ImportProposal {
  const warnings: string[] = [];
  const evidence: ImportEvidence[] = [];
  const raw = typeof text === "string" ? text : "";
  const normalized = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ");
  let source = normalized;
  if (source.length > MAX_SOURCE) {
    source = source.slice(0, MAX_SOURCE);
    warnings.push(
      `原文超过 ${MAX_SOURCE} 字，本次只导入前 ${MAX_SOURCE} 字，超出部分未包含。`,
    );
  }
  if (!source.trim()) {
    warnings.push("没有可导入的文本内容，已返回空白资料与空白简历。");
    return {
      profile: emptyProfile(),
      document: blankDocument(),
      evidence,
      warnings,
    };
  }

  // 1) 按“整行标题 + 其后原文”归组；标题前的内容留给“未分类原文”。
  const groups: HeadingGroup[] = [];
  const preamble: string[] = [];
  for (const line of source.split("\n")) {
    const heading = headingOf(line);
    if (heading) groups.push({ ...heading, lines: [] });
    else if (groups.length) groups[groups.length - 1].lines.push(line);
    else preamble.push(line);
  }
  const preambleText = trimBlankLines(preamble);
  const hasPreamble = !!preambleText;

  // 2) 个人资料：只做明确联系方式和标题级归组，不推断经历细节。
  const profile = emptyProfile();
  const nameLine = source.match(
    /^[ \t]*(姓\s*名|名\s*字|真实姓名|name)[ \t]*[:：][ \t]*([^\n]{1,40})$/im,
  );
  if (nameLine) {
    let value = nameLine[2].trim();
    value = value.split(/[|｜;；]/)[0].trim();
    value = value.replace(/\s{2,}.*$/, "").trim();
    value = value.replace(
      /\s*(?:电话|手机|邮箱|微信|性别|年龄|出生|籍贯|民族|住址|现居|求职意向).*$/,
      "",
    ).trim();
    if (value && value.length <= MAX_NAME && !/[0-9@:]/.test(value)) {
      profile.name = value;
      evidence.push({
        field: "name",
        source: `${nameLine[1].trim()}：${value}`,
      });
    } else {
      warnings.push("“姓名”标签内容无法确认，姓名已留空，请手动填写。");
    }
  } else {
    warnings.push("未发现“姓名：”等明确标签，姓名未自动填写（不做推测）。");
  }

  const phone = source.match(
    /(?:^|[^0-9])(1[3-9]\d(?:[\s-]?\d{4}){2})(?![0-9])/,
  );
  if (phone) {
    const digits = phone[1].replace(/\D/g, "");
    if (digits.length === 11) {
      profile.phone = digits.slice(0, MAX_PHONE);
      evidence.push({ field: "phone", source: phone[1] });
    }
  }
  if (!profile.phone) warnings.push("未找到大陆手机号，手机号未自动填写。");

  const email = source.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
  );
  if (email) {
    profile.email = email[0].slice(0, MAX_EMAIL);
    evidence.push({ field: "email", source: email[0] });
  } else {
    warnings.push("未找到邮箱地址，邮箱未自动填写。");
  }

  const buckets: Record<Group, Bucket[]> = {
    education: [],
    projects: [],
    experience: [],
    skills: [],
    honors: [],
    summary: [],
  };
  for (const group of groups) {
    if (!group.group) continue;
    buckets[group.group].push({
      title: group.title,
      text: trimBlankLines(group.lines),
    });
  }

  const summaryBuckets = buckets.summary.filter((b) => b.text.trim());
  if (summaryBuckets.length) {
    profile.summary = clip(
      summaryBuckets.map((b) => b.text).join("\n\n"),
      MAX_SUMMARY,
      "个人简介",
      warnings,
    );
    for (const b of summaryBuckets)
      evidence.push({ field: "summary", source: b.title });
  }

  const skillBuckets = buckets.skills.filter((b) => b.text.trim());
  if (skillBuckets.length) {
    profile.skills = clip(
      skillBuckets.map((b) => b.text).join("\n\n"),
      MAX_SKILLS,
      "技能内容",
      warnings,
    );
    for (const b of skillBuckets)
      evidence.push({ field: "skills", source: b.title });
  }

  const honorBuckets = buckets.honors.filter((b) => b.text.trim());
  if (honorBuckets.length) {
    profile.honors = clip(
      honorBuckets.map((b) => b.text).join("\n\n"),
      MAX_HONORS,
      "荣誉内容",
      warnings,
    );
    for (const b of honorBuckets)
      evidence.push({ field: "honors", source: b.title });
  }

  // 无识别结果时保留 emptyProfile 的空白行，避免资料页没有输入位。
  const education = toEntries(
    buckets.education,
    "education",
    "教育",
    warnings,
    evidence,
  );
  if (education.length) profile.education = education;
  const projects = toEntries(
    buckets.projects,
    "projects",
    "项目",
    warnings,
    evidence,
  );
  if (projects.length) profile.projects = projects;
  const experience = toEntries(
    buckets.experience,
    "experience",
    "实习/工作",
    warnings,
    evidence,
  );
  if (experience.length) profile.experience = experience;

  // 3) 简历文档：识别板块置前，未归属原文统一放到末尾，确保原文不丢失。
  let keep = groups.length;
  if (keep + (hasPreamble ? 1 : 0) > MAX_SECTIONS) keep = MAX_SECTIONS - 1;
  const kept = groups.slice(0, keep);
  const overflow = groups.slice(keep);
  if (overflow.length)
    warnings.push(
      `识别到 ${groups.length} 个板块，超过服务端 ${MAX_SECTIONS} 个上限；最后 ${overflow.length} 个板块的标题与原文已并入“未分类原文”。`,
    );

  const sections: Section[] = kept.map((group) => ({
    id: uid(),
    title: group.title,
    items: splitContent(trimBlankLines(group.lines)).map((content) => ({
      ...entry(),
      content,
    })),
  }));

  const rawParts = [
    hasPreamble ? preambleText : "",
    overflow
      .map((group) =>
        [group.title, trimBlankLines(group.lines)].filter(Boolean).join("\n"),
      )
      .join("\n\n"),
  ].filter(Boolean);
  if (rawParts.length) {
    sections.push({
      id: uid(),
      title: "未分类原文",
      items: splitContent(rawParts.join("\n\n")).map((content) => ({
        ...entry(),
        content,
      })),
    });
  }

  const document = blankDocument();
  document.header = {
    name: profile.name,
    headline: "", // 不推断求职方向/城市，避免编造
    contact: [profile.phone, profile.email].filter(Boolean).join(" / "),
    summary: profile.summary,
  };
  document.sections = sections;

  if (!groups.length)
    warnings.push(
      "未识别到标准板块标题，全部原文已按原样放入“未分类原文”板块。",
    );
  else if (hasPreamble)
    warnings.push(
      `第一个板块标题之前有 ${preamble.filter((l) => l.trim()).length} 行内容，已原样放入“未分类原文”板块。`,
    );
  if (groups.some((g) => !g.group && /求职意向|意向岗位|求职目标/.test(g.title)))
    warnings.push(
      "已保留“求职意向”原文，但未自动推断岗位/城市标签，请手动确认个人资料。",
    );

  if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_DOC_BYTES)
    warnings.push(
      "导入后的简历体积较大，可能超过服务端约 110 KB 的保存上限；请精简原文后再保存。",
    );

  return { profile, document, evidence, warnings };
}
