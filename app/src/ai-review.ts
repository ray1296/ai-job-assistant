import { defineComponent, h, ref } from "vue";
import { api, errorText } from "./api";
import { withoutPhotos } from "./resume-model";

interface Suggestion {
  id: string;
  field: string;
  before: string;
  after: string;
  reason: string;
  evidence: string;
}

export default defineComponent({
  props: {
    document: { type: Object, required: true },
    onApply: { type: Function, required: true },
    /** 审阅开始前的可选动作（例如按开关生成生图装饰） */
    onBefore: { type: Function, required: false },
    disabled: Boolean,
  },
  setup(props) {
    const prompt = ref("");
    const busy = ref(false);
    const error = ref("");
    const notice = ref("");
    const suggestions = ref<Suggestion[]>([]);
    const selected = ref<string[]>([]);

    async function review() {
      if (busy.value || props.disabled) return;
      busy.value = true; error.value = ""; notice.value = "";
      try {
        // 先执行可选的前置动作（生图装饰），再做内容审阅
        if (props.onBefore) await props.onBefore();
        // AI 审阅耗时远超 api() 的 12s 默认超时，必须显式放宽。
        const r = await api("/ai/resume-review", "POST", { document: withoutPhotos(props.document as any), prompt: prompt.value }, { timeoutMs: 150000 });
        suggestions.value = r.suggestions;
        selected.value = [];
        notice.value = suggestions.value.length
          ? "建议已生成。请编辑建议文本，检查原文依据后选择采纳。"
          : "AI未提出可核对建议；当前文档未改变";
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }

    function updateAfter(id: string, after: string) {
      suggestions.value = suggestions.value.map(s => s.id === id ? { ...s, after } : s);
    }
    function apply() {
      const chosen = suggestions.value.filter(s => selected.value.includes(s.id) && s.after.trim());
      if (!chosen.length) return;
      try { props.onApply(chosen); } catch (e) { error.value = errorText(e); return; }
      suggestions.value = suggestions.value.filter(s => !selected.value.includes(s.id));
      selected.value = [];
      notice.value = "已将选中建议写入本地草稿，尚未保存服务器版本";
    }

    return () => h("section", { class: "ai-review-panel", "aria-label": "AI简历审阅与优化" }, [
      h("h3", "AI 内容审阅与优化（逐项确认）"),
      h("p", "AI先标出问题并提出可编辑文本；只有你明确勾选并采纳后，内容才会写入本地草稿。"),
      h("textarea", { value: prompt.value, placeholder: "例如：针对前端岗位检查成果表达，但不要编造指标", "aria-label": "AI审阅要求", maxlength: 1000, onInput: (e: Event) => prompt.value = (e.target as HTMLTextAreaElement).value }),
      h("button", { class: "primary", disabled: busy.value || props.disabled, onClick: review }, busy.value ? "AI处理中…" : "开始审阅并生成优化建议"),
      ...suggestions.value.map(s => h("article", { class: "ai-suggestion", key: s.id }, [
        h("label", [h("input", { type: "checkbox", checked: selected.value.includes(s.id), onChange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; selected.value = on ? [...selected.value, s.id] : selected.value.filter(id => id !== s.id); } }), "采纳此项"]),
        h("strong", s.field),
        h("p", [h("span", { class: "ai-before" }, "原文：" + s.before), h("label", { class: "ai-after-edit" }, ["建议文本（可编辑）：", h("textarea", { value: s.after, "aria-label": "编辑建议文本", onInput: (e: Event) => updateAfter(s.id, (e.target as HTMLTextAreaElement).value) })])]),
        h("small", "理由：" + s.reason + (s.evidence ? " · 依据：" + s.evidence : "")),
      ])),
      suggestions.value.length ? h("button", { onClick: apply, disabled: !selected.value.length }, "采纳选中建议（写入本地草稿）") : null,
      error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
      notice.value ? h("p", { class: "notice", role: "status" }, notice.value) : null,
      h("small", "未配置AI服务时会明确提示不可用；不会自动保存或伪造结果。"),
    ]);
  },
});
