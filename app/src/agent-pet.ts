import {
  defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick,
} from "vue";
import { api, errorText } from "./api";
import { petPositions, setPetPos } from "./pet-store";
import { voiceOn, setVoiceOn, speakAs, stopSpeech } from "./voice";
import { addMemory, clearMemory, memoryEntries, memoryStats, memoryText, MEMORY_TTL_DAYS } from "./agent-memory";
import { extractFile } from "./extract-file";

const ROLE_SHORT: Record<string, string> = {
  主理人: "主理", 学习助教: "学习", 求职顾问: "求职", 生活管家: "生活",
};

export const AGENT_GREETS: Record<string, string> = {
  xingye: "我是星野。卡住了就问我，讲题、选岗位、看企业都行。",
  zhiwei: "我是知微，负责陪你把题刷明白。哪道题不懂？",
  yanzhou: "我是砚舟。简历、岗位、面试节奏都可以问我。",
  qichi: "我是栖迟。租房、通勤、城市生活的事找我。",
};

/** 把图片压到适合多模态请求的尺寸，避免超过服务端体积上限。 */
async function imageToDataUrl(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const max = 1100;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  try { bmp.close(); } catch {}
  return c.toDataURL("image/jpeg", 0.84);
}

export default defineComponent({
  props: {
    agentId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "" },
    avatar: { type: String, required: true },
    slot: { type: Number, default: 0 },
    page: { type: String, default: "" },
  },
  setup(props) {
    const open = ref(false);
    const log = ref<{ role: "me" | "ai"; text: string; image?: string }[]>([
      { role: "ai", text: AGENT_GREETS[props.agentId] || "我在。" },
    ]);
    const loaded = ref(false);
    const busy = ref(false);
    const err = ref("");
    const msg = ref("");
    const pendingImage = ref("");
    const pendingDoc = ref<{ name: string; text: string; chars: number } | null>(null);
    const listening = ref(false);
    const memPct = ref(memoryStats(props.name).pct);
    const memDismissed = ref(false);
    const memBusy = ref(false);
    const logEl = ref<HTMLElement | null>(null);
    const vw = ref(window.innerWidth);
    const vh = ref(window.innerHeight);

    const pos = computed(() => petPositions[props.agentId] || { x: 0, y: 0 });
    /** 对话框锚定在该 chip 正上方：左边跟随 chip 中心，底边贴在 chip 顶上 10px。 */
    const panelStyle = computed(() => {
      const W = 300;
      const p = pos.value;
      const left = Math.min(Math.max(8, p.x + 27 - W / 2), Math.max(8, vw.value - W - 8));
      const bottom = Math.max(8, vh.value - p.y + 10);
      const maxHeight = Math.max(170, Math.min(Math.round(vh.value * 0.52), p.y - 76));
      return { left: left + "px", bottom: bottom + "px", top: "auto", maxHeight: maxHeight + "px" };
    });

    function scrollLog() {
      void nextTick(() => {
        if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
      });
    }

    async function loadHistory() {
      if (loaded.value) return;
      loaded.value = true;
      try {
        const r = await api<any>("/companion/history?agent=" + encodeURIComponent(props.agentId), "GET", undefined, { timeoutMs: 10000 });
        const list = Array.isArray(r?.messages) ? r.messages : [];
        // 只在还没开始聊天时套用服务端历史，避免和用户刚发出的消息打架
        if (list.length && log.value.length <= 1 && !busy.value) log.value = list.map((m: any) => ({
          role: m.role === "user" ? "me" : "ai",
          text: String(m.text || ""),
        }));
        scrollLog();
      } catch {}
    }

    function openChat(force = false) {
      if (force) open.value = true;
      else open.value = !open.value;
      if (open.value) {
        // 同一时间只展开一个对话框：几个 chip 挨得很近，300px 的面板会互相盖住。
        window.dispatchEvent(new CustomEvent("zg:chat-opened", { detail: { agentId: props.agentId } }));
        memPct.value = memoryStats(props.name).pct;
        void loadHistory();
        scrollLog();
      } else stopSpeech();
    }

    async function attachDoc(file: File) {
      try {
        err.value = "";
        const d = await extractFile(file);
        pendingDoc.value = { name: d.name, text: d.text, chars: d.chars };
      } catch (e) { err.value = (e as Error).message || "文件解析失败"; }
    }
    async function attachImage(file: Blob) {
      try {
        pendingImage.value = await imageToDataUrl(file);
      } catch (e) {
        err.value = "这张图读不出来，换一张试试";
      }
    }

    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || []);
      const hit = items.find((it) => (it.type || "").startsWith("image/"));
      if (!hit) return;
      const file = hit.getAsFile();
      if (!file) return;
      e.preventDefault();
      void attachImage(file);
    }

    async function send() {
      const text = msg.value.trim();
      const image = pendingImage.value;
      const doc = pendingDoc.value;
      if ((!text && !image && !doc) || busy.value) return;
      msg.value = "";
      pendingImage.value = "";
      pendingDoc.value = null;
      log.value.push({ role: "me", text: (text || (doc ? "📄 " + doc.name : "帮我看看这张图。")) + (doc ? "\n\n【附件：" + doc.name + "】" : ""), image: image || undefined });
      busy.value = true;
      err.value = "";
      scrollLog();
      try {
        const r = await api<any>("/companion/chat", "POST", {
          message: (text || (doc ? "请阅读这个文件并帮我分析。" : "请看看这张图，帮我讲解一下。")) + (doc ? "\n\n【附件：" + doc.name + "】\n" + doc.text : ""),
          persona: props.name,
          page: props.page || location.hash.replace(/^#/, ""),
          history: log.value.slice(-7, -1).map((x) => ({ role: x.role, text: x.text })),
          image: image || undefined,
          memory: memoryText(props.name) || undefined,
        }, { timeoutMs: 120000 });
        const reply = String(r?.reply || "……我再想想。");
        if (Array.isArray(r?.plan) && r.plan.length) {
          log.value.push({
            role: "ai",
            text: "🧭 " + r.plan.length + " 步：" + r.plan
              .map((p: any) => p.agent + (p.tool ? "·" + p.tool : "") + (p.ok ? " ✓" : " ✗"))
              .join(" → "),
          });
        } else if (r?.delegation) {
          log.value.push({
            role: "ai",
            text: "🧭 已让 " + r.delegation.agent + " 查了" + (r.delegation.tool ? "「" + r.delegation.tool + "」" : "资料") + "，再把结果交给我综合。",
          });
        }
        log.value.push({ role: "ai", text: reply });
        if (r?.memory && addMemory(props.name, String(r.memory))) memPct.value = memoryStats(props.name).pct;
        void speakAs(props.name, reply);
        if (r?.handoff?.reply) {
          const peer = String(r.handoff.to || "队友");
          log.value.push({ role: "ai", text: "【" + peer + "】" + r.handoff.reply });
          void speakAs(peer, String(r.handoff.reply));
        }
      } catch (e) {
        err.value = errorText(e);
      } finally {
        busy.value = false;
        scrollLog();
      }
    }

    async function uploadMemory() {
      if (memBusy.value) return;
      const entries = memoryEntries(props.name);
      if (!entries.length) { memDismissed.value = true; return; }
      memBusy.value = true;
      try {
        const r = await api<any>("/agents/" + props.agentId + "/memories", "POST", { entries }, { timeoutMs: 20000 });
        clearMemory(props.name);
        memPct.value = 0;
        memDismissed.value = true;
        log.value.push({ role: "ai", text: "已把 " + (r?.added || entries.length) + " 条记忆上传到服务器，保留 30 天；本地记忆已清空。" });
        scrollLog();
      } catch (e) {
        err.value = errorText(e);
      } finally {
        memBusy.value = false;
      }
    }
    function clearLocalMemory() {
      clearMemory(props.name);
      memPct.value = 0;
      memDismissed.value = true;
      log.value.push({ role: "ai", text: "本地记忆已清空。服务器上的副本（如果有）会在 30 天后自动删除。" });
      scrollLog();
    }

    function toggleAsr() {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { err.value = "当前浏览器不支持语音识别（建议 Chrome / Edge）"; return; }
      if (listening.value) return;
      const recog = new SR();
      recog.lang = "zh-CN";
      recog.interimResults = false;
      recog.onresult = (ev: any) => {
        const text = ev?.results?.[0]?.[0]?.transcript || "";
        if (text) { msg.value = text; void send(); }
      };
      recog.onerror = () => { err.value = "没听清，再说一遍？"; listening.value = false; };
      recog.onend = () => { listening.value = false; };
      try { recog.start(); listening.value = true; } catch { listening.value = false; }
    }

    function startDrag(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const origin = { ...pos.value };
      let moved = false;
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        setPetPos(props.agentId, {
          x: Math.max(0, origin.x + dx),
          y: Math.max(0, origin.y + dy),
        });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (!moved) openChat();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up, { once: true });
    }

    function onToggleChat(ev: any) {
      const id = ev?.detail?.agentId || ev?.detail?.personaId;
      if (id && id === props.agentId) openChat(!!ev.detail.open);
    }
    function onOtherChat(ev: any) {
      if (ev?.detail?.agentId && ev.detail.agentId !== props.agentId && open.value) {
        open.value = false;
      }
    }
    function onResize() { vw.value = window.innerWidth; vh.value = window.innerHeight; }
    function onHashChange() {
      // 换页面时收起对话框：它是 fixed 面板，留着会盖住新页面的内容
      if (open.value) { open.value = false; stopSpeech(); }
    }

    onMounted(() => {
      window.addEventListener("zg:toggle-chat", onToggleChat);
      window.addEventListener("zg:chat-opened", onOtherChat);
      window.addEventListener("resize", onResize);
      window.addEventListener("hashchange", onHashChange);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("zg:toggle-chat", onToggleChat);
      window.removeEventListener("zg:chat-opened", onOtherChat);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHashChange);
      stopSpeech();
    });

    return () => [
      h("button", {
        class: "agent-chip" + (open.value ? " on" : ""),
        style: { left: pos.value.x + "px", top: pos.value.y + "px" },
        onMousedown: startDrag,
        title: props.name + " · " + props.role + "（单击对话，再点收起，按住拖动）",
        "aria-expanded": open.value ? "true" : "false",
      }, [
        h("img", { src: props.avatar, alt: props.name, draggable: false }),
        h("span", props.name + "·" + (ROLE_SHORT[props.role] || props.role)),
      ]),
      open.value
        ? h("div", {
            class: "companion-chat agent-chat",
            style: panelStyle.value,
            role: "dialog",
            "aria-label": props.name + " 的对话",
            onKeydown: (e: KeyboardEvent) => { if (e.key === "Escape") open.value = false; if (e.key === "Enter" && (e.target as HTMLElement)?.tagName === "INPUT") void send(); },
          }, [
            h("header", { class: "companion-head" }, [
              h("span", null, props.name + " · " + props.role),
              h("div", { class: "agent-head-tools" }, [
                h("button", {
                  class: "agent-voice-btn" + (voiceOn.value ? " on" : ""),
                  title: voiceOn.value ? "回复自动朗读，点击静音" : "已静音，点击恢复自动朗读",
                  onClick: () => setVoiceOn(!voiceOn.value),
                }, voiceOn.value ? "🔊 自动" : "🔇 静音"),
                h("button", { title: "收起对话", onClick: () => { open.value = false; stopSpeech(); } }, "×"),
              ]),
            ]),
            h("div", { class: "companion-log", ref: logEl }, [
              ...log.value.map((x, i) => h("p", { class: "companion-bubble " + (x.role === "me" ? "me" : "ai"), key: i }, [
                x.image ? h("img", { class: "agent-bubble-img", src: x.image, alt: "附图" }) : null,
                h("span", null, x.text),
              ])),
              busy.value ? h("p", { class: "companion-bubble ai agent-typing" }, "正在想…") : null,
            ]),
            err.value ? h("p", { class: "companion-error" }, err.value) : null,
            memPct.value >= 0.8 && !memDismissed.value
              ? h("div", { class: "agent-mem-warn" }, [
                  h("span", { title: "本地记忆保留 " + MEMORY_TTL_DAYS + " 天；上传后服务器保留 30 天" },
                    "🧠 本地记忆已用 " + Math.round(memPct.value * 100) + "%，" + props.name + " 建议上传或清空"),
                  h("div", null, [
                    h("button", { disabled: memBusy.value, onClick: () => void uploadMemory() }, memBusy.value ? "上传中…" : "上传并清空"),
                    h("button", { onClick: clearLocalMemory }, "仅清空"),
                    h("button", { onClick: () => (memDismissed.value = true) }, "稍后"),
                  ]),
                ])
              : null,
            pendingDoc.value
              ? h("div", { class: "agent-img-preview" }, [
                  h("span", null, "📄 " + pendingDoc.value.name + " · " + Math.ceil(pendingDoc.value.chars / 1000) + "k 字"),
                  h("button", { title: "移除文件", onClick: () => (pendingDoc.value = null) }, "×"),
                ])
              : null,
            pendingImage.value
              ? h("div", { class: "agent-img-preview" }, [
                  h("img", { src: pendingImage.value, alt: "待发送图片" }),
                  h("span", null, "图片已附上"),
                  h("button", { title: "移除图片", onClick: () => (pendingImage.value = "") }, "×"),
                ])
              : null,
            h("div", { class: "agent-composer", onPaste }, [
              h("label", { class: "agent-attach", title: "发图 / 粘贴截图（Ctrl+V）" }, [
                "📎",
                h("input", {
                  type: "file", accept: "image/*", style: { display: "none" },
                  onChange: (e: Event) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) void attachImage(f);
                    (e.target as HTMLInputElement).value = "";
                  },
                }),
              ]),
              h("label", { class: "agent-attach", title: "上传 PDF/Word/Excel/PPT" }, [
                "📄",
                h("input", {
                  type: "file", accept: ".pdf,.docx,.xlsx,.pptx", style: { display: "none" },
                  onChange: (e: Event) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) void attachDoc(f);
                    (e.target as HTMLInputElement).value = "";
                  },
                }),
              ]),
              h("button", { class: "companion-mic" + (listening.value ? " on" : ""), title: "语音输入", onClick: toggleAsr }, listening.value ? "●" : "🎤"),
              h("input", {
                placeholder: busy.value ? "我想想…" : "问我点什么，可粘贴图片",
                value: msg.value,
                onInput: (e: Event) => (msg.value = (e.target as HTMLInputElement).value),
                onPaste,
              }),
              h("button", { disabled: busy.value, onClick: () => void send() }, "发送"),
            ]),
          ])
        : null,
    ];
  },
});
