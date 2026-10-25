import { api } from "../../api";

type Msg = { role: string; content?: string; text?: string };

async function chat(message: string, history: Msg[] = [], opts: any = {}) {
  const r = await api<any>("/companion/chat", "POST", {
    message,
    persona: opts.persona || (window as any).__zgPersona || "星野",
    page: location.hash.replace(/^#/, ""),
    history: history.slice(-6).map((m) => ({ role: m.role === "user" ? "me" : "ai", text: m.content || m.text || "" })),
  }, { timeoutMs: 150000 });
  return { data: { reply: r.reply || "", handoff: r.handoff || null } };
}

export const aiChat = (message: string, history: Msg[] = []) => chat(message, history);
export const aiWrongReview = (subjectName: string, wrongQuestions: any[]) =>
  chat("请帮我复盘这些错题：\n" + JSON.stringify(wrongQuestions).slice(0, 2000));
export const aiRagAsk = (query: string) => chat(query);
export const aiAgentRun = (message: string) => chat(message);
async function call<T = any>(method: string, path: string, body?: any): Promise<{ code: number; data: T }> {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(window.__zgCsrf ? { "X-CSRF-Token": window.__zgCsrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.error || "AI 请求失败");
  return { code: 200, data: json as T };
}
const post = (path: string, body: any) => call("POST", path, body);

export const aiRecognize = (text: string) => post("/ai/recognize", { text });
export const aiRecognizeQuestion = (type: string, text: string) => post("/ai/recognize-question", { type, text });
export const aiGenerateQuiz = (items: any[]) => post("/ai/generate-quiz", { items });

// 学习工具箱：走服务端独立的提示词与校验，不再借道聊天
export const aiStudySummary = (subjectName: string, questions: any[]) =>
  post("/ai/study-summary", { subjectName, questions });
export const aiWrongSteps = (subjectName: string, wrongQuestions: any[]) =>
  post("/ai/wrong-steps", { subjectName, wrongQuestions });
export const aiShortMemo = (subjectName: string, items: any[]) =>
  post("/ai/short-memo", { subjectName, items });
export const aiSubjectLink = (subjects: any[]) => post("/ai/subject-link", { subjects });
export const aiGeneratePage = (subjectName: string, questions: any[], wrongQuestions: any[]) =>
  post("/ai/generate-page", { subjectName, questions, wrongQuestions });

export const aiPageSave = (data: any) => post("/ai/pages", data);
export const aiPageList = () => call<any[]>("GET", "/ai/pages");
export const aiPageDetail = (id: string) => call<any>("GET", "/ai/pages/" + encodeURIComponent(id));
export const aiPageDelete = (id: string) => call<any>("DELETE", "/ai/pages/" + encodeURIComponent(id));

export default { aiChat, aiWrongReview, aiRagAsk, aiAgentRun, aiRecognize, aiRecognizeQuestion, aiGenerateQuiz };
