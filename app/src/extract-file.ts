export type ExtractedFile = { name: string; text: string; chars: number; truncated: boolean; method: string };

export async function extractFile(file: File): Promise<ExtractedFile> {
  if (file.size > 8 * 1024 * 1024) throw new Error(file.name + " 超过 8MB");
  const res = await fetch("/api/ai/extract-text?filename=" + encodeURIComponent(file.name), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-CSRF-Token": (window as any).__zgCsrf || "",
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "文件解析失败");
  return { name: file.name, text: String(data.text || ""), chars: Number(data.chars) || 0, truncated: !!data.truncated, method: String(data.method || "") };
}
