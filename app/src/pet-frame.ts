import { defineComponent, h, ref } from "vue";

const STORE = "zg.petFrames.v2";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const write = (v: any) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };

const MODELS = [
  { id: "shizuku", url: "/live2d/live2d-widget-models/live2d-widget-model-shizuku/assets/shizuku.model.json", label: "静流" },
  { id: "koharu", url: "/live2d/live2d-widget-models/live2d-widget-model-koharu/assets/koharu.model.json", label: "小春" },
  { id: "haruto", url: "/live2d/live2d-widget-models/live2d-widget-model-haruto/assets/haruto.model.json", label: "春人" },
  { id: "miku", url: "/live2d/live2d-widget-models/live2d-widget-model-miku/assets/miku.model.json", label: "未来" },
  { id: "chitose", url: "/live2d/live2d-widget-models/live2d-widget-model-chitose/assets/chitose.model.json", label: "千岁" },
  { id: "haru", url: "/live2d/live2d-widget-models/live2d-widget-model-haru/01/assets/haru01.model.json", label: "春" },
];

export default defineComponent({
  props: {
    id: { type: String, required: true },
    model: { type: String, required: true },
    persona: { type: String, default: "" },
    personaId: { type: String, default: "" },
    slot: { type: Number, default: 0 },
    avatar: { type: String, default: "" },
  },
  setup(props) {
    const saved = read()[props.id] || {};
    const pos = ref(saved.pos || { x: Math.max(8, 150 + props.slot * 150), y: Math.max(80, window.innerHeight - 260) });
    const modelUrl = ref(saved.model || props.model);
    const loaded = ref(false);
    const dragMode = ref(false);
    const hidden = ref(false);
    const save = () => {
      const all = read();
      all[props.id] = { pos: pos.value, model: modelUrl.value };
      write(all);
    };
    function startDrag(e: MouseEvent) {
      if (!dragMode.value) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ox = pos.value.x, oy = pos.value.y;
      const move = (ev: MouseEvent) => {
        pos.value = { x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) };
      };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); save(); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    return () =>
      h("div", { class: "pet-frame" + (dragMode.value ? " dragging" : ""), style: { left: pos.value.x + "px", top: pos.value.y + "px", display: hidden.value ? "none" : "block" } }, [
        h("div", {
          class: "pet-frame-handle",
          onDblclick: () => (dragMode.value = !dragMode.value),
          onMousedown: startDrag,
          title: "双击进入/退出拖动模式",
        }, (dragMode.value ? "✥ 拖动中 " : "⠿ ") + (props.persona || "看板娘")),
        !loaded.value && props.avatar
          ? h("img", { class: "pet-frame-placeholder", src: props.avatar, alt: props.persona })
          : null,
        h("iframe", {
          class: "pet-frame-body",
          src: "/live2d-pet.html?model=" + encodeURIComponent(modelUrl.value),
          title: props.persona || "pet",
          scrolling: "no",
          onLoad: () => window.setTimeout(() => (loaded.value = true), 600),
        }),
        h("div", { class: "pet-frame-tools" }, [
          h("select", {
            class: "pet-frame-select",
            title: "换装",
            value: modelUrl.value,
            onChange: (e: Event) => { modelUrl.value = (e.target as HTMLSelectElement).value; loaded.value = false; save(); },
          }, MODELS.map((m) => h("option", { value: m.url }, m.label))),
          h("button", { class: "pet-frame-btn", onClick: () => window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.personaId, persona: props.persona } })) }, "聊"),
          h("button", { class: "pet-frame-btn", onClick: () => (hidden.value = true) }, "藏"),
        ]),
      ]);
  },
});
