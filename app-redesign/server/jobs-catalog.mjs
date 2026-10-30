import fs from "node:fs";

const source = new URL("../data/jobs-catalog.json", import.meta.url);

export function safeHttpUrl(raw) {
  const value = String(raw || "").trim();
  if (!/^https?:\/\/[^/?#]/i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? value : "";
  } catch {
    return "";
  }
}

export function cityArray(...values) {
  return [...new Set(values.flatMap((raw) => String(raw || "").split(/[、,，/;；\s]+/)
    .map((city) => city.trim().replace(/[（(][^）)]*[）)]/g, "").replace(/·.*$/, "").replace(/等$/, "").replace(/市$/, "").trim())
    .filter(Boolean)))];
}

function boundedInteger(value, fallback, max) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) return fallback;
  return Math.min(number, max);
}

export function loadCatalog() {
  const catalog = JSON.parse(fs.readFileSync(source, "utf8"));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.jobs)) throw new Error("Invalid jobs catalog");
  const ids = new Set();
  return catalog.jobs.map(({ id, raw: r, url }) => {
    if (!/^[a-f0-9]{24}$/.test(id) || ids.has(id)) throw new Error("Invalid or duplicate catalog ID");
    ids.add(id);
    return {
      id,
      direction: r["方向"], company: r["公司"], companyScale: r["公司规模"],
      platform: r["来源平台"], title: r["岗位名称"], category: r["岗位类别"],
      city: r["城市"], cities: cityArray(r["城市"], r["覆盖城市"]),
      address: r["详细地址"], addressPrecision: r["地址精度"],
      recruitmentType: r["招聘类型"], education: r["学历"], salary: r["薪资"],
      jd: r["岗位职责/JD"], requirements: r["任职要求"], bonus: r["加分项/其他信息"],
      url: safeHttpUrl(url), sourceType: r["数据来源类型"], fetchedAt: r["抓取日期"],
    };
  });
}
const jobs = loadCatalog();
export function listJobs(q = {}, selectedIds = []) {
  let a = jobs;
  const term = String(q.q || "")
    .trim()
    .toLowerCase();
  if (term)
    a = a.filter((j) =>
      [
        j.title,
        j.company,
        j.direction,
        j.category,
        j.city,
        j.jd,
        j.requirements,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  for (const [k, f] of [
    ["direction", "direction"],
    ["city", "cities"],
    ["education", "education"],
    ["recruitmentType", "recruitmentType"],
    ["source", "platform"],
  ])
    if (q[k])
      a = a.filter((j) =>
        f === "cities" ? j.cities.includes(String(q[k])) : j[f] === q[k],
      );
  if (q.intent === "confirmed" || q.intent === "unconfirmed") {
    const selected = new Set(selectedIds);
    a = a.filter((j) => q.intent === "confirmed" ? selected.has(j.id) : !selected.has(j.id));
  }
  const page = boundedInteger(q.page, 1, 1000000),
    size = boundedInteger(q.pageSize, 20, 50);
  return {
    jobs: a.slice((page - 1) * size, page * size),
    total: a.length,
    page,
    pageSize: size,
  };
}
/** 全部岗位（已归一化）：地图「全部岗位」图层按城市抽样时用，避免分页 API 的限制 */
export function allJobs() {
  return jobs;
}
export function getJob(id) {
  return jobs.find((j) => j.id === id) || null;
}
export function facets() {
  return {
    directions: [...new Set(jobs.map((j) => j.direction))].sort(),
    cities: [...new Set(jobs.flatMap((j) => j.cities))].sort(),
    education: [
      ...new Set(jobs.map((j) => j.education).filter(Boolean)),
    ].sort(),
    recruitmentTypes: [...new Set(jobs.map((j) => j.recruitmentType))].sort(),
    sources: [...new Set(jobs.map((j) => j.platform))].sort(),
  };
}
