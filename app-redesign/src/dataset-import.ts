export type DatasetCategory = "jobs" | "companies" | "housing" | "knowledge";

export function isDatasetDataFile(name: string) {
  return /\.(csv|xlsx|xls|json|xml|txt)$/i.test(String(name || ""));
}

export function detectDatasetCategory(text: string, fileName = ""): DatasetCategory | null {
  const s = String(text || "") + " " + String(fileName || "");
  if (/岗位|职位|招聘|求职|job/i.test(s)) return "jobs";
  if (/企业|公司|工商|风评|company/i.test(s)) return "companies";
  if (/租房|房源|租金|housing|rent/i.test(s)) return "housing";
  if (/知识|题库|问答|八股|knowledge/i.test(s)) return "knowledge";
  return null;
}

export function wantsDatasetImport(text: string) {
  const s = String(text || "");
  const action = /(导入|录入|上传|保存|添加|放到|存到|写入|同步)/.test(s);
  const target = /(数据|岗位|职位|企业|公司|租房|房源|知识|题库|数据空间)/.test(s);
  return (action && target) || /(数据空间|我的数据)/.test(s);
}

export async function importDataset(file: File, category: DatasetCategory) {
  if (!file) throw new Error("没有可导入的文件");
  if (file.size > 8 * 1024 * 1024) throw new Error("文件需小于 8MiB");
  const send = () => fetch("/api/datasets", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Category": category,
      "X-CSRF-Token": (window as any).__zgCsrf || "",
    },
    body: file,
  });
  let res = await send();
  if (res.status === 403) {
    try {
      const s = await fetch("/api/auth/session", { credentials: "same-origin" });
      const j = await s.json().catch(() => ({}));
      if (j?.csrf) {
        (window as any).__zgCsrf = j.csrf;
        res = await send();
      }
    } catch { /* keep original error */ }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "数据导入失败");
  return data.dataset as { id: string; rowCount: number; category: DatasetCategory; mappedBy?: string; columns?: string[]; mapping?: Record<string, string>; deduped?: number; replaced?: number };
}
