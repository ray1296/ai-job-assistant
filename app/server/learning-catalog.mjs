import fs from "node:fs";
import { createHash } from "node:crypto";
const file = new URL("../data/learning-catalog.json", import.meta.url);
const bytes = fs.readFileSync(file);
const manifest = JSON.parse(
  fs.readFileSync(
    new URL("../data/learning-manifest.json", import.meta.url),
    "utf8",
  ),
);
const catalog = JSON.parse(bytes);
if (
  catalog.schemaVersion !== 1 ||
  !Array.isArray(catalog.questions) ||
  catalog.questions.length !== manifest.rowCount ||
  createHash("sha256").update(bytes).digest("hex") !== manifest.catalogSha256
)
  throw Error("Invalid learning catalog");
const byId = new Map();
const search = new Map();
const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
for (const q of catalog.questions) {
  if (
    !/^[a-f0-9]{24}$/.test(q.id) ||
    byId.has(q.id) ||
    typeof q.question !== "string" ||
    !q.question
  )
    throw Error("Invalid question");
  if (q.sourceUrl) {
    const u = new URL(q.sourceUrl);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw Error("Unsafe catalog URL");
  }
  byId.set(q.id, freeze(q));
  search.set(
    q.id,
    [q.question, q.answer, q.direction, q.category, q.importance, q.source]
      .join(" ")
      .normalize("NFKC")
      .toLowerCase(),
  );
}
export const questionCount = byId.size;
export const getQuestion = (id) => byId.get(id) || null;
const counts = (key) =>
  Object.entries(
    catalog.questions.reduce((a, q) => {
      a[q[key]] = (a[q[key]] || 0) + 1;
      return a;
    }, {}),
  )
    .map(([value, count]) => ({ value, count }))
    .sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"),
    );
const facets = freeze({
  total: questionCount,
  directions: counts("direction"),
  categories: counts("category"),
});
export const questionFacets = () => facets;
const cache = new Map();
const fail = (message) => Object.assign(Error(message), { status: 400 });
export function listQuestions(input = {}, states = new Map()) {
  for (const [key, max] of [
    ["q", 100],
    ["direction", 100],
    ["category", 150],
  ])
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" || input[key].length > max)
    )
      throw fail("筛选条件过长");
  const scope = input.scope || "all";
  if (!["all", "favorites", "review", "mastered"].includes(scope))
    throw fail("学习范围无效");
  const integer = (value, fallback, max) => {
    if (value === undefined || value === "") return fallback;
    if (
      !/^[1-9][0-9]*$/.test(String(value)) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) > max
    )
      throw fail("分页参数无效");
    return Number(value);
  };
  const page = integer(input.page, 1, 1000000),
    pageSize = integer(input.pageSize, 20, 50);
  const q = (input.q || "").trim().normalize("NFKC").toLowerCase(),
    direction = (input.direction || "").trim(),
    category = (input.category || "").trim();
  const key = JSON.stringify([q, direction, category]);
  let ids = cache.get(key);
  if (!ids) {
    const tokens = q.split(/\s+/).filter(Boolean);
    ids = catalog.questions
      .filter(
        (x) =>
          (!direction || x.direction === direction) &&
          (!category || x.category === category) &&
          tokens.every((t) => search.get(x.id).includes(t)),
      )
      .map((x) => x.id);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, ids);
  }
  const visible =
    scope === "all"
      ? ids
      : ids.filter((id) =>
          scope === "favorites"
            ? states.get(id)?.favorite
            : states.get(id)?.status === scope,
        );
  return {
    questions: visible
      .slice((page - 1) * pageSize, page * pageSize)
      .map((id) => {
        const { raw, sourceRecord, ...q } = byId.get(id);
        return q;
      }),
    page,
    pageSize,
    total: visible.length,
    totalPages: Math.ceil(visible.length / pageSize),
  };
}
