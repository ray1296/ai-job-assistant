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
    decorEnabled: Boolean,
    decorBusy: Boolean,
    decorCount: { type: Number, default: 0 },
    decorStyle: { type: String, default: "auto" },
    decorError: { type: String, default: "" },
    onDecorChange: { type: Function, required: false },
    /** 单独触发生图装饰（与文本审阅解耦） */
    onDecorGenerate: { type: Function, required: false },
    onDecorStyle: { type: Function, required: false },
    onClearDecor: { type: Function, required: false },
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
      h("label", { class: "ai-review-prompt" }, [
        h("span", "补充审阅要求（可选）"),
        h("small", "默认优化当前选中的简历；有特殊要求可以填写，没有可留空。"),
        h("textarea", {
          value: prompt.value,
          placeholder: "默认优化当前选中的简历；有特殊要求可填写，没有可留空。例如：目标岗位是 Agent 开发，重点检查项目成果表达，不要编造指标",
          "aria-label": "补充审阅要求（可选）",
          maxlength: 1000,
          onInput: (e: Event) => prompt.value = (e.target as HTMLTextAreaElement).value,
        }),
      ]),
      h("div", { class: "ai-decor-row" }, [
        h("button", {
          type: "button",
          class: "ai-decor-btn",
          disabled: busy.value || props.decorBusy || props.disabled,
          title: "只生成整页装饰背景，不改动简历文字内容",
          onClick: () => props.onDecorGenerate?.(),
        }, props.decorBusy ? "正在生成装饰…" : "AI 生图装饰"),
        h("span", { class: "ai-decor-style" }, [
          "风格",
          h("select", {
            value: props.decorStyle,
            disabled: busy.value || props.decorBusy || props.disabled,
            "aria-label": "装饰风格",
            onChange: (e: Event) => props.onDecorStyle?.((e.target as HTMLSelectElement).value),
          }, [
            ["auto", "AI 自动适配"],
            ["minimal", "极简"],
            ["maximal", "极繁"],
            ["tech", "科技"],
          ].map(([value, label]) => h("option", { value }, label))),
        ]),
      ]),
      props.decorCount && props.onClearDecor
        ? h("div", { class: "ai-decor-status" }, [
            h("span", props.decorCount === 1 ? "已生成整页背景装饰" : "已生成 " + props.decorCount + " 张装饰图"),
            h("button", { type: "button", disabled: busy.value || props.decorBusy, onClick: () => props.onClearDecor?.() }, "移除装饰"),
          ])
        : null,
      props.decorError ? h("p", { class: "error", role: "alert" }, props.decorError) : null,
      h("button", { class: "primary", disabled: busy.value || props.decorBusy || props.disabled, onClick: review }, busy.value || props.decorBusy ? "AI处理中…" : "开始审阅并生成优化建议"),
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
      busy.value || props.decorBusy
        ? h("div", { class: "ai-work-overlay", role: "dialog", "aria-modal": "true", "aria-live": "polite" },
            h("div", { class: "ai-work-card" }, [
              h("span", { class: "ai-work-spinner" }),
              h("strong", "AI 正在工作"),
              h("p", null, props.decorBusy
                ? "正在读取简历版面并生成整页背景，通常需要几十秒…"
                : "正在审阅简历内容并生成可核对建议，通常需要十几秒…"),
              h("small", null, "请先不要关闭页面；完成后会回到简历，不会自动保存未确认的内容。"),
            ]))
        : null,
    ]);
  },
});
