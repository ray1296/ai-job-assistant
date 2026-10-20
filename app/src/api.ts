import { reactive } from "vue";
export interface User {
  id: string;
  email: string;
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
): Promise<T> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 12000);
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
  cities: [],
  directions: [],
  education: [{ title: "", period: "", detail: "" }],
  projects: [{ title: "", period: "", detail: "" }],
  experience: [{ title: "", period: "", detail: "" }],
});
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败，请重试";
