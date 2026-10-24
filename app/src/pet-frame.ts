import { defineComponent, h, ref } from "vue";

const STORE = "zg.petFrames.v1";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };

export default defineComponent({
  props: {
    id: { type: String, required: true },
    model: { type: String, required: true },
    persona: { type: String, default: "" },
    personaId: { type: String, default: "" },
    slot: { type: Number, default: 0 },
  },
  setup(props) {
    const saved = read()[props.id];
    const pos = ref(saved || {
      x: Math.max(8, 250 + props.slot * 240),
      y: Math.max(80, window.innerHeight - 390),
    });
    const save = () => {
      try {
        const all = read();
        all[props.id] = pos.value;
        localStorage.setItem(STORE, JSON.stringify(all));
      } catch {}
    };
    function down(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ox = pos.value.x, oy = pos.value.y;
      const move = (ev: MouseEvent) => {
        pos.value = {
          x: Math.max(0, Math.min(window.innerWidth - 80, ox + ev.clientX - sx)),
          y: Math.max(0, Math.min(window.innerHeight - 80, oy + ev.clientY - sy)),
        };
      };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); save(); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    return () =>
      h("div", { class: "pet-frame", style: { left: pos.value.x + "px", top: pos.value.y + "px" } }, [
        h("div", { class: "pet-frame-handle", onMousedown: down, title: "拖动移动看板娘" }, "⠿ " + (props.persona || "看板娘")),
        h("iframe", { class: "pet-frame-body", src: "/live2d-pet.html?model=" + encodeURIComponent(props.model), title: props.persona || "pet", scrolling: "no" }),
        h("button", {
          class: "pet-frame-chat",
          onClick: () => window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.personaId, persona: props.persona } })),
        }, "和 " + (props.persona || "TA") + " 聊"),
      ]);
  },
});
