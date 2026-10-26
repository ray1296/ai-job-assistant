const failure = (status, message) =>
  Object.assign(new Error(message), { status });
export function photoList(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 3)
    throw failure(400, "个人照片最多3张");
  let total = 0;
  return v.map((x, i) => {
    if (
      typeof x !== "string" ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(x) ||
      x.length > 1_100_000
    )
      throw failure(400, "第" + (i + 1) + "张照片格式无效或过大");
    total += x.length;
    return x;
  }).map((x) => {
    if (total > 3_300_000) throw failure(400, "照片总大小过大，请压缩后重试");
    return x;
  });
}
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
  out.photos = photoList(p.photos);
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
