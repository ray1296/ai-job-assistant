import { defineComponent, h, ref, onMounted } from "vue";
import { api, errorText } from "./api";

const STORE = "zg.companion.v1";
const read = () => {
  try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; }
};
const write = (v: any) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

export default defineComponent({
  props: { page: { type: String, default: "" } },
  setup(props) {
    const conf = ref<any>({ size: 1, voice: true, x: 24, y: 120, minimized: true, ...read() });
    const open = ref(!conf.value.minimized);
    const msg = ref("");
    const log = ref<{ role: "me" | "ai"; text: string }[]>([]);
    const busy = ref(false);
    const err = ref("");

    const save = () => write({ ...conf.value, minimized: !open.value });

    function speak(text: string) {
      if (!conf.value.voice || !text || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.slice(0, 180));
        u.lang = "zh-CN";
        window.speechSynthesis.speak(u);
      } catch {}
    }

    async function send(text?: string) {
      const content = (text ?? msg.value).trim();
      if (!content || busy.value) return;
      msg.value = "";
      log.value.push({ role: "me", text: content });
      busy.value = true; err.value = "";
      try {
        const r = await api<any>("/companion/chat", "POST", {
          message: content, page: props.page,
          history: log.value.slice(-6).map((x) => ({ role: x.role, text: x.text })),
        }, { timeoutMs: 120000 });
        const reply = r.reply || "……我没想到该怎么回答。";
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
      conf.value = { ...conf.value, x: Math.max(4, Math.min(window.innerWidth - 72, drag.ox + dx)), y: Math.max(4, Math.min(window.innerHeight - 72, drag.oy + dy)) };
    }
    function up() {
      if (drag && !drag.moved) { open.value = !open.value; save(); }
      drag = null;
    }
    onMounted(() => { if (open.value && !log.value.length) log.value.push({ role: "ai", text: "我是小光。遇到不会的题、不知道投哪家，都可以问我。" }); });

    return () =>
      h("div", { class: "companion", style: { left: conf.value.x + "px", top: conf.value.y + "px" } }, [
        open.value
          ? h("div", { class: "companion-panel", style: { transform: "scale(" + conf.value.size + ")", transformOrigin: "bottom left" } }, [
              h("header", { class: "companion-head" }, [
                h("span", "✦ 小光"),
                h("div", { style: { display: "flex", gap: "6px" } }, [
                  h("button", { title: "语音开关", onClick: () => { conf.value = { ...conf.value, voice: !conf.value.voice }; save(); } }, conf.value.voice ? "🔊" : "🔇"),
                  h("button", { title: "收起", onClick: () => { open.value = false; save(); } }, "×"),
                ]),
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
        h("button", {
          class: "companion-fab",
          onPointerdown: down, onPointermove: move, onPointerup: up,
          title: "单击展开/收起，可拖动",
        }, "小光"),
      ]);
  },
});
