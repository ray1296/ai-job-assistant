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
export default { aiChat, aiWrongReview, aiRagAsk, aiAgentRun };
