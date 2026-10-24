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

export const aiStudySummary = (subjectName: string, questions: any[]) => chat("请用 150 字总结「" + subjectName + "」的重点：" + JSON.stringify(questions).slice(0, 1500));
export const aiWrongSteps = (subjectName: string, wrongQuestions: any[]) => chat("请分步讲解这些错题（" + subjectName + "）：" + JSON.stringify(wrongQuestions).slice(0, 1500));
export const aiShortMemo = (subjectName: string, items: any[]) => chat("请为「" + subjectName + "」编 5 条记忆口诀：" + JSON.stringify(items).slice(0, 1200));
export const aiSubjectLink = (subjects: any[]) => chat("这些科目之间有什么关联？" + JSON.stringify(subjects).slice(0, 800));
export const aiGeneratePage = async (subjectName: string, questions: any[], wrongQuestions: any[]) => {
  const r = await chat("请为「" + subjectName + "」写一份 HTML 复习报告（只要正文片段）。题目：" + JSON.stringify(questions).slice(0, 1200));
  return { code: 200, data: { html: "<div>" + String((r as any).data?.reply || "") + "</div>" } };
};
export const aiPageSave = () => Promise.resolve({ code: 200, data: { ok: true } });
export default { aiChat, aiWrongReview, aiRagAsk, aiAgentRun, aiRecognize, aiRecognizeQuestion, aiGenerateQuiz };
