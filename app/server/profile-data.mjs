const failure = (status, message) =>
  Object.assign(new Error(message), { status });
const fields = {
  name: 120,
  phone: 64,
  email: 254,
  summary: 4000,
  skills: 8000,
  honors: 8000,
  notes: 20000,
};
export function string(v, max, label) {
  if (typeof v !== "string" || v.length > max)
    throw failure(400, label + "格式错误或过长");
  return v;
}
export function profileData(p) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw failure(400, "个人信息格式错误");
  const out = {};
  for (const [k, n] of Object.entries(fields))
    out[k] = string(p[k] ?? "", n, k);
  for (const k of ["cities", "directions"]) {
    if (!Array.isArray(p[k]) || p[k].length > 40)
      throw failure(400, "意向标签过多");
    out[k] = [
      ...new Set(
        p[k]
          .map((v) => string(v, 80, k))
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
  }
  for (const k of ["education", "projects", "experience"]) {
    if (!Array.isArray(p[k]) || p[k].length > 30)
      throw failure(400, "经历数量过多");
    out[k] = p[k].map((x) => ({
      title: string(x?.title ?? "", 200, k),
      period: string(x?.period ?? "", 100, k),
      detail: string(x?.detail ?? "", 8000, k),
    }));
  }
  return out;
}
