import { defineComponent, h, ref, onMounted, watch } from "vue";
import { api, errorText, type Profile } from "./api";
interface Resume {
  id: string;
  title: string;
  body: { text: string };
  revision: number;
  updated_at: number;
}
export default defineComponent({
  props: { onDirty: { type: Function, required: true } },
  setup(props) {
    const list = ref<Resume[]>([]),
      current = ref<Resume | null>(null),
      title = ref(""),
      text = ref(""),
      dirty = ref(false),
      busy = ref(false),
      loading = ref(true),
      error = ref(""),
      success = ref("");
    let setting = false;
    watch(
      [title, text],
      () => {
        if (!setting) {
          dirty.value = true;
          props.onDirty(true);
          success.value = "";
        }
      },
      { flush: "sync" },
    );
    function install(r: Resume | null) {
      setting = true;
      current.value = r;
      title.value = r?.title || "";
      text.value = r?.body.text || "";
      dirty.value = false;
      props.onDirty(false);
      setting = false;
    }
    async function refresh() {
      const r = await api("/resumes");
      list.value = r.resumes;
    }
    async function load(id: string) {
      if (dirty.value && !confirm("当前简历有未保存修改，确认放弃并切换？"))
        return;
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
        if (list.value.length) await load(list.value[0].id);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    });
    async function create() {
      if (busy.value) return;
      if (dirty.value && !confirm("当前简历未保存，确认放弃并新建空白版本？"))
        return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/resumes", "POST", {
          title: "我的简历 · " + (list.value.length + 1),
          body: { text: "" },
        });
        install(r.resume);
        await refresh();
        success.value = "已创建空白版本，请填写你的真实经历";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function save() {
      if (!current.value || busy.value) return;
      busy.value = true;
      error.value = "";
      success.value = "";
      const sentTitle = title.value,
        sentText = text.value;
      try {
        const r = await api("/resumes/" + current.value.id, "PUT", {
          title: sentTitle,
          body: { text: sentText },
          revision: current.value.revision,
        });
        if (title.value === sentTitle && text.value === sentText)
          install(r.resume);
        else {
          current.value = r.resume;
          dirty.value = true;
          props.onDirty(true);
        }
        await refresh();
        success.value = dirty.value
          ? "旧稿已保存，刚输入的新内容仍待保存"
          : "已保存当前简历版本";
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
        !confirm("确认删除此简历版本？删除后无法恢复。")
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
        if (list.value.length) {
          const r = await api("/resumes/" + list.value[0].id);
          install(r.resume);
        }
        success.value = "该版本已删除";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function fill() {
      if (!current.value || busy.value) return;
      if (
        text.value &&
        !confirm(
          "将已保存的个人信息整理为简历文本，会替换当前编辑内容。是否继续？",
        )
      )
        return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/profile");
        const p: Profile = r.profile;
        if (!p) throw new Error("请先在个人信息页填写并保存，再导入简历");
        const blocks = [
          p.name,
          [p.phone, p.email].filter(Boolean).join(" · "),
          p.summary,
          p.cities.length || p.directions.length
            ? "求职意向：" +
              [p.cities.join("、"), p.directions.join("、")]
                .filter(Boolean)
                .join(" / ")
            : "",
        ];
        for (const [key, label] of [
          ["education", "教育经历"],
          ["projects", "项目经历"],
          ["experience", "实习 / 工作经历"],
        ] as const) {
          const rows = p[key].filter((x) => x.title || x.period || x.detail);
          if (rows.length)
            blocks.push(
              label,
              ...rows.map((x) =>
                [x.title, x.period, x.detail].filter(Boolean).join("\n"),
              ),
            );
        }
        if (p.skills) blocks.push("掌握技能", p.skills);
        if (p.honors) blocks.push("荣誉 / 证书", p.honors);
        text.value = blocks.filter(Boolean).join("\n\n");
        success.value = "已从已保存资料整理，未调用AI；请检查后保存";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    return () =>
      h("div", [
        h("header", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "RESUME STUDIO"),
          h("h1", "简历工作室"),
          h("p", "先把真实经历整理好，再为每一个方向留一份独立版本。"),
        ]),
        h("div", { class: "resume-toolbar" }, [
          h(
            "div",
            { class: "version-switch" },
            list.value.map((v) =>
              h(
                "button",
                {
                  class: { selected: v.id === current.value?.id },
                  disabled: busy.value,
                  onClick: () => load(v.id),
                },
                v.title,
              ),
            ),
          ),
          h(
            "button",
            { class: "primary", disabled: busy.value, onClick: create },
            "＋ 新建版本",
          ),
        ]),
        loading.value
          ? h("p", { role: "status" }, "正在读取简历…")
          : current.value
            ? h("div", [
                h("section", { class: "card" }, [
                  h("label", { class: "field" }, [
                    h("span", "版本名称"),
                    h("input", {
                      value: title.value,
                      maxlength: 120,
                      "aria-label": "版本名称",
                      onInput: (e: Event) =>
                        (title.value = (e.target as HTMLInputElement).value),
                    }),
                  ]),
                  h("div", { class: "inline" }, [
                    h(
                      "button",
                      { disabled: busy.value, onClick: fill },
                      "从已保存个人信息填入",
                    ),
                    h(
                      "span",
                      { class: "muted" },
                      "直接整理原文，不编造经历，也不调用AI。",
                    ),
                  ]),
                ]),
                h("div", { class: "resume-columns" }, [
                  h("section", { class: "card editor" }, [
                    h("h2", "编辑内容"),
                    h("textarea", {
                      value: text.value,
                      rows: 24,
                      maxlength: 60000,
                      "aria-label": "简历正文",
                      placeholder: "在这里写下你的真实经历…",
                      onInput: (e: Event) =>
                        (text.value = (e.target as HTMLTextAreaElement).value),
                    }),
                  ]),
                  h("section", { class: "resume-desk" }, [
                    h(
                      "div",
                      { class: "document-ribbon" },
                      "文档预览 · 内容安全按纯文本展示",
                    ),
                    h(
                      "article",
                      { class: "resume-document", "aria-label": "简历预览" },
                      text.value || "还没有内容，从左边开始书写吧。",
                    ),
                  ]),
                ]),
                h("div", { class: "save-bar" }, [
                  h(
                    "button",
                    { class: "primary", disabled: busy.value, onClick: save },
                    busy.value ? "处理中…" : "保存当前版本",
                  ),
                  h(
                    "span",
                    { class: dirty.value ? "unsaved" : "saved" },
                    dirty.value ? "有未保存修改" : "版本已保存",
                  ),
                  h(
                    "button",
                    {
                      disabled: busy.value,
                      onClick: () => load(current.value!.id),
                    },
                    "重新载入",
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
                h(
                  "div",
                  { class: "notice" },
                  "本批完成版本编辑与账号保存。AI诊断、HTML排版编辑、Word/PDF导出和生图装饰将在后续批次接入，当前预览为安全纯文本。",
                ),
              ])
            : h("section", { class: "card empty" }, [
                h("h2", "从第一份简历开始"),
                h(
                  "p",
                  "默认没有样例简历。新建一个版本，再填写或导入你自己的资料。",
                ),
                h(
                  "button",
                  { class: "primary", disabled: busy.value, onClick: create },
                  "创建第一份简历",
                ),
              ]),
        error.value
          ? h("p", { role: "alert", class: "error" }, error.value)
          : null,
        success.value
          ? h("p", { role: "status", class: "success" }, success.value)
          : null,
      ]);
  },
});
