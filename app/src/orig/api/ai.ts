import { api } from "../../api";

type Msg = { role: string; content?: string; text?: string };

async function chat(message: string, history: Msg[] = [], opts: any = {}) {
  const r = await api<any>("/companion/chat", "POST", {
    message,
    persona: opts.persona || "星野",
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
async function post(path: string, body: any) {
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(window.__zgCsrf ? { "X-CSRF-Token": window.__zgCsrf } : {}) },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "AI 请求失败");
  return { code: 200, data: await res.json() };
}
export const aiRecognize = (text: string) => post("/ai/recognize", { text });
export const aiRecognizeQuestion = (type: string, text: string) => post("/ai/recognize-question", { type, text });
export const aiGenerateQuiz = (items: any[]) => post("/ai/generate-quiz", { items });

export default { aiChat, aiWrongReview, aiRagAsk, aiAgentRun, aiRecognize, aiRecognizeQuestion, aiGenerateQuiz };
