export type ExtractedFile = { name: string; text: string; chars: number; truncated: boolean; method: string };

export async function extractFile(file: File): Promise<ExtractedFile> {
  if (file.size > 8 * 1024 * 1024) throw new Error(file.name + " 超过 8MB");
  const send = () => fetch("/api/ai/extract-text?filename=" + encodeURIComponent(file.name), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-CSRF-Token": (window as any).__zgCsrf || "",
    },
    body: file,
  });
  let res = await send();
  // 页面长时间未刷新或服务重启后，window.__zgCsrf 可能是旧值；刷新会话 token 后重试一次。
  if (res.status === 403) {
    try {
      const sessionRes = await fetch("/api/auth/session", { credentials: "same-origin" });
      const session = await sessionRes.json().catch(() => ({}));
      if (session?.csrf) {
        (window as any).__zgCsrf = session.csrf;
        res = await send();
      }
    } catch { /* 保留原始 403 错误 */ }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "文件解析失败");
  return { name: file.name, text: String(data.text || ""), chars: Number(data.chars) || 0, truncated: !!data.truncated, method: String(data.method || "") };
}
