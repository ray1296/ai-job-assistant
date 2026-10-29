import { defineComponent, h, ref, onMounted, onBeforeUnmount } from "vue";

const STORE = "zg.petFrames.v3";
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
    const pos = ref(saved.pos || { x: Math.max(8, 160 + props.slot * 250), y: Math.max(80, window.innerHeight - 260) });
    const modelUrl = ref(saved.model || props.model);
    const live = ref(false);       // 只有聚焦的这只跑真实运行时
    const snapshot = ref(saved.snapshot || "");  // 冻结帧（切走后保留画面）
    const hidden = ref(false);
    const iframeEl = ref<HTMLIFrameElement | null>(null);

    const save = () => {
      const all = read();
      all[props.id] = { pos: pos.value, model: modelUrl.value, snapshot: snapshot.value };
      write(all);
    };

    function capture() {
      try {
        const doc = iframeEl.value?.contentDocument;
        const cv = doc?.querySelector("canvas") as HTMLCanvasElement | null;
        if (cv) snapshot.value = cv.toDataURL("image/png");
      } catch {}
    }
    function activate() {
      window.dispatchEvent(new CustomEvent("zg:pet-activate", { detail: { id: props.id } }));
    }
    function onGlobalActivate(ev: any) {
      if (ev?.detail?.id === props.id) {
        live.value = true;
      } else if (live.value) {
        capture();
        live.value = false;
        save();
      }
    }
    function startDrag(e: MouseEvent) {
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
    function onMessage(ev: MessageEvent) {
      if (ev?.data?.type === "zg-pet-click") {
        window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.personaId, persona: props.persona } }));
      }
    }
    onMounted(() => {
      window.addEventListener("zg:pet-activate", onGlobalActivate);
      window.addEventListener("message", onMessage);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("zg:pet-activate", onGlobalActivate);
      window.removeEventListener("message", onMessage);
    });

    return () =>
      h("div", { class: "pet-frame", style: { left: pos.value.x + "px", top: pos.value.y + "px", display: hidden.value ? "none" : "block" } }, [
        h("div", { class: "pet-frame-handle", onMousedown: startDrag, title: "按住拖动" }, "⠿ " + (props.persona || "看板娘")),
        live.value
          ? h("iframe", {
              ref: iframeEl,
              class: "pet-frame-body",
              src: "/live2d-pet.html?model=" + encodeURIComponent(modelUrl.value),
              title: props.persona || "pet",
              scrolling: "no",
            })
          : h("div", { class: "pet-frame-stage", onClick: activate, title: "点击唤醒看板娘" }, [
              snapshot.value
                ? h("img", { class: "pet-frame-img", src: snapshot.value, alt: props.persona })
                : h("img", { class: "pet-frame-img", src: props.avatar, alt: props.persona }),
              h("span", { class: "pet-frame-badge" }, snapshot.value ? "点击唤醒" : "待唤醒"),
            ]),
        h("div", { class: "pet-frame-tools" }, [
          h("select", {
            class: "pet-frame-select",
            value: modelUrl.value,
            onChange: (e: Event) => { modelUrl.value = (e.target as HTMLSelectElement).value; snapshot.value = ""; live.value = true; save(); },
          }, MODELS.map((m) => h("option", { value: m.url }, m.label))),
          h("button", { class: "pet-frame-btn", onClick: () => { activate(); window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.personaId, persona: props.persona } })); } }, "聊"),
          h("button", { class: "pet-frame-btn", onClick: () => { hidden.value = true; } }, "藏"),
        ]),
      ]);
  },
});
