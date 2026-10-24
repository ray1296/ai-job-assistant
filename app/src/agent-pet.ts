export const PET_MODELS = [
  { url: "/live2d/live2d-widget-models/live2d-widget-model-shizuku/assets/shizuku.model.json", label: "静流" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-koharu/assets/koharu.model.json", label: "小春" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-haruto/assets/haruto.model.json", label: "春人" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-miku/assets/miku.model.json", label: "未来" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-chitose/assets/chitose.model.json", label: "千岁" },
  { url: "/live2d/live2d-widget-models/live2d-widget-model-haru/01/assets/haru01.model.json", label: "春" },
];

import { defineComponent, h, ref, onMounted, onBeforeUnmount } from "vue";

const STORE = "zg.agents.v1";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };
const write = (v: any) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };
const skinNow = () => (localStorage.getItem("zg.petSkin") || "live2d");

export default defineComponent({
  props: {
    agentId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "" },
    avatar: { type: String, required: true },
    models: { type: Array as any, required: true },
    slot: { type: Number, default: 0 },
  },
  setup(props) {
    const saved = read()[props.agentId] || {};
    const pos = ref(saved.pos || {
      x: Math.max(8, 30 + props.slot * 210),
      y: Math.max(80, window.innerHeight - 330),
    });
    const modelUrl = ref(saved.model || (props.models as any[])[0]?.url || "");
    const skin = ref(skinNow());
    const live = ref(false);
    const snapshot = ref(saved.snapshot || "");
    const hidden = ref(false);
    const busy = ref(false);
    const iframeEl = ref<HTMLIFrameElement | null>(null);

    const persist = () => {
      const all = read();
      all[props.agentId] = { pos: pos.value, model: modelUrl.value, snapshot: snapshot.value };
      write(all);
    };
    function capture() {
      try {
        const cv = iframeEl.value?.contentDocument?.querySelector("canvas") as HTMLCanvasElement | null;
        if (cv) snapshot.value = cv.toDataURL("image/png");
      } catch {}
    }
    function wake() {
      if (skin.value !== "live2d") return;
      if (live.value) return;
      live.value = true;
    }
    function setSkin(next: string) {
      if (next === "avatar") { capture(); live.value = false; }
      skin.value = next;
      persist();
    }
    function startDrag(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ox = pos.value.x, oy = pos.value.y;
      const move = (ev: MouseEvent) => {
        pos.value = { x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) };
      };
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); persist(); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    }
    function openChat() {
      window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: props.agentId, persona: props.name } }));
    }
    function onMessage(ev: MessageEvent) {
      if (ev?.data?.type === "zg-pet-click") openChat();
    }
    function onSkin(ev: any) { setSkin(ev?.detail?.skin || skinNow()); }
    function onPetActivate(ev: any) {
      if (ev?.detail?.id !== props.agentId && live.value) { capture(); live.value = false; persist(); }
    }
    onMounted(() => {
      window.addEventListener("message", onMessage);
      window.addEventListener("zg:pet-skin", onSkin);
      window.addEventListener("zg:pet-activate", onPetActivate);
      if (skin.value === "live2d" && props.slot === 0) wake();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("zg:pet-skin", onSkin);
      window.removeEventListener("zg:pet-activate", onPetActivate);
    });

    return () =>
      h("div", { class: "agent-pet", style: { left: pos.value.x + "px", top: pos.value.y + "px", display: hidden.value ? "none" : "block" } }, [
        h("div", { class: "agent-pet-handle", onMousedown: startDrag, title: "按住拖动" }, "⠿ " + props.name),
        skin.value === "avatar"
          ? h("div", { class: "agent-pet-stage", onClick: openChat, title: "点击和 " + props.name + " 说话" }, [
              h("img", { class: "agent-pet-img", src: props.avatar, alt: props.name }),
              h("span", { class: "agent-pet-badge" }, props.role),
            ])
          : live.value
            ? h("iframe", {
                ref: iframeEl,
                class: "agent-pet-body",
                src: "/live2d-pet.html?model=" + encodeURIComponent(modelUrl.value),
                title: props.name,
                scrolling: "no",
              })
            : h("div", { class: "agent-pet-stage", onClick: wake, title: "点击唤醒" }, [
                h("img", { class: "agent-pet-img", src: snapshot.value || props.avatar, alt: props.name }),
                h("span", { class: "agent-pet-badge" }, snapshot.value ? "点击唤醒" : "待唤醒"),
              ]),
        h("div", { class: "agent-pet-tools" }, [
          h("select", {
            class: "agent-pet-select",
            value: modelUrl.value,
            onChange: (e: Event) => { modelUrl.value = (e.target as HTMLSelectElement).value; snapshot.value = ""; live.value = true; persist(); },
          }, (props.models as any[]).map((m: any) => h("option", { value: m.url }, m.label))),
          h("button", { class: "agent-pet-btn", title: "切换形态", onClick: () => setSkin(skin.value === "live2d" ? "avatar" : "live2d") }, skin.value === "live2d" ? "立绘" : "Live2D"),
          h("button", { class: "agent-pet-btn", onClick: openChat }, "聊"),
          h("button", { class: "agent-pet-btn", onClick: () => (hidden.value = true) }, "藏"),
        ]),
      ]);
  },
});
