import { defineComponent, h, ref, onMounted, watch } from "vue";
import ResumeImport from "./resume-import";
import PhotoPicker from "./photo-picker";
import {
  api,
  emptyProfile,
  errorText,
  type Profile,
  type Experience,
} from "./api";
export default defineComponent({
  props: { onDirty: { type: Function, required: true } },
  setup(props) {
    const model = ref<Profile>(emptyProfile()),
      revision = ref(0),
      loading = ref(true),
      busy = ref(false),
      dirty = ref(false),
      error = ref(""),
      success = ref("");
    const cities = ref(""),
      directions = ref("");
    let hydrate = false;
    watch(
      model,
      () => {
        if (hydrate) {
          dirty.value = true;
          props.onDirty(true);
          success.value = "";
        }
      },
      { deep: true, flush: "sync" },
    );
    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await api("/profile");
        hydrate = false;
        model.value = r.profile
          ? { ...emptyProfile(), ...r.profile }
          : emptyProfile();
        model.value.photos = Array.isArray(model.value.photos) ? model.value.photos.slice(0, 3) : [];
        revision.value = r.revision;
        const staged = sessionStorage.getItem("resume-import-stage");
        if (staged) {
          sessionStorage.removeItem("resume-import-stage");
          try {
            const ref = JSON.parse(staged) as { draftId:string; fields:(keyof Profile)[]; photos?:string[]; extraNotes?:string };
            const pending = await api<{draft:any}>("/resume-imports/" + ref.draftId);
            for (const key of ref.fields) (model.value as any)[key] = JSON.parse(JSON.stringify(pending.draft.profile[key]));
            if (ref.photos?.length) {
              const merged = [...(model.value.photos || [])];
              for (const photo of ref.photos) if (!merged.includes(photo) && merged.length < 3) merged.push(photo);
              model.value.photos = merged;
            }
            if (ref.extraNotes) model.value.notes = [model.value.notes, ref.extraNotes].filter(Boolean).join("\n\n");
          } catch (e) { error.value = "恢复待确认简历草稿失败：" + errorText(e); }
        }
        const hasStagedImport = !!staged;
        dirty.value = hasStagedImport;
        props.onDirty(hasStagedImport);
        hydrate = true;
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }
    onMounted(load);
    async function save() {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      success.value = "";
      const snapshot = JSON.stringify(model.value);
      try {
        const r = await api("/profile", "PUT", {
          profile: JSON.parse(snapshot),
          revision: revision.value,
        });
        revision.value = r.revision;
        dirty.value = JSON.stringify(model.value) !== snapshot;
        props.onDirty(dirty.value);
        success.value = dirty.value
          ? "上一份编辑已保存；保存期间的新修改仍待保存"
          : "已保存到你的账号，刷新或再次登录后可继续编辑";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    function textarea(value: string, set: (v: string) => void, label: string) {
      return h("textarea", {
        value,
        rows: 3,
        "aria-label": label,
        onInput: (e: Event) => {
          const t = e.target as HTMLTextAreaElement;
          set(t.value);
          t.style.height = "auto";
          t.style.height = t.scrollHeight + "px";
        },
      });
    }
    function field(label: string, key: keyof Profile, placeholder = "") {
      return h("label", { class: "field" }, [
        h("span", label),
        h("input", {
          value: model.value[key],
          placeholder,
          maxlength: key === "name" ? 120 : 254,
          onInput: (e: Event) =>
            ((model.value as any)[key] = (e.target as HTMLInputElement).value),
        }),
      ]);
    }
    function tags(
      key: "cities" | "directions",
      label: string,
      input: typeof cities,
    ) {
      const add = () => {
        const v = input.value.trim();
        if (v && !model.value[key].includes(v) && model.value[key].length < 40)
          model.value[key].push(v.slice(0, 80));
        input.value = "";
      };
      return h("div", { class: "field" }, [
        h("span", label),
        h("div", { class: "inline" }, [
          h("input", {
            value: input.value,
            placeholder: "自由输入，点击确定添加",
            maxlength: 80,
            "aria-label": label,
            onInput: (e: Event) =>
              (input.value = (e.target as HTMLInputElement).value),
            onKeydown: (e: KeyboardEvent) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            },
          }),
          h("button", { type: "button", onClick: add }, "确定"),
        ]),
        h(
          "div",
          { class: "chips" },
          model.value[key].map((v, i) =>
            h("span", { class: "chip" }, [
              v,
              h(
                "button",
                {
                  type: "button",
                  "aria-label": "删除" + v,
                  onClick: () => model.value[key].splice(i, 1),
                },
                "×",
              ),
            ]),
          ),
        ),
      ]);
    }
    function section(
      key: "education" | "projects" | "experience",
      label: string,
      titleLabel: string,
    ) {
      return h("section", { class: "card" }, [
        h("div", { class: "row-head" }, [
          h("h2", label),
          h(
            "button",
            {
              type: "button",
              onClick: () =>
                model.value[key].push({ title: "", period: "", detail: "" }),
              disabled: model.value[key].length >= 30,
            },
            "+ 添加一段",
          ),
        ]),
        ...model.value[key].map((item: Experience, i: number) =>
          h("div", { class: "experience-row" }, [
            h("div", { class: "form-grid" }, [
              h("label", { class: "field" }, [
                h("span", titleLabel),
                h("input", {
                  value: item.title,
                  maxlength: 200,
                  onInput: (e: Event) =>
                    (item.title = (e.target as HTMLInputElement).value),
                }),
              ]),
              h("label", { class: "field" }, [
                h("span", "时间 / 阶段"),
                h("input", {
                  value: item.period,
                  maxlength: 100,
                  placeholder: "例如 2022.09—2026.06",
                  onInput: (e: Event) =>
                    (item.period = (e.target as HTMLInputElement).value),
                }),
              ]),
            ]),
            h("label", { class: "field" }, [
              h(
                "span",
                key === "education"
                  ? "教育经历与学习情况（支持专升本分段填写）"
                  : "工作内容与成果",
              ),
              textarea(
                item.detail,
                (v) => (item.detail = v),
                label + "内容" + (i + 1),
              ),
            ]),
            h(
              "button",
              {
                type: "button",
                class: "text-danger",
                onClick: () => model.value[key].splice(i, 1),
              },
              "删除此段",
            ),
          ]),
        ),
      ]);
    }
    return () =>
      h("div", [
        h("header", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR STORY"),
          h("h1", "个人信息"),
          h("p", "先选择城市或职业方向，再整理经历。不需要先有简历。"),
        ]),
        h(ResumeImport, {
          disabled: loading.value || busy.value,
          onProfile: (patch: Partial<Profile>, extraNotes = "") => {
            const next = { ...patch };
            if (Array.isArray(next.photos)) {
              const merged = [...(model.value.photos || [])];
              for (const photo of next.photos) {
                if (!merged.includes(photo) && merged.length < 3) merged.push(photo);
              }
              next.photos = merged;
            }
            Object.assign(model.value, next);
            if (extraNotes) model.value.notes = [model.value.notes, extraNotes].filter(Boolean).join("\n\n");
          },
        }),
        loading.value
          ? h(
              "div",
              { class: "notice", role: "status" },
              "正在读取你的个人资料…",
            )
          : h(
              "form",
              {
                onSubmit: (e: Event) => {
                  e.preventDefault();
                  save();
                },
              },
              [
                h("section", { class: "card" }, [
                  h("h2", "求职意向"),
                  h("div", { class: "form-grid" }, [
                    tags("cities", "意向城市", cities),
                    tags("directions", "职业方向", directions),
                  ]),
                ]),
                h("section", { class: "card" }, [
                  h("h2", "基本信息"),
                  h("div", { class: "form-grid" }, [
                    field("姓名", "name"),
                    field("联系电话", "phone"),
                    field("联系邮箱", "email"),
                  ]),
                  h("label", { class: "field" }, [
                    h("span", "个人简介"),
                    textarea(
                      model.value.summary,
                      (v) => (model.value.summary = v),
                      "个人简介",
                    ),
                  ]),
                ]),
                h("section", { class: "card" }, [
                  h("h2", "个人照片"),
                  h("p", { class: "muted" }, "可以上传最多 3 张个人照片；第一张作为简历主照片。"),
                  h(PhotoPicker, {
                    photos: model.value.photos || [],
                    disabled: busy.value,
                    onChange: (photos: string[]) => { model.value.photos = photos; },
                  }),
                ]),
                section("education", "教育经历", "学校 / 专业 / 学历"),
                section("projects", "项目经历", "项目名称 / 担任角色"),
                section("experience", "实习 / 工作经历", "公司 / 岗位"),
                h("section", { class: "card" }, [
                  h("h2", "掌握技能与荣誉"),
                  h("label", { class: "field" }, [
                    h("span", "掌握技能"),
                    textarea(
                      model.value.skills,
                      (v) => (model.value.skills = v),
                      "掌握技能",
                    ),
                  ]),
                  h("label", { class: "field" }, [
                    h("span", "荣誉 / 证书"),
                    textarea(
                      model.value.honors,
                      (v) => (model.value.honors = v),
                      "荣誉证书",
                    ),
                  ]),
                  h("label", { class: "field" }, [h("span", "备注"), textarea(model.value.notes || "", v => model.value.notes = v, "备注")]),
                ]),
                h("div", { class: "save-bar" }, [
                  h(
                    "button",
                    { type: "submit", class: "primary", disabled: busy.value },
                    busy.value ? "保存中…" : "保存个人信息",
                  ),
                  h(
                    "span",
                    { class: dirty.value ? "unsaved" : "saved" },
                    dirty.value ? "有未保存修改" : "已与账号同步",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: busy.value,
                      onClick: () => {
                        if (
                          !dirty.value ||
                          confirm("放弃当前未保存修改，重新读取账号资料？")
                        )
                          load();
                      },
                    },
                    "重新载入",
                  ),
                ]),
              ],
            ),
        error.value
          ? h("p", { role: "alert", class: "error" }, error.value)
          : null,
        success.value
          ? h("p", { role: "status", class: "success" }, success.value)
          : null,
        h(
          "p",
          { class: "privacy-note" },
          "你的资料由服务器按账号隔离保存；请勿填写与测试无关的敏感信息。",
        ),
      ]);
  },
});
