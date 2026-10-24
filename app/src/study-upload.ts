import { defineComponent, h, ref, onMounted } from "vue";
import { api, errorText } from "./api";

export default defineComponent({
  setup() {
    const subjects = ref<any[]>([]);
    const directions = ref<any[]>([]);
    const target = ref("");
    const newSubject = ref("");
    const versionName = ref("");
    const mode = ref<"catalog" | "file">("catalog");
    const direction = ref("");
    const preview = ref<{ stem: string; answer: string }[]>([]);
    const fileName = ref("");
    const busy = ref(false);
    const error = ref("");
    const notice = ref("");

    async function load() {
      try {
        const r = await api<any>("/study/subjects", "GET", undefined, { timeoutMs: 30000 });
        subjects.value = (r.subjects || []).filter((s: any) => !s.isSystem);
        directions.value = r.directions || [];
        if (!direction.value && directions.value[0]) direction.value = directions.value[0].name;
        if (!target.value && subjects.value[0]) target.value = subjects.value[0].id;
      } catch (e) { error.value = errorText(e); }
    }
    onMounted(load);

    async function readFile(file: File) {
      fileName.value = file.name;
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const rows = lines.map((l) => {
        const parts = l.split(/\t|\||,{2,}/);
        return parts.length >= 2 ? { stem: parts[0], answer: parts.slice(1).join(" ") } : { stem: l, answer: "" };
      }).filter((x) => x.stem.length > 1);
      preview.value = rows.slice(0, 200);
      if (!versionName.value) versionName.value = file.name.replace(/\.[^.]+$/, "");
      versionName.value = versionName.value || ("上传 " + new Date().toLocaleDateString("zh-CN"));
    }
    function onPick(e: Event) {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) void readFile(f);
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) void readFile(f);
    }
    async function submit() {
      if (busy.value) return;
      busy.value = true; error.value = ""; notice.value = "";
      try {
        let subjectId = target.value;
        if (newSubject.value.trim()) {
          const r = await api<any>("/study/subjects", "POST", { name: newSubject.value.trim() }, { timeoutMs: 20000 });
          subjectId = r.subject.id;
        }
        if (!subjectId) throw new Error("请先选择或新建一个科目");
        const payload: any = { name: versionName.value || "未命名版本" };
        if (mode.value === "catalog") {
          payload.fromCatalog = direction.value;
          payload.limit = 120;
          payload.source = "平台面经题库 · " + direction.value;
        } else {
          if (!preview.value.length && !preview.value.length) throw new Error("请先选择一个题库文件");
          let rows = preview.value;
          if (!rows.length) {
            // 允许提交文件但未预览
            throw new Error("文件里没有识别到题目");
          }
          payload.questions = rows.map((x) => ({ type: "short", stem: x.stem, answer: x.answer }));
          payload.source = "上传 " + fileName.value;
        }
        const r = await api<any>("/study/subjects/" + subjectId + "/versions", "POST", payload, { timeoutMs: 90000 });
        notice.value = "导入成功：" + r.version.name + "（" + r.version.total + " 题）";
        await load();
        preview.value = [];
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }

    return () =>
      h("div", { class: "proto-page study-upload" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "IMPORT YOUR QUESTIONS"),
          h("h1", "上传题库"),
          h("p", "选择科目 → 选择来源 → 预览 → 导入。支持从平台面经库导入，或上传自己的题目文件。"),
        ]),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
        notice.value ? h("p", { class: "notice", role: "status" }, notice.value) : null,
        h("section", { class: "card upload-step" }, [
          h("h3", "① 选择科目"),
          h("div", { class: "upload-row" }, [
            h("select", { class: "map-input", value: target.value, onChange: (e: Event) => (target.value = (e.target as HTMLSelectElement).value) },
              subjects.value.length
                ? subjects.value.map((s) => h("option", { value: s.id }, s.name))
                : [h("option", { value: "" }, "还没有自己的科目")]),
            h("input", { class: "map-input", placeholder: "或新建科目名", value: newSubject.value, onInput: (e: Event) => (newSubject.value = (e.target as HTMLInputElement).value) }),
          ]),
        ]),
        h("section", { class: "card upload-step" }, [
          h("h3", "② 选择来源"),
          h("div", { class: "upload-modes" }, [
            h("button", { class: "btn" + (mode.value === "catalog" ? " primary" : ""), onClick: () => (mode.value = "catalog") }, "平台面经题库"),
            h("button", { class: "btn" + (mode.value === "file" ? " primary" : ""), onClick: () => (mode.value = "file") }, "上传文件"),
          ]),
          mode.value === "catalog"
            ? h("div", { class: "upload-row" }, [
                h("select", { class: "map-input", value: direction.value, onChange: (e: Event) => (direction.value = (e.target as HTMLSelectElement).value) },
                  directions.value.map((d) => h("option", { value: d.name }, d.name + "（" + d.count + " 题）"))),
                h("span", { class: "muted" }, "每次导入前 120 题"),
              ])
            : h("div", { class: "upload-drop", onDragover: (e: DragEvent) => e.preventDefault(), onDrop }, [
                h("p", "把 .txt / .csv / .md 拖到这里，或"),
                h("input", { type: "file", accept: ".txt,.csv,.md", onChange: onPick }),
                h("small", "每行一题，题目与答案用 Tab 或 | 分隔；没有答案也行，之后可用 AI 生成简化答案。"),
              ]),
        ]),
        h("section", { class: "card upload-step" }, [
          h("h3", "③ 版本与预览"),
          h("input", { class: "map-input", placeholder: "版本名，例如：第一次模拟", value: versionName.value, onInput: (e: Event) => (versionName.value = (e.target as HTMLInputElement).value) }),
          preview.value.length
            ? h("div", { class: "upload-preview" }, [
                h("small", "预览前 " + Math.min(preview.value.length, 8) + " 条，共 " + preview.value.length + " 题"),
                h("div", { class: "table" }, preview.value.slice(0, 8).map((x, i) =>
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "28px 1fr 1fr" } }, [
                    h("span", String(i + 1)), h("span", x.stem), h("span", x.answer || "—"),
                  ]))),
              ])
            : null,
          h("div", { class: "upload-actions" }, [
            h("button", { class: "btn primary", disabled: busy.value, onClick: () => void submit() }, busy.value ? "导入中…" : "确认导入"),
            h("a", { class: "btn", href: "#practice" }, "去刷题 →"),
          ]),
        ]),
      ]);
  },
});
