import { defineComponent, h, ref, onMounted } from "vue";
import { api, errorText } from "./api";

const STORE = "zg.companions.v3";
const PERSONAS = [
  { id: "xingye", name: "星野", role: "主理人", avatar: "/assets/companions/b-1.png", greet: "我是星野。卡住了就问我，讲题、选岗位、看企业都行。" },
  { id: "zhiwei", name: "知微", role: "学习助教", avatar: "/assets/companions/b-3.png", greet: "我是知微，负责陪你把题刷明白。哪道题不懂？" },
  { id: "yanzhou", name: "砚舟", role: "求职顾问", avatar: "/assets/companions/a-2.png", greet: "我是砚舟。简历、岗位、面试节奏都可以问我。" },
  { id: "qichi", name: "栖迟", role: "生活管家", avatar: "/assets/companions/a-1.jpg", greet: "我是栖迟。租房、通勤、城市生活的事找我。" },
];

const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };

export default defineComponent({
  props: { page: { type: String, default: "" } },
  setup(props) {
    const saved = read();
    const positions = ref<any>(saved.positions || PERSONAS.map((_, i) => ({
      x: Math.max(12, window.innerWidth - 78),
      y: Math.max(90, window.innerHeight - 520 + i * 78),
    })));
    const togglePos = ref(saved.togglePos || { x: Math.max(12, window.innerWidth - 96), y: Math.max(90, window.innerHeight - 150) });
    const collapsed = ref(saved.collapsed ?? false);
    const voice = ref(saved.voice ?? true);
    const form = ref<"avatar" | "live2d">(saved.form || "live2d");
    const activeId = ref("");
    const log = ref<{ role: "me" | "ai"; text: string }[]>([]);
    const histories: Record<string, { role: "me" | "ai"; text: string }[]> = {};
    const msg = ref("");
    const busy = ref(false);
    const err = ref("");
    const listening = ref(false);

    const save = () => {
      try {
        localStorage.setItem(STORE, JSON.stringify({
          positions: positions.value, togglePos: togglePos.value,
          collapsed: collapsed.value, voice: voice.value, form: form.value,
        }));
      } catch {}
    };
    const persona = () => PERSONAS.find((p) => p.id === activeId.value) || PERSONAS[0];

    function speak(text: string) {
      if (!voice.value || !text || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.slice(0, 180));
        u.lang = "zh-CN";
        window.speechSynthesis.speak(u);
      } catch {}
    }
    function openChat(id: string) {
      if (activeId.value) histories[activeId.value] = log.value.slice();
      activeId.value = id;
      const p = PERSONAS.find((x) => x.id === id)!;
      log.value = histories[id] ? histories[id].slice() : [{ role: "ai", text: p.greet }];
      err.value = "";
    }
    async function send() {
      const content = msg.value.trim();
      if (!content || busy.value) return;
      msg.value = "";
      log.value.push({ role: "me", text: content });
      busy.value = true; err.value = "";
      try {
        const r = await api<any>("/companion/chat", "POST", {
          message: content, persona: persona().name, page: props.page,
          history: log.value.slice(-6).map((x) => ({ role: x.role, text: x.text })),
        }, { timeoutMs: 120000 });
        log.value.push({ role: "ai", text: r.reply || "……我再想想。" });
        if (r.handoff?.reply) {
          log.value.push({ role: "ai", text: "【" + r.handoff.to + "】" + r.handoff.reply });
          speak(r.handoff.reply);
        } else speak(r.reply || "");
      } catch (e) { err.value = errorText(e); }
      finally { busy.value = false; }
    }
    function toggleAsr() {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { err.value = "当前浏览器不支持语音识别（建议 Chrome / Edge）"; return; }
      if (listening.value) return;
      const recog = new SR();
      recog.lang = "zh-CN"; recog.interimResults = false;
      recog.onresult = (ev: any) => {
        const text = ev?.results?.[0]?.[0]?.transcript || "";
        if (text) { msg.value = text; void send(); }
      };
      recog.onerror = () => { err.value = "没听清，再说一遍？"; listening.value = false; };
      recog.onend = () => { listening.value = false; };
      try { recog.start(); listening.value = true; } catch { listening.value = false; }
    }

    function startDrag(kind: "chip" | "toggle", index: number, e: MouseEvent) {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      const startX = e.clientX, startY = e.clientY;
      const origin = kind === "chip" ? { ...positions.value[index] } : { ...togglePos.value };
      let moved = false;
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        if (kind === "chip") {
          const next = [...positions.value];
          next[index] = { x: origin.x + dx, y: origin.y + dy };
          positions.value = next;
        } else {
          togglePos.value = { x: origin.x + dx, y: origin.y + dy };
        }
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (moved) save();
        else if (kind === "chip") openChat(PERSONAS[index].id);
        else {
          document.body.classList.toggle("zg-pets-hidden");
          window.dispatchEvent(new CustomEvent("zg:pets-toggle"));
        }
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up, { once: true });
    }

    onMounted(() => {
      window.addEventListener("zg:open-persona", (ev: any) => {
        const id = ev?.detail?.personaId;
        if (id) { collapsed.value = false; openChat(id); }
      }); if (form.value === "live2d") document.body.classList.add("show-live2d"); });
    function setForm(f: "avatar" | "live2d") {
      form.value = f;
      document.body.classList.toggle("show-live2d", f === "live2d");
      save();
    }

    return () =>
      h("div", { class: "companions-v3" }, [
        h("button", {
          class: "companions-form",
          style: { left: togglePos.value.x + "px", top: (togglePos.value.y + 40) + "px" },
          title: "切换看板娘形态（Live2D / 立绘）",
          onClick: () => { const nf = form.value === "live2d" ? "avatar" : "live2d"; setForm(nf); window.dispatchEvent(new CustomEvent("zg:pet-skin", { detail: { skin: nf } })); },
        }, form.value === "live2d" ? "⇄ 立绘" : "⇄ Live2D"),

        h("button", {
          class: "companions-dial",
          style: { left: togglePos.value.x + "px", top: togglePos.value.y + "px" },
          onMousedown: (e: MouseEvent) => startDrag("toggle", 0, e),
          title: "单击显示/隐藏看板娘，按住可拖动",
        }, "✦"),

        activeId.value
          ? h("div", { class: "companion-chat", style: { left: positions.value[0].x + "px", bottom: "170px" } }, [
              h("header", { class: "companion-head" }, [
                h("span", persona().name + " · " + persona().role),
                h("div", { style: { display: "flex", gap: "6px" } }, [
                  h("button", { title: "语音朗读", onClick: () => { voice.value = !voice.value; save(); } }, voice.value ? "🔊" : "🔇"),
                  h("button", { title: "切换形态", onClick: () => setForm(form.value === "live2d" ? "avatar" : "live2d") }, form.value === "live2d" ? "立绘" : "Live2D"),
                  h("button", { onClick: () => { activeId.value = ""; window.speechSynthesis?.cancel(); } }, "×"),
                ]),
              ]),
              h("div", { class: "companion-log" }, log.value.map((x) => h("p", { class: "companion-bubble " + (x.role === "me" ? "me" : "ai") }, x.text))),
              err.value ? h("p", { class: "companion-error" }, err.value) : null,
              h("div", { class: "companion-input" }, [
                h("button", { class: "companion-mic" + (listening.value ? " on" : ""), title: "语音输入", onClick: toggleAsr }, listening.value ? "●" : "🎤"),
                h("input", {
                  placeholder: busy.value ? "我想想…" : "问我点什么",
                  value: msg.value,
                  onInput: (e: Event) => (msg.value = (e.target as HTMLInputElement).value),
                  onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void send(); },
                }),
                h("button", { disabled: busy.value, onClick: () => void send() }, "发送"),
              ]),
            ])
          : null,
      ]);
  },
});
