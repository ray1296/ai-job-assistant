import { defineComponent, h, ref, onMounted, onUnmounted, nextTick } from "vue";
import { api, errorText } from "./api";
import InlineEdit from "./inline-edit";
import ResumeImport from "./resume-import";
import AiReview from "./ai-review";
import {
  blankDocument,
  fromLegacy,
  fromProfile,
  plainText,
  clone,
  entry,
  uid,
  type Resume,
  type ResumeDocument,
  type Section,
} from "./resume-model";
export default defineComponent({
  props: { onDirty: { type: Function, required: true } },
  setup(props) {
    const versions = ref<Resume[]>([]),
      current = ref<Resume | null>(null),
      doc = ref(blankDocument()),
      title = ref(""),
      busy = ref(false),
      loading = ref(true),
      error = ref(""),
      notice = ref(""),
      dirty = ref(false),
      editing = ref(false),
      editDirty = ref(false),
      undoStack = ref<string[]>([]),
      redoStack = ref<string[]>([]),
      sectionName = ref(""),
      panel = ref(""),
      decoration = ref(false),
      aiPrompt = ref(""),
      layoutBusy = ref(false),
      layoutSuggestion = ref<any>(null);
    let saved = "";
    const snapshot = () =>
      JSON.stringify({ title: title.value, document: doc.value });
    function updateDirty() {
      dirty.value = snapshot() !== saved;
      props.onDirty(dirty.value || editDirty.value);
    }
    function change(action: () => void) {
      const old = snapshot();
      action();
      if (old === snapshot()) return;
      undoStack.value.push(old);
      if (undoStack.value.length > 60) undoStack.value.shift();
      redoStack.value = [];
      updateDirty();
    }
    function restore(s: string) {
      const x = JSON.parse(s);
      title.value = x.title;
      doc.value = x.document;
      updateDirty();
    }
    function undo() {
      if (editing.value || !undoStack.value.length) return;
      redoStack.value.push(snapshot());
      restore(undoStack.value.pop()!);
    }
    function redo() {
      if (editing.value || !redoStack.value.length) return;
      undoStack.value.push(snapshot());
      restore(redoStack.value.pop()!);
    }
    function flush() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.isContentEditable) el.blur();
      return !editing.value;
    }
    function canLeave() {
      return (
        (!dirty.value && !editDirty.value) ||
        confirm("当前文档有未保存修改，确认放弃？")
      );
    }
    function install(r: Resume | null) {
      current.value = r;
      title.value = r?.title || "";
      doc.value = r?.body.document
        ? clone(r.body.document)
        : fromLegacy(r?.body.text || "");
      saved = snapshot();
      dirty.value = false;
      editing.value = false;
      editDirty.value = false;
      props.onDirty(false);
      undoStack.value = [];
      redoStack.value = [];
    }
    async function refresh() {
      versions.value = (await api("/resumes")).resumes;
    }
    async function load(id: string) {
      if (busy.value || !flush() || !canLeave()) return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/resumes/" + id);
        install(r.resume);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    onMounted(async () => {
      try {
        await refresh();
        if (versions.value.length) await load(versions.value[0].id);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    });
    async function create(duplicate = false) {
      if (busy.value || !flush()) return;
      if (!duplicate && !canLeave()) return;
      busy.value = true;
      error.value = "";
      try {
        const document = duplicate ? clone(doc.value) : blankDocument();
        const r = await api("/resumes", "POST", {
          title: duplicate
            ? title.value + " · 副本"
            : "我的简历 · " + (versions.value.length + 1),
          body: { document },
        });
        install(r.resume);
        await refresh();
        notice.value = duplicate
          ? "已复制为独立版本"
          : "空白文档已创建，双击纸张中的文本开始填写";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    let layoutSource = "";
    async function recommendLayout() {
      if (!current.value || layoutBusy.value || !flush()) return;
      layoutBusy.value = true; error.value = ""; layoutSuggestion.value = null;
      const sent = JSON.stringify(doc.value);
      try {
        const r = await api("/ai/resume-layout", "POST", { document: doc.value, prompt: aiPrompt.value });
        if (JSON.stringify(doc.value) !== sent) throw Error("文档已变更，请针对最新内容重新生成布局建议");
        layoutSource = sent; layoutSuggestion.value = r.layout;
      } catch (e) { error.value = errorText(e); }
      finally { layoutBusy.value = false; }
    }
    function applyLayout() {
      const x = layoutSuggestion.value;
      if (!x || JSON.stringify(doc.value) !== layoutSource) { error.value = "文档已变更，请重新生成布局建议"; return; }
      change(() => { doc.value.layout = { template: x.template, fontSize: x.fontSize, accent: x.accent }; });
      layoutSuggestion.value = null; notice.value = "已应用到本地草稿，请检查后保存";
    }
    async function save() {
      if (!current.value || busy.value || !flush()) return;
      busy.value = true;
      error.value = "";
      notice.value = "";
      const sent = snapshot(),
        id = current.value.id;
      try {
        const r = await api("/resumes/" + id, "PUT", {
          title: title.value,
          body: { document: doc.value },
          revision: current.value.revision,
        });
        current.value = r.resume;
        saved = sent;
        updateDirty();
        await refresh();
        notice.value = dirty.value
          ? "上一稿已保存，保存期间的新修改仍待保存"
          : "当前版本已保存";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function remove() {
      if (
        !current.value ||
        busy.value ||
        !flush() ||
        !confirm("删除当前版本？此操作不可撤销。未保存修改也会删除。")
      )
        return;
      busy.value = true;
      error.value = "";
      try {
        await api("/resumes/" + current.value.id, "DELETE", {
          revision: current.value.revision,
        });
        install(null);
        await refresh();
        if (versions.value.length)
          install((await api("/resumes/" + versions.value[0].id)).resume);
        notice.value = "该版本已删除";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function importProfile() {
      if (busy.value || !flush()) return;
      if (
        plainText(doc.value)
          .replace(/教育经历|掌握技能|项目经历|实习与工作经历|荣誉与证书/g, "")
          .trim() &&
        !confirm(
          "从已保存的个人信息重新整理，会替换本文档。可以通过撤销恢复。继续？",
        )
      )
        return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/profile");
        if (!r.profile) throw new Error("请先填写并保存个人信息");
        change(() => (doc.value = fromProfile(r.profile)));
        notice.value = "已整理你保存的真实信息，请检查后保存；未调用AI";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    function edit(
      value: string,
      label: string,
      onCommit: (v: string) => void,
      tag = "p",
      placeholder = "双击填写",
      multiline = false,
      max = 12000,
    ) {
      return h(InlineEdit, {
        key: label,
        value,
        label,
        tag,
        placeholder,
        multiline,
        max,
        disabled: busy.value,
        onCommit: (v: string) => change(() => onCommit(v)),
        onEditing: (active: boolean, changed: boolean) => {
          editing.value = active;
          editDirty.value = active && changed;
          props.onDirty(dirty.value || editDirty.value);
        },
      });
    }
    function addSection() {
      const name = sectionName.value.trim();
      if (!name || name.length > 160 || doc.value.sections.length >= 24) return;
      change(() =>
        doc.value.sections.push({ id: uid(), title: name, items: [entry()] }),
      );
      sectionName.value = "";
      panel.value = "";
    }
    function move(i: number, delta: number) {
      if (i + delta < 0 || i + delta >= doc.value.sections.length) return;
      change(() => {
        const s = doc.value.sections.splice(i, 1)[0];
        doc.value.sections.splice(i + delta, 0, s);
      });
    }
    async function word() {
      if (!flush() || busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const { exportWord } = await import("./resume-export");
        await exportWord(clone(doc.value), title.value || "我的简历");
        notice.value = "Word已生成，文档在本机浏览器内处理，未上传外部服务";
      } catch (e) {
        error.value = "Word导出失败：" + errorText(e);
      } finally {
        busy.value = false;
      }
    }
    function print() {
      if (!flush()) return;
      panel.value = "";
      notice.value = "请在打印窗口选择“另存为PDF”；不是服务器自动生成PDF。";
      nextTick(() => window.print());
    }
    function keydown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !editing.value &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    }
    onMounted(() => window.addEventListener("keydown", keydown));
    onUnmounted(() => window.removeEventListener("keydown", keydown));
    function section(s: Section, index: number) {
      return h(
        "section",
        { key: s.id, class: "document-section", "data-section-id": s.id },
        [
          h("div", { class: "section-heading" }, [
            edit(
              s.title,
              "板块标题-" + s.id,
              (v) => (s.title = v),
              "h2",
              "双击填写板块名称",
              false,
              160,
            ),
            h("div", { class: "section-controls" }, [
              h(
                "button",
                {
                  title: "上移" + s.title,
                  "aria-label": "上移" + s.title,
                  disabled: index === 0,
                  onClick: () => move(index, -1),
                },
                "↑",
              ),
              h(
                "button",
                {
                  title: "下移" + s.title,
                  "aria-label": "下移" + s.title,
                  disabled: index === doc.value.sections.length - 1,
                  onClick: () => move(index, 1),
                },
                "↓",
              ),
              h(
                "button",
                {
                  title: "删除" + s.title,
                  "aria-label": "删除板块" + s.title,
                  onClick: () => {
                    if (
                      confirm("删除“" + s.title + "”及其内容？可通过撤销恢复。")
                    )
                      change(() => doc.value.sections.splice(index, 1));
                  },
                },
                "×",
              ),
            ]),
          ]),
          ...s.items.map((item, i) =>
            h("div", { key: item.id, class: "document-entry" }, [
              h("div", { class: "entry-line" }, [
                edit(
                  item.title,
                  "条目标题-" + item.id,
                  (v) => (item.title = v),
                  "h3",
                  s.title === "教育经历"
                    ? "双击填写学校 / 专业 / 学历"
                    : "双击填写名称 / 角色",
                  false,
                  240,
                ),
                edit(
                  item.meta,
                  "条目时间-" + item.id,
                  (v) => (item.meta = v),
                  "p",
                  "双击填写时间",
                  false,
                  200,
                ),
              ]),
              edit(
                item.content,
                "条目内容-" + item.id,
                (v) => (item.content = v),
                "p",
                "双击写下你的经历与成果，支持多行",
                true,
              ),
              s.items.length > 1
                ? h(
                    "button",
                    {
                      class: "entry-remove",
                      "aria-label": "删除条目" + (i + 1) + "-" + s.title,
                      onClick: () => {
                        if (confirm("删除此条目？可以撤销。"))
                          change(() => s.items.splice(i, 1));
                      },
                    },
                    "删除此条",
                  )
                : null,
            ]),
          ),
          h(
            "button",
            {
              class: "add-document-entry",
              disabled: s.items.length >= 40,
              onClick: () => change(() => s.items.push(entry())),
            },
            "＋ 添加" + s.title + "条目",
          ),
        ],
      );
    }
    return () =>
      h("div", { class: "resume-studio" }, [
        h("header", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "RESUME STUDIO"),
          h("h1", "简历工作室"),
          h(
            "p",
            "一张文档，直接打磨。双击任意文本开始编辑，回车确认，Esc取消。",
          ),
        ]),
        h(AiReview, {
          document: doc.value,
          disabled: busy.value || editing.value,
          onApply: (items: any[]) => {
            const targets: { object: any; key: string; suggestion: any }[] = [];
            for (const s of items) {
              if (!s.before?.trim() || !s.after?.trim()) throw Error("建议必须包含有效原文与修改内容");
              const matches: {object: any; key: string; path: string}[] = [];
              const scan = (object: any, key: string, path: string) => { if (object[key]?.includes(s.before)) matches.push({object, key, path}); };
              for (const key of ["name", "headline", "contact", "summary"]) scan(doc.value.header, key, "header." + key);
              doc.value.sections.forEach((section, si) => section.items.forEach((item, ii) => {
                for (const key of ["title", "meta", "content"]) scan(item, key, `sections.${si}.items.${ii}.${key}`);
              }));
              const path = String(s.field).replace(/^document\./, "");
              const exact = matches.filter(m => m.path === path);
              const explicit = /^(?:header\.|sections(?:\.|\[))/.test(path);
              const eligible = explicit ? exact : matches;
              if (eligible.length !== 1) throw Error("原文已变化或出现多处相同文本，请明确定位后重新审阅");
              const target = eligible[0];
              if (targets.some(t => t.object === target.object && t.key === target.key)) throw Error("同一字段有多条建议，请逐条采纳");
              targets.push({...target, suggestion: s});
            }
            change(() => { for (const t of targets) t.object[t.key] = t.object[t.key].replace(t.suggestion.before, t.suggestion.after); });
          },
        }),
        h("details", { class: "studio-import-toggle" }, [
          h("summary", "＋ 导入已有简历 · PDF / DOCX / 图片"),
          h(ResumeImport, {
            disabled: busy.value,
            onCreated: async (r: Resume) => {
              await refresh();
              if (flush() && canLeave()) install(r);
            },
          }),
        ]),
        h("div", { class: "resume-toolbar" }, [
          h("div", { class: "version-switch" }, [
            ...versions.value.map((v) =>
              h(
                "button",
                {
                  class: v.id === current.value?.id ? "selected" : "",
                  disabled: busy.value,
                  onClick: () => load(v.id),
                },
                v.title,
              ),
            ),
            h(
              "button",
              {
                class: "primary",
                disabled: busy.value,
                onClick: () => create(),
              },
              "＋ 新增版本",
            ),
          ]),
          h("div", { class: "actions" }, [
            h(
              "button",
              {
                disabled: !current.value,
                onClick: () => (panel.value = "layout"),
              },
              "✧ 调整布局 / 外观",
            ),
            h(
              "button",
              { disabled: !current.value || busy.value, onClick: word },
              "下载 Word",
            ),
            h(
              "button",
              { disabled: !current.value || busy.value, onClick: print },
              "下载 PDF",
            ),
          ]),
        ]),
        h("section", { class: "ai-help-strip" }, [
          h("div", { class: "ai-help-title" }, "✦ AI 助手能帮你"),
          h("div", { class: "ai-help-items" }, [
            h(
              "button",
              {
                disabled: !current.value,
                onClick: () => (panel.value = "ai-section"),
              },
              "＋ 描述新板块，AI 帮你添加",
            ),
          ]),
          h("label", { class: "decor-toggle" }, [
            h("input", {
              type: "checkbox",
              checked: decoration.value,
              onChange: (e: Event) => {
                decoration.value = (e.target as HTMLInputElement).checked;
                notice.value =
                  "已保留本次生图偏好；当前未接生图，不会发起调用或产生费用";
              },
            }),
            "生图装饰简历（可选，默认关闭）",
          ]),
          h("small", "AI与生图尚未接通；原有能力入口保留，未调用不会计费。"),
        ]),
        loading.value
          ? h("p", { role: "status" }, "正在读取你的文档…")
          : current.value
            ? h("div", [
                h("div", { class: "document-ribbon" }, [
                  h(
                    "div",
                    { class: "ribbon-menus" },
                    ["文件", "编辑", "排版", "模板"].map((label, i) =>
                      h(
                        "button",
                        {
                          "aria-expanded":
                            panel.value ===
                            ["file", "edit", "layout", "template"][i],
                          onClick: () =>
                            (panel.value =
                              panel.value ===
                              ["file", "edit", "layout", "template"][i]
                                ? ""
                                : ["file", "edit", "layout", "template"][i]),
                        },
                        label,
                      ),
                    ),
                  ),
                  h("span", "HTML 简历 · 双击原位编辑"),
                  h(
                    "span",
                    {
                      class:
                        dirty.value || editDirty.value ? "unsaved" : "saved",
                    },
                    dirty.value || editDirty.value
                      ? "● 有未保存修改"
                      : "✓ 版本已保存",
                  ),
                ]),
                panel.value
                  ? h("section", { class: "ribbon-panel" }, [
                      h(
                        "button",
                        {
                          class: "panel-close",
                          "aria-label": "关闭工具面板",
                          onClick: () => (panel.value = ""),
                        },
                        "×",
                      ),
                      panel.value.startsWith("ai-")
                        ? h("div", [
                            h("h3", "保留你的 AI 编辑需求"),
                            h(
                              "p",
                              "统一AI网关与可确认修改将在后续批次接入。此处目前不生成内容，也不会伪造修改结果。",
                            ),
                            h("textarea", {
                              value: aiPrompt.value,
                              placeholder:
                                "例如：增加开源贡献板块，保持事实不变…",
                              "aria-label": "AI编辑需求",
                              onInput: (e: Event) =>
                                (aiPrompt.value = (
                                  e.target as HTMLTextAreaElement
                                ).value),
                            }),
                            h(
                              "small",
                              "你现在可以用“编辑 → 新增板块”手动完成文档调整。",
                            ),
                          ])
                        : panel.value === "file"
                          ? h("div", { class: "panel-actions" }, [
                              h(
                                "button",
                                { disabled: busy.value, onClick: save },
                                "保存当前版本",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: () => create(true),
                                },
                                "复制为新版本",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: importProfile,
                                },
                                "从个人信息整理",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: () => load(current.value!.id),
                                },
                                "重新读取",
                              ),
                              h(
                                "button",
                                {
                                  class: "text-danger",
                                  disabled: busy.value,
                                  onClick: remove,
                                },
                                "删除当前版本",
                              ),
                              h("label", { class: "field" }, [
                                h("span", "版本名称"),
                                h("input", {
                                  "aria-label": "版本名称",
                                  value: title.value,
                                  maxlength: 120,
                                  onChange: (e: Event) =>
                                    change(
                                      () =>
                                        (title.value = (
                                          e.target as HTMLInputElement
                                        ).value),
                                    ),
                                }),
                              ]),
                            ])
                          : panel.value === "edit"
                            ? h("div", [
                                h("div", { class: "panel-actions" }, [
                                  h(
                                    "button",
                                    {
                                      disabled:
                                        !undoStack.value.length ||
                                        editing.value,
                                      onClick: undo,
                                    },
                                    "撤销",
                                  ),
                                  h(
                                    "button",
                                    {
                                      disabled:
                                        !redoStack.value.length ||
                                        editing.value,
                                      onClick: redo,
                                    },
                                    "重做",
                                  ),
                                ]),
                                h("div", { class: "inline add-section" }, [
                                  h("input", {
                                    value: sectionName.value,
                                    "aria-label": "新板块名称",
                                    placeholder: "例如：开源贡献",
                                    maxlength: 160,
                                    onInput: (e: Event) =>
                                      (sectionName.value = (
                                        e.target as HTMLInputElement
                                      ).value),
                                    onKeydown: (e: KeyboardEvent) => {
                                      if (e.key === "Enter") addSection();
                                    },
                                  }),
                                  h(
                                    "button",
                                    {
                                      onClick: addSection,
                                      disabled:
                                        !sectionName.value.trim() ||
                                        doc.value.sections.length >= 24,
                                    },
                                    "新增板块",
                                  ),
                                ]),
                                h(
                                  "small",
                                  "板块右侧可上下移动和删除；Ctrl/Cmd+S保存，文档编辑确认后可撤销。",
                                ),
                              ])
                            : panel.value === "layout"
                              ? h("div", { class: "panel-actions" }, [
                                  h("button", { disabled: layoutBusy.value || busy.value || editing.value, onClick: recommendLayout }, layoutBusy.value ? "AI正在分析布局…" : "AI推荐布局"),
                                  layoutSuggestion.value ? h("section", { class: "ai-layout-preview" }, [
                                    h("h3", "AI布局建议（尚未应用）"),
                                    h("p", `${layoutSuggestion.value.template === "compact" ? "紧凑" : "经典"}模板 · ${layoutSuggestion.value.fontSize}px · ${layoutSuggestion.value.accent}`),
                                    h("p", layoutSuggestion.value.reason),
                                    ...(layoutSuggestion.value.changes || []).map((text: string) => h("p", text)),
                                    h("button", { onClick: applyLayout }, "应用此布局到草稿"),
                                    h("button", { onClick: () => layoutSuggestion.value = null }, "放弃建议"),
                                  ]) : null,
                                  h("label", [
                                    "字号 ",
                                    h(
                                      "select",
                                      {
                                        "aria-label": "文档字号",
                                        value: doc.value.layout.fontSize,
                                        onChange: (e: Event) =>
                                          change(
                                            () =>
                                              (doc.value.layout.fontSize =
                                                Number(
                                                  (
                                                    e.target as HTMLSelectElement
                                                  ).value,
                                                )),
                                          ),
                                      },
                                      [13, 14, 15, 16].map((n) =>
                                        h("option", { value: n }, String(n)),
                                      ),
                                    ),
                                  ]),
                                  h("label", [
                                    "强调色 ",
                                    h(
                                      "select",
                                      {
                                        "aria-label": "文档强调色",
                                        value: doc.value.layout.accent,
                                        onChange: (e: Event) =>
                                          change(
                                            () =>
                                              (doc.value.layout.accent = (
                                                e.target as HTMLSelectElement
                                              ).value as any),
                                          ),
                                      },
                                      [
                                        ["purple", "逐光紫"],
                                        ["navy", "深海蓝"],
                                        ["charcoal", "石墨黑"],
                                      ].map(([v, t]) =>
                                        h("option", { value: v }, t),
                                      ),
                                    ),
                                  ]),
                                ])
                              : h(
                                  "div",
                                  { class: "panel-actions" },
                                  [
                                    ["classic", "经典 · 留白舒展"],
                                    ["compact", "紧凑 · 信息集中"],
                                  ].map(([value, label]) =>
                                    h(
                                      "button",
                                      {
                                        class:
                                          doc.value.layout.template === value
                                            ? "selected"
                                            : "",
                                        onClick: () =>
                                          change(
                                            () =>
                                              (doc.value.layout.template =
                                                value as any),
                                          ),
                                      },
                                      label,
                                    ),
                                  ),
                                ),
                    ])
                  : null,
                h("div", { class: "document-statusbar" }, [
                  h(
                    "span",
                    "双击文本编辑 · 回车确认 · Shift+回车换行 · Esc取消",
                  ),
                  h(
                    "button",
                    { disabled: busy.value, onClick: importProfile },
                    "从个人信息整理",
                  ),
                  h(
                    "button",
                    {
                      disabled: editing.value || !undoStack.value.length,
                      onClick: undo,
                    },
                    "撤销",
                  ),
                  h(
                    "button",
                    {
                      disabled: editing.value || !redoStack.value.length,
                      onClick: redo,
                    },
                    "重做",
                  ),
                ]),
                h("div", { class: "resume-desk single-document-desk" }, [
                  h(
                    "article",
                    {
                      class: [
                        "resume-document",
                        "paper",
                        "template-" + doc.value.layout.template,
                        "accent-" + doc.value.layout.accent,
                      ],
                      style: {
                        "--resume-font": doc.value.layout.fontSize + "px",
                      },
                      "aria-label": "简历文档",
                    },
                    [
                      h("header", { class: "document-header" }, [
                        edit(
                          doc.value.header.name,
                          "简历姓名",
                          (v) => (doc.value.header.name = v),
                          "h1",
                          "双击填写你的姓名",
                          false,
                          120,
                        ),
                        edit(
                          doc.value.header.headline,
                          "简历求职意向",
                          (v) => (doc.value.header.headline = v),
                          "p",
                          "双击填写意向岗位 · 意向城市",
                          false,
                          400,
                        ),
                        edit(
                          doc.value.header.contact,
                          "简历联系方式",
                          (v) => (doc.value.header.contact = v),
                          "p",
                          "双击填写电话 / 邮箱",
                          false,
                          600,
                        ),
                      ]),
                      edit(
                        doc.value.header.summary,
                        "简历个人简介",
                        (v) => (doc.value.header.summary = v),
                        "p",
                        "双击填写个人简介（可留空）",
                        true,
                        8000,
                      ),
                      ...doc.value.sections.map(section),
                    ],
                  ),
                ]),
                h("div", { class: "save-bar document-save" }, [
                  h(
                    "button",
                    { class: "primary", disabled: busy.value, onClick: save },
                    busy.value ? "处理中…" : "保存当前版本",
                  ),
                  h(
                    "span",
                    {
                      class:
                        dirty.value || editDirty.value ? "unsaved" : "saved",
                    },
                    dirty.value || editDirty.value
                      ? "有未保存修改"
                      : "版本已保存",
                  ),
                  h(
                    "button",
                    { disabled: busy.value, onClick: () => create(true) },
                    "复制为新版本",
                  ),
                  h(
                    "button",
                    {
                      class: "text-danger",
                      disabled: busy.value,
                      onClick: remove,
                    },
                    "删除当前版本",
                  ),
                ]),
              ])
            : h("section", { class: "card empty" }, [
                h("h2", "让你的故事落在纸上"),
                h("p", "从空白文档开始，或者从个人信息整理，再双击文本打磨。"),
                h(
                  "button",
                  {
                    class: "primary",
                    disabled: busy.value,
                    onClick: () => create(),
                  },
                  "创建第一份简历",
                ),
              ]),
        error.value
          ? h("p", { class: "error", role: "alert" }, error.value)
          : null,
        notice.value
          ? h("p", { class: "notice", role: "status" }, notice.value)
          : null,
        h(
          "p",
          { class: "privacy-note" },
          "文档按账号保存；Word在浏览器本地生成，PDF使用浏览器打印另存。AI/生图未接通，不向第三方发送资料。",
        ),
      ]);
  },
});
