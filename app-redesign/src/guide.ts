import { defineComponent, h, onMounted, ref } from "vue";
import { api, errorText } from "./api";

type Section = { id: string; title: string; summary: string; steps: string[] };

export default defineComponent({
  props: { onStartTutorial: { type: Function, default: null } },
  setup(props) {
    const sections = ref<Section[]>([]);
    const loading = ref(true);
    const error = ref("");
    onMounted(async () => {
      try {
        const r = await api<{ sections: Section[] }>("/guide", "GET", undefined, { timeoutMs: 10000 });
        sections.value = Array.isArray(r.sections) ? r.sections : [];
      } catch (e) { error.value = errorText(e); }
      finally { loading.value = false; }
    });
    return () => h("div", { class: "guide-page" }, [
      h("header", { class: "scene-heading" }, [
        h("span", { class: "eyebrow" }, "PROJECT GUIDE"),
        h("h1", "项目介绍"),
        h("p", "不知道某个按钮是做什么的？先在这里按板块看说明；也可以直接问 AI 伙伴，它会调用项目说明工具。"),
        props.onStartTutorial
          ? h("button", { class: "guide-tutorial-btn", onClick: () => props.onStartTutorial?.() }, "🎓 重新开始新手教程")
          : null,
      ]),
      h("div", { class: "notice" }, "顶部“功能说明”随时可回到这里。项目说明是页面内容，不是 RAG 检索；功能变化时只需改一处说明。"),
      error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
      loading.value ? h("p", { role: "status" }, "正在读取项目说明…") : null,
      h("div", { class: "guide-grid" }, sections.value.map((s) => h("article", { class: "card guide-card", id: "guide-" + s.id }, [
        h("h2", s.title),
        h("p", s.summary),
        h("ol", s.steps.map((x) => h("li", x))),
      ]))),
      h("p", { class: "muted" }, "这份说明也提供给 AI 的 project_guide 工具；用户问功能时 AI 会返回这里的真实内容，而不是编造。"),
    ]);
  },
});
