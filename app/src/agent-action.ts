export type PendingAction = { token: string; tool: string; summary: string; args?: any };

/** 浏览器原生确认，确认后才调用服务端一次性 token。 */
export async function confirmPendingAction(action: PendingAction): Promise<{ ok: boolean; cancelled?: boolean; result?: any; error?: string }> {
  if (!action?.token) return { ok: false, error: "缺少确认凭证" };
  const yes = window.confirm("Agent 请求写入数据：\n\n" + (action.summary || action.tool) + "\n\n确认执行？");
  try {
    const r = await fetch("/api/agents/actions/" + encodeURIComponent(action.token) + "/" + (yes ? "confirm" : "cancel"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRF-Token": (window as any).__zgCsrf || "" },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: data.error || "操作失败" };
    return { ok: true, cancelled: !yes, result: data };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "操作失败" };
  }
}
