import { defineComponent, h, ref, nextTick, watch } from "vue";
export default defineComponent({
  props: {
    value: { type: String, default: "" },
    label: { type: String, required: true },
    placeholder: { type: String, default: "双击填写" },
    tag: { type: String, default: "p" },
    multiline: { type: Boolean, default: false },
    max: { type: Number, default: 12000 },
    disabled: { type: Boolean, default: false },
    onCommit: { type: Function, required: true },
    onEditing: { type: Function, required: true },
  },
  setup(props) {
    const element = ref<HTMLElement | null>(null),
      editing = ref(false),
      message = ref("");
    let original = "",
      composing = false;
    watch(
      () => props.value,
      (v) => {
        if (!editing.value && element.value) element.value.textContent = v;
      },
    );
    function value() {
      return (element.value?.innerText || "")
        .replaceAll("\u00a0", " ")
        .replace(/\r\n?/g, "\n");
    }
    async function begin(e?: MouseEvent) {
      if (editing.value || props.disabled) return;
      original = props.value;
      message.value = "";
      editing.value = true;
      props.onEditing(true, false);
      await nextTick();
      const el = element.value!;
      el.textContent = original;
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        let r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        if (e) {
          const nativeDocument = document as any;
          const point = nativeDocument.caretPositionFromPoint?.(
            e.clientX,
            e.clientY,
          );
          const located = nativeDocument.caretRangeFromPoint?.(
            e.clientX,
            e.clientY,
          );
          if (point && el.contains(point.offsetNode)) {
            r.setStart(point.offsetNode, point.offset);
            r.collapse(true);
          } else if (located && el.contains(located.startContainer)) {
            r = located;
            r.collapse(true);
          }
        }
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    function finish(cancel = false) {
      if (!editing.value) return;
      const v = cancel ? original : value();
      if (v.length > props.max) {
        message.value = "最多" + props.max + "字，请缩短后提交";
        element.value?.focus();
        return;
      }
      editing.value = false;
      if (element.value) element.value.textContent = v;
      if (!cancel && v !== original) props.onCommit(v);
      props.onEditing(false, false);
      message.value = "";
    }
    function insert(text: string) {
      const el = element.value!;
      const sel = window.getSelection();
      if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return;
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const n = document.createTextNode(text);
      r.insertNode(n);
      r.setStartAfter(n);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      props.onEditing(true, true);
    }
    return () =>
      h("div", { class: "inline-field-wrap" }, [
        h(
          props.tag,
          {
            ref: element,
            class: [
              "inline-field",
              editing.value ? "is-editing" : "",
              !props.value && !editing.value ? "is-empty" : "",
            ],
            tabindex: 0,
            role: "textbox",
            "aria-label": props.label,
            "aria-multiline": props.multiline,
            "aria-readonly": !editing.value,
            "data-placeholder": props.placeholder,
            contenteditable: editing.value ? "plaintext-only" : "false",
            spellcheck: false,
            onDblclick: begin,
            onBlur: () => finish(),
            onCompositionstart: () => (composing = true),
            onCompositionend: () => {
              composing = false;
              props.onEditing(true, true);
            },
            onInput: () => props.onEditing(true, true),
            onKeydown: (e: KeyboardEvent) => {
              if (e.isComposing || composing) return;
              if (!editing.value) {
                if (e.key === "Enter" || e.key === "F2") {
                  e.preventDefault();
                  begin();
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                finish(true);
              } else if (
                e.key === "Enter" &&
                (!props.multiline || e.ctrlKey || e.metaKey || !e.shiftKey)
              ) {
                e.preventDefault();
                finish();
              }
            },
            onPaste: (e: ClipboardEvent) => {
              if (!editing.value) return;
              e.preventDefault();
              const raw = e.clipboardData?.getData("text/plain") || "";
              const selected = window.getSelection()?.toString().length || 0;
              if (value().length - selected + raw.length > props.max) {
                message.value = "粘贴内容太长，请分段粘贴";
                return;
              }
              insert(props.multiline ? raw : raw.replace(/[\r\n]+/g, " "));
            },
            onDrop: (e: DragEvent) => e.preventDefault(),
          },
          props.value,
        ),
        editing.value
          ? h(
              "span",
              { class: "inline-edit-hint" },
              props.multiline
                ? "回车确认 · Shift+回车换行 · Esc取消"
                : "回车确认 · Esc取消",
            )
          : null,
        message.value
          ? h("span", { class: "field-error", role: "alert" }, message.value)
          : null,
      ]);
  },
});
