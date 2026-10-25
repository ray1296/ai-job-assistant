import { reactive } from "vue";
export interface User {
  id: string;
  email: string;
  role?: "user" | "admin";
  displayName?: string;
}
export const session = reactive<{
  user: User | null;
  csrf: string | null;
  ready: boolean;
}>({ user: null, csrf: null, ready: false });
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const c = new AbortController();
  const abort = () => c.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) c.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 12000);
  try {
    const r = await fetch("/api" + url, {
      method,
      credentials: "same-origin",
      signal: c.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const v = await r.json();
    if (!r.ok) throw new ApiError(v.error || "请求失败", r.status);
    return v;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("网络连接异常或请求超时；当前编辑仍保留，请重试", 0);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export async function loadSession() {
  try {
    Object.assign(session, await api("/auth/session"));
  } finally {
    session.ready = true;
  }
}
export interface Experience {
  title: string;
  period: string;
  detail: string;
}
export interface Profile {
  name: string;
  phone: string;
  email: string;
  summary: string;
  skills: string;
  honors: string;
  notes: string;
  cities: string[];
  directions: string[];
  education: Experience[];
  projects: Experience[];
  experience: Experience[];
}
export const emptyProfile = (): Profile => ({
  name: "",
  phone: "",
  email: "",
  summary: "",
  skills: "",
  honors: "",
  notes: "",
  cities: [],
  directions: [],
  education: [{ title: "", period: "", detail: "" }],
  projects: [{ title: "", period: "", detail: "" }],
  experience: [{ title: "", period: "", detail: "" }],
});
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请重试";
