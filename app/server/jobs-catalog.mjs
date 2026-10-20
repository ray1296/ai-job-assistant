import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = "/home/ubuntu/linux/dsh-home/attachments/v1/files";
const source = path.join(
  root,
  "87/87e81c7db17ff06c5b94bb7681e8c78eea7c87b0ec1e995b8645e487502d925c/互联网校招实习岗位_6方向_官网为主_终版.csv",
);
function csv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quote = false;
      else cell += c;
    } else if (c === '"') quote = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const h = rows.shift();
  return rows
    .filter((r) => r.some(Boolean))
    .map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] || ""])));
}
function cityArray(raw) {
  return [
    ...new Set(
      String(raw)
        .split(/[、,，/]/)
        .map((x) =>
          x
            .trim()
            .replace(/市（[^）]+）$/, "市")
            .replace(/市$/, "")
            .replace(/·.*$/, "")
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
}
export function loadCatalog() {
  const rows = csv(fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""));
  return rows.map((r, i) => ({
    id: crypto
      .createHash("sha256")
      .update(
        (r["职位链接"] || r["来源平台"] + "|" + r["职位ID"] || "") +
          "|" +
          r["公司"] +
          "|" +
          r["岗位名称"] +
          "|" +
          i,
      )
      .digest("hex")
      .slice(0, 24),
    direction: r["方向"],
    company: r["公司"],
    companyScale: r["公司规模"],
    platform: r["来源平台"],
    title: r["岗位名称"],
    category: r["岗位类别"],
    city: r["城市"],
    cities: cityArray(r["城市"] + " " + r["覆盖城市"]),
    address: r["详细地址"],
    addressPrecision: r["地址精度"],
    recruitmentType: r["招聘类型"],
    education: r["学历"],
    salary: r["薪资"],
    jd: r["岗位职责/JD"],
    requirements: r["任职要求"],
    bonus: r["加分项/其他信息"],
    url: r["职位链接"],
    sourceType: r["数据来源类型"],
    fetchedAt: r["抓取日期"],
  }));
}
const jobs = loadCatalog();
export function listJobs(q = {}) {
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
  const page = Math.max(1, Number(q.page) || 1),
    size = Math.min(50, Math.max(1, Number(q.pageSize) || 20));
  return {
    jobs: a.slice((page - 1) * size, page * size),
    total: a.length,
    page,
    pageSize: size,
  };
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
