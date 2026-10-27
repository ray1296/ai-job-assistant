import { defineComponent, h, ref, computed, onMounted, nextTick, watch } from "vue";
import { api, errorText } from "./api";
import { addMemory } from "./agent-memory";
import { extractFile } from "./extract-file";
import { confirmPendingAction } from "./agent-action";

const AGENTS = [
  { id: "xingye", name: "星野", role: "主理人", tag: "方向 / 规划", avatar: "/assets/companions/b-1.png" },
  { id: "zhiwei", name: "知微", role: "学习助教", tag: "学习 / 错题", avatar: "/assets/companions/b-3.png" },
  { id: "yanzhou", name: "砚舟", role: "求职顾问", tag: "岗位 / 简历", avatar: "/assets/companions/a-2.png" },
  { id: "qichi", name: "栖迟", role: "生活管家", tag: "租房 / 通勤", avatar: "/assets/companions/a-1.jpg" },
];
type Attachment = { id: string; name: string; kind: "image" | "text" | "file"; data?: string; text?: string; size: number };
type ChatSession = { id: string; agentId: string; title: string; messages: Msg[]; updatedAt: number };
type Msg = {
  role: "user" | "assistant" | "system";
  text: string;
  images?: string[];
  files?: string[];
  meta?: { tools?: string[]; plan?: any[]; delegation?: any };
};
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const TEXT_EXT = ["txt", "md", "markdown", "csv", "json", "log", "html", "htm", "css", "js", "ts", "yml", "yaml", "xml"];
const IMAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_MAX = 3;

export default defineComponent({
  setup() {
    const agentId = ref("xingye");
    const messages = ref<Msg[]>([]);
    const sessions = ref<ChatSession[]>([]);
    const activeSession = ref("");
    const SESSION_KEY = "zg.chatSessions.v1";
    const input = ref("");
    const attachments = ref<Attachment[]>([]);
    const busy = ref(false);
    const loading = ref(false);
    const error = ref("");
    const notice = ref("");
    const listRef = ref<HTMLElement | null>(null);
    const fileInput = ref<HTMLInputElement | null>(null);
    const agent = computed(() => AGENTS.find((a) => a.id === agentId.value) || AGENTS[0]);
    const canSend = computed(() => !!input.value.trim() || attachments.value.length > 0);
    const agentSessions = computed(() => sessions.value.filter((s) => s.agentId === agentId.value).sort((a, b) => b.updatedAt - a.updatedAt));
    const activeByAgent = ref<Record<string, string>>({});
    function saveSessions() {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ sessions: sessions.value.slice(0, 80), active: activeByAgent.value }));
      } catch {}
    }
    function persistSession() {
      if (!activeSession.value) return;
      const s = sessions.value.find((x) => x.id === activeSession.value);
      if (!s) return;
      s.messages = messages.value.slice(-80);
      const first = s.messages.find((m) => m.role === "user");
      s.title = first ? String(first.text || "").replace(/\s+/g, " ").slice(0, 26) : "新对话";
      s.updatedAt = Date.now();
      activeByAgent.value[agentId.value] = s.id;
      saveSessions();
    }
    function createSession(forAgent = agentId.value, initial: Msg[] = []) {
      const s: ChatSession = { id: uid(), agentId: forAgent, title: "新对话", messages: initial, updatedAt: Date.now() };
      sessions.value.unshift(s);
      activeSession.value = s.id;
      activeByAgent.value[forAgent] = s.id;
      saveSessions();
      return s;
    }
    function selectSession(id: string) {
      if (id === activeSession.value) return;
      persistSession();
      const s = sessions.value.find((x) => x.id === id);
      if (!s) return;
      activeSession.value = id;
      activeByAgent.value[agentId.value] = id;
      messages.value = s.messages.slice();
      saveSessions();
      scrollBottom();
    }
    function newChat() {
      if (busy.value) return;
      persistSession();
      createSession(agentId.value);
      messages.value = [];
      input.value = "";
      attachments.value = [];
      notice.value = "已新建对话。";
    }
    function deleteChat(id: string) {
      if (busy.value) return;
      const s = sessions.value.find((x) => x.id === id);
      if (!s || !confirm("删除对话「" + (s.title || "新对话") + "」？")) return;
      const wasActive = activeSession.value === id;
      sessions.value = sessions.value.filter((x) => x.id !== id);
      if (wasActive) {
        const next = sessions.value.filter((x) => x.agentId === agentId.value).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        activeSession.value = next?.id || "";
        messages.value = next ? next.messages.slice() : [];
        if (!next) createSession(agentId.value);
      }
      saveSessions();
    }

    function scrollBottom() {
      void nextTick(() => {
        const el = listRef.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    function removeAttachment(id: string) {
      attachments.value = attachments.value.filter((a) => a.id !== id);
    }
    function loadSessionStore() {
      try {
        const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        if (raw && Array.isArray(raw.sessions)) sessions.value = raw.sessions;
        if (raw && raw.active && typeof raw.active === "object") activeByAgent.value = raw.active;
      } catch {}
    }
    async function loadHistory() {
      loading.value = true;
      error.value = "";
      const local = sessions.value.filter((s) => s.agentId === agentId.value).sort((a, b) => b.updatedAt - a.updatedAt);
      if (local.length) {
        const wanted = local.find((s) => s.id === activeByAgent.value[agentId.value]) || local[0];
        activeSession.value = wanted.id;
        messages.value = wanted.messages.slice();
        loading.value = false;
        scrollBottom();
        return;
      }
      try {
        const r = await api<any>("/companion/history?agent=" + encodeURIComponent(agentId.value), "GET", undefined, { timeoutMs: 15000 });
        const initial: Msg[] = (Array.isArray(r.messages) ? r.messages : []).map((m: any) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: String(m.text || ""),
        }));
        createSession(agentId.value, initial);
        activeSession.value = sessions.value[0].id;
        messages.value = initial;
        scrollBottom();
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }
    async function switchAgent(id: string) {
      if (id === agentId.value || busy.value) return;
      persistSession();
      agentId.value = id;
      input.value = "";
      attachments.value = [];
      await loadHistory();
    }
    async function pickFiles(files: FileList | null) {
      if (!files) return;
      const next: Attachment[] = [];
      let imageCount = attachments.value.filter((a) => a.kind === "image").length;
      for (const file of Array.from(files).slice(0, 6)) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (file.type.startsWith("image/")) {
          if (imageCount >= IMAGE_MAX) { error.value = "每次最多 3 张图片"; continue; }
          if (file.size > IMAGE_LIMIT) { error.value = file.name + " 超过 2MB，已跳过"; continue; }
          imageCount++;
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("读取失败"));
            reader.readAsDataURL(file);
          }).catch(() => "");
          if (data) next.push({ id: uid(), name: file.name, kind: "image", data, size: file.size });
        } else if (TEXT_EXT.includes(ext) || file.type.startsWith("text/")) {
          if (file.size > 1024 * 1024) { error.value = file.name + " 超过 1MB，已跳过"; continue; }
          const text = await file.text().catch(() => "");
          next.push({ id: uid(), name: file.name, kind: "text", text: text.slice(0, 8000), size: file.size });
        } else if (["pdf", "docx", "xlsx", "pptx"].includes(ext)) {
          notice.value = "正在解析 " + file.name + "…";
          try {
            const d = await extractFile(file);
            next.push({ id: uid(), name: file.name, kind: "file", text: d.text.slice(0, 12000), size: file.size });
            notice.value = d.truncated ? file.name + " 较长，已截取前 12000 字作为上下文" : "";
          } catch (e) { error.value = file.name + "：" + (e as Error).message; }
        } else {
          error.value = file.name + " 暂不支持；可上传图片、文本、PDF、DOCX、XLSX、PPTX";
        }
      }
      attachments.value = [...attachments.value, ...next].slice(0, 6);
      if (fileInput.value) fileInput.value.value = "";
    }
    async function send() {
      if (busy.value || !canSend.value) return;
      busy.value = true;
      error.value = "";
      notice.value = "";
      const text = input.value.trim();
      const files = attachments.value.slice();
      const images = files.filter((f) => f.kind === "image").map((f) => f.data || "").filter(Boolean);
      let sendText = text;
      for (const f of files) {
        if (f.kind === "text") sendText += "\n\n【附件：" + f.name + "】\n" + (f.text || "").slice(0, 6000);
        else if (f.kind === "file") sendText += "\n\n【附件：" + f.name + "】\n" + (f.text || "").slice(0, 12000);
      }
      if (!sendText.trim() && images.length) sendText = "请看看我发的图片。";
      messages.value.push({
        role: "user",
        text,
        images: images.slice(),
        files: files.map((f) => f.name),
      });
      input.value = "";
      attachments.value = [];
      scrollBottom();
      try {
        const history = messages.value.filter((m) => m.role !== "system").slice(-7, -1).map((m) => ({ role: m.role, text: m.text }));
        const r = await api<any>("/companion/chat", "POST", {
          message: sendText,
          images,
          persona: agent.value.name,
          history,
        }, { timeoutMs: 150000 });
        const reply = String(r.reply || "").trim();
        if (!reply && !r.pendingAction) throw new Error("AI 没有回复，请再说一次");
        if (r.pendingAction) {
          const done = await confirmPendingAction(r.pendingAction);
          messages.value.push({
            role: "assistant",
            text: done.cancelled ? "已取消写入。" : done.ok
              ? "已执行写入：" + JSON.stringify(done.result || {}).slice(0, 300)
              : "写入失败：" + (done.error || "未知错误"),
          });
          scrollBottom();
          return;
        }
        messages.value.push({
          role: "assistant",
          text: reply,
          meta: { tools: r.tools, plan: r.plan, delegation: r.delegation },
        });
        if (r.memory) addMemory(agent.value.name, String(r.memory));
        if (r.handoff?.to) messages.value.push({ role: "system", text: r.handoff.to + " 接手了这个问题。" });
        if (r.plan?.length) notice.value = "本次走了 " + r.plan.length + " 步协作。";
        scrollBottom();
      } catch (e) {
        messages.value.push({ role: "system", text: errorText(e) });
        error.value = errorText(e);
        scrollBottom();
      } finally {
        busy.value = false;
      }
    }
    async function clearChat() {
      if (busy.value) return;
      if (!confirm("清空与「" + agent.value.name + "」的对话记录？")) return;
      messages.value = [];
      persistSession();
      notice.value = "已清空当前对话；服务器历史会在下次新建对话时重新载入。";
    }
    loadSessionStore();
    watch(messages, () => persistSession(), { deep: true });
    onMounted(() => { void loadHistory(); });

    function agentList() {
      return h("aside", { class: "ds-chat-sidebar" }, [
        h("div", { class: "ds-chat-brand" }, [h("span", "✧"), h("div", [h("strong", "AI 协作空间"), h("small", "选一个 agent，开始协作")])]),
        h("button", { class: "ds-new-chat", onClick: newChat }, "＋ 新对话"),
        h("p", { class: "ds-side-label" }, "本次对话"),
        h("div", { class: "ds-session-list" }, agentSessions.value.map((s) =>
          h("div", { key: s.id, class: "ds-session-item" + (s.id === activeSession.value ? " on" : "") }, [
            h("button", { class: "ds-session-open", onClick: () => selectSession(s.id), title: s.title || "新对话" }, [
              h("strong", null, s.title || "新对话"),
              h("small", null, new Date(s.updatedAt || Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })),
            ]),
            h("button", { class: "ds-session-del", onClick: (e: Event) => { e.stopPropagation(); deleteChat(s.id); }, title: "删除对话", "aria-label": "删除对话" }, "×"),
          ])
        )),
        h("p", { class: "ds-side-label" }, "选择 agent"),
        h("div", { class: "ds-agent-list" }, AGENTS.map((a) =>
          h("button", {
            class: "ds-agent-item" + (a.id === agentId.value ? " on" : ""),
            onClick: () => void switchAgent(a.id),
          }, [
            h("img", { src: a.avatar, alt: a.name }),
            h("div", [h("strong", a.name), h("span", a.role + " · " + a.tag)]),
          ])
        )),
        h("div", { class: "ds-side-foot" }, [
          h("p", "文件/图片只在本次对话里处理；图片发给多模态模型，PDF/DOCX/XLSX/PPTX 会先提取文字再作为上下文。"),
          h("a", { href: "#home" }, "← 返回工作台"),
        ]),
      ]);
    }

    function messageList() {
      return h("div", { class: "ds-chat-list", ref: listRef }, [
        loading.value ? h("p", { class: "ds-chat-status" }, "正在载入对话…") : null,
        !loading.value && !messages.value.length
          ? h("div", { class: "ds-chat-empty" }, [
              h("img", { src: agent.value.avatar, alt: agent.value.name }),
              h("h2", "和 " + agent.value.name + " 聊聊"),
              h("p", agent.value.role + " · " + agent.value.tag),
              h("div", { class: "ds-suggestions" }, [
                "帮我看看现在的求职方向",
                "把这段项目经历改得更清楚",
                "我最近学习进度怎么样？",
              ].map((x) => h("button", { onClick: () => { input.value = x; void send(); } }, x))),
            ])
          : null,
        messages.value.map((m, i) => h("div", { key: i, class: "ds-msg " + m.role }, [
          m.role !== "system" ? h("img", { class: "ds-msg-avatar", src: m.role === "assistant" ? agent.value.avatar : "/assets/companions/b-1.png", alt: "" }) : null,
          h("div", { class: "ds-msg-body" }, [
            h("div", { class: "ds-msg-name" }, m.role === "assistant" ? agent.value.name : m.role === "user" ? "我" : "系统"),
            m.images?.length ? h("div", { class: "ds-msg-images" }, m.images.map((src, j) => h("img", { key: j, src, alt: "上传图片" }))) : null,
            m.files?.length ? h("p", { class: "ds-msg-files" }, "附件：" + m.files.join("、")) : null,
            h("div", { class: "ds-msg-text" }, m.text || (m.images?.length ? "（图片）" : "")),
            m.meta?.plan?.length
              ? h("div", { class: "ds-meta" }, "🧭 " + m.meta.plan.map((s: any) => s.agent + "·" + s.tool).join(" → "))
              : m.meta?.tools?.length
              ? h("div", { class: "ds-meta" }, "已调用：" + m.meta.tools.join("、"))
              : null,
          ]),
        ])),
        busy.value ? h("div", { class: "ds-msg assistant" }, [
          h("img", { class: "ds-msg-avatar", src: agent.value.avatar, alt: "" }),
          h("div", { class: "ds-msg-body" }, [h("div", { class: "ds-msg-name" }, agent.value.name), h("div", { class: "ds-msg-text typing" }, "正在想…")]),
        ]) : null,
      ]);
    }

    function composer() {
      return h("div", { class: "ds-composer" }, [
        attachments.value.length ? h("div", { class: "ds-attachments" }, attachments.value.map((a) =>
          h("div", { key: a.id, class: "ds-attachment" }, [
            a.kind === "image" ? h("img", { src: a.data, alt: a.name }) : h("span", { class: "ds-file-icon" }, "▤"),
            h("span", a.name),
            h("button", { "aria-label": "移除附件", onClick: () => removeAttachment(a.id) }, "×"),
          ])
        )) : null,
        h("div", { class: "ds-composer-row" }, [
          h("input", {
            ref: fileInput,
            type: "file",
            multiple: true,
            accept: "image/*,.txt,.md,.markdown,.csv,.json,.log,.html,.htm,.css,.js,.ts,.yml,.yaml,.xml,.pdf,.docx,.xlsx,.pptx",
            style: "display:none",
            onChange: (e: Event) => void pickFiles((e.target as HTMLInputElement).files),
          }),
          h("button", { class: "ds-attach-btn", title: "上传文件或图片", onClick: () => fileInput.value?.click() }, "＋"),
          h("textarea", {
            value: input.value,
            rows: 1,
            placeholder: "给 " + agent.value.name + " 发消息…  Enter 发送，Shift+Enter 换行",
            onInput: (e: Event) => { input.value = (e.target as HTMLTextAreaElement).value; },
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            },
          }),
          h("button", { class: "ds-send-btn", disabled: busy.value || !canSend.value, onClick: () => void send() }, busy.value ? "…" : "发送"),
        ]),
        error.value ? h("p", { class: "ds-composer-error" }, error.value) : null,
      ]);
    }

    return () => h("div", { class: "ds-chat-page" }, [
      agentList(),
      h("main", { class: "ds-chat-main" }, [
        h("header", { class: "ds-chat-head" }, [
          h("div", [h("strong", agent.value.name), h("span", agent.value.role + " · " + agent.value.tag)]),
          h("div", { class: "ds-chat-head-actions" }, [
            notice.value ? h("span", { class: "ds-chat-notice" }, notice.value) : null,
            h("button", { onClick: clearChat, disabled: busy.value }, "清空对话"),
          ]),
        ]),
        messageList(),
        composer(),
      ]),
    ]);
  },
});
