import { defineComponent, h, ref, onMounted } from "vue";

const STORE = "zg.companions.v3";
const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || "{}"); } catch { return {}; } };

export default defineComponent({
  setup() {
    const saved = read();
    const togglePos = ref(saved.togglePos || { x: Math.max(12, window.innerWidth - 96), y: Math.max(90, window.innerHeight - 150) });
    const form = ref<"avatar" | "live2d">(saved.form || "live2d");

    const save = () => {
      try {
        localStorage.setItem(STORE, JSON.stringify({ togglePos: togglePos.value, form: form.value }));
      } catch {}
    };
    function setForm(f: "avatar" | "live2d") {
      form.value = f;
      document.body.classList.toggle("show-live2d", f === "live2d");
      save();
    }
    function startDrag(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ox = togglePos.value.x, oy = togglePos.value.y;
      let moved = false;
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        togglePos.value = { x: ox + dx, y: oy + dy };
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (moved) save();
        else {
          document.body.classList.toggle("zg-pets-hidden");
          window.dispatchEvent(new CustomEvent("zg:pets-toggle"));
        }
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up, { once: true });
    }

    onMounted(() => {
      if (form.value === "live2d") document.body.classList.add("show-live2d");
      // 其它入口（看板娘点击 / 外部按钮）请求打开某个 agent 时，交给对应的 chip 对话框。
      window.addEventListener("zg:open-persona", (ev: any) => {
        const id = ev?.detail?.personaId;
        if (id) window.dispatchEvent(new CustomEvent("zg:toggle-chat", { detail: { agentId: id, open: true } }));
      });
    });

    return () =>
      h("div", { class: "companions-v3" }, [
        h("button", {
          class: "companions-form",
          style: { left: togglePos.value.x + "px", top: (togglePos.value.y + 40) + "px" },
          title: "切换看板娘形态（Live2D / 立绘）",
          onClick: () => {
            const nf = form.value === "live2d" ? "avatar" : "live2d";
            setForm(nf);
            window.dispatchEvent(new CustomEvent("zg:pet-skin", { detail: { skin: nf } }));
          },
        }, form.value === "live2d" ? "⇄ 立绘" : "⇄ Live2D"),
        h("button", {
          class: "companions-dial",
          style: { left: togglePos.value.x + "px", top: togglePos.value.y + "px" },
          onMousedown: startDrag,
          title: "单击显示/隐藏看板娘，按住可拖动",
        }, "✦"),
      ]);
  },
});
