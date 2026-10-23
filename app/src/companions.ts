import { defineComponent, h, ref, onMounted } from "vue";
import { api, errorText } from "./api";

const STORE = "zg.companions.v2";
const PERSONAS = [
  { id: "guide", name: "小光", role: "主理人", icon: "✦", greet: "我是小光。卡住了就问我，讲题、选岗位、看企业都行。" },
  { id: "study", name: "小习", role: "学习助教", icon: "✎", greet: "我是小习，负责陪你把题刷明白。哪道题不懂？" },
  { id: "job", name: "小职", role: "求职顾问", icon: "◎", greet: "我是小职。简历、岗位、面试节奏都可以问我。" },
  { id: "life", name: "小住", role: "生活管家", icon: "⌂", greet: "我是小住。租房、通勤、城市生活的事找我。" },
];

export default defineComponent({
  props: { page: { type: String, default: "" } },
  setup(props) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } })();
    const conf = ref<any>({ size: 1, voice: true, x: 16, y: Math.max(120, window.innerHeight - 210), ...saved });
    const collapsed = ref(false);
    const activeId = ref("");
    const log = ref<{ role: "me" | "ai"; text: string }[]>([]);
    const msg = ref("");
    const busy = ref(false);
    const err = ref("");
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify(conf.value)); } catch {} };
    const persona = () => PERSONAS.find((p) => p.id === activeId.value) || PERSONAS[0];

    function speak(text: string) {
      if (!conf.value.voice || !text || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.slice(0, 180));
        u.lang = "zh-CN";
        window.speechSynthesis.speak(u);
      } catch {}
    }
    function openChat(id: string) {
      activeId.value = id;
      const p = PERSONAS.find((x) => x.id === id)!;
      log.value = [{ role: "ai", text: p.greet }];
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
          message: "（你现在扮演" + persona().name + "，" + persona().role + "）" + content,
          page: props.page,
          history: log.value.slice(-6).map((x) => ({ role: x.role, text: x.text })),
        }, { timeoutMs: 120000 });
        const reply = r.reply || "……我再想想。";
        log.value.push({ role: "ai", text: reply });
        speak(reply);
      } catch (e) { err.value = errorText(e); }
      finally { busy.value = false; }
    }

    let drag: any = null;
    function down(e: PointerEvent) {
      drag = { x: e.clientX, y: e.clientY, ox: conf.value.x, oy: conf.value.y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    function move(e: PointerEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      conf.value = { ...conf.value, x: Math.max(4, Math.min(window.innerWidth - 60, drag.ox + dx)), y: Math.max(4, Math.min(window.innerHeight - 60, drag.oy + dy)) };
    }
    function up() { drag = null; save(); }
    onMounted(() => { if (!conf.value.x || !conf.value.y) save(); });

    return () =>
      h("aside", { class: "companions", style: { left: conf.value.x + "px", top: conf.value.y + "px" }, "aria-label": "看板娘团队" }, [
        h("div", { class: "companions-row" }, [
          ...PERSONAS.map((p) =>
            h("button", {
              class: "companion-chip" + (activeId.value === p.id ? " on" : ""),
              onPointerDown: down, onPointerMove: move, onPointerUp: up,
              onClick: () => openChat(p.id),
              title: p.name + " · " + p.role + "（可拖动）",
            }, [
              h("span", { class: "companion-face" }, p.icon),
              h("span", { class: "companion-name" }, p.name),
            ])),
          h("button", {
            class: "companion-chip ghost",
            onClick: () => { collapsed.value = !collapsed.value; },
            title: collapsed.value ? "展开设置" : "收起设置",
          }, collapsed.value ? "⚙" : "×"),
        ]),
        !collapsed.value
          ? h("div", { class: "companion-settings" }, [
              h("label", null, [
                h("span", "大小"),
                h("input", {
                  type: "range", min: "0.7", max: "1.6", step: "0.1", value: String(conf.value.size),
                  onInput: (e: Event) => { conf.value = { ...conf.value, size: Number((e.target as HTMLInputElement).value) }; save(); },
                }),
              ]),
              h("label", { class: "map-check" }, [
                h("input", { type: "checkbox", checked: conf.value.voice, onChange: (e: Event) => { conf.value = { ...conf.value, voice: (e.target as HTMLInputElement).checked }; save(); } }),
                "语音朗读",
              ]),
            ])
          : null,
        activeId.value
          ? h("div", { class: "companion-chat", style: { transform: "scale(" + conf.value.size + ")", transformOrigin: "top left" } }, [
              h("header", { class: "companion-head" }, [
                h("span", persona().icon + " " + persona().name + " · " + persona().role),
                h("button", { onClick: () => { activeId.value = ""; window.speechSynthesis?.cancel(); } }, "×"),
              ]),
              h("div", { class: "companion-log" }, log.value.map((x) => h("p", { class: "companion-bubble " + (x.role === "me" ? "me" : "ai") }, x.text))),
              err.value ? h("p", { class: "companion-error" }, err.value) : null,
              h("div", { class: "companion-input" }, [
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
