import { defineComponent, h, ref, onMounted, onBeforeUnmount } from "vue";

const STORE = "zg.agents.v2";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const write = (v: any) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

export const PET_MODELS = [
  { url: "/live2d/live2d-widget-models/live2d-widget-model-shizuku/assets/shizuku.model.json", label: "静流" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-koharu/assets/koharu.model.json", label: "小春" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-haruto/assets/haruto.model.json", label: "春人" },
];

const ROLE_SHORT: Record<string, string> = { "主理人": "主理", "学习助教": "学习", "求职顾问": "求职", "生活管家": "生活" };

export default defineComponent({
  props: {
    agentId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "" },
    avatar: { type: String, required: true },
    slot: { type: Number, default: 0 },
  },
  setup(props) {
    const saved = read()[props.agentId] || {};
    const pos = ref(saved.pos || { x: Math.max(8, window.innerWidth - 320 + props.slot * 62), y: Math.max(90, window.innerHeight - 210) });
    const hidden = ref(false);
    const persist = () => {
      const all = read();
      all[props.agentId] = { pos: pos.value };
      write(all);
    };
    function startDrag(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ox = pos.value.x, oy = pos.value.y;
      let moved = false;
      const move = (ev: MouseEvent) => {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
        pos.value = { x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) };
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (moved) persist();
        else window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.agentId, persona: props.name } }));
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    function onToggle() { hidden.value = !hidden.value; }
    onMounted(() => window.addEventListener("zg:pets-toggle", onToggle));
    onBeforeUnmount(() => window.removeEventListener("zg:pets-toggle", onToggle));

    return () =>
      h("button", {
        class: "agent-chip",
        style: { left: pos.value.x + "px", top: pos.value.y + "px", display: hidden.value ? "none" : "flex" },
        onMousedown: startDrag,
        title: props.name + " · " + props.role + "（单击对话，按住拖动）",
      }, [
        h("img", { src: props.avatar, alt: props.name, draggable: false }),
        h("span", props.name + "·" + ROLE_SHORT[props.role] as any)
      ]);
  },
});
