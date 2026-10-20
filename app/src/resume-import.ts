import { defineComponent, h, ref, computed, onBeforeUnmount } from "vue";
import { api, session, errorText, type Profile } from "./api";
import { proposeImport } from "./resume-import-model";
const labels: Partial<Record<keyof Profile, string>> = {
  name: "姓名",
  phone: "电话",
  email: "邮箱",
  summary: "个人简介",
  skills: "技能",
  honors: "荣誉与证书",
  education: "教育经历",
  projects: "项目经历",
  experience: "实习与工作经历",
};
interface Result {
  text: string;
  method: string;
  pages: { page: number; text: string; method: string }[];
  warnings: string[];
}
export default defineComponent({
  props: { onProfile: Function, onCreated: Function, disabled: Boolean },
  setup(props) {
    const file = ref<File | null>(null),
      jobId = ref(""),
      processing = ref(false),
      saving = ref(false),
      result = ref<Result | null>(null),
      source = ref(""),
      groupedSource = ref(""),
      error = ref(""),
      notice = ref(""),
      selected = ref<string[]>([]),
      candidate = ref<Profile | null>(null),
      filename = ref(""),
      proposal = ref<ReturnType<typeof proposeImport> | null>(null);
    let generation = 0,
      disposed = false;
    let stopped = false,
      uploadAbort: AbortController | null = null,
      pollTimer: ReturnType<typeof setTimeout> | null = null,
      pollResolve: (() => void) | null = null;
    const hasField = (k: keyof Profile) => {
      const v = candidate.value?.[k];
      return Array.isArray(v)
        ? v.some((x) => (typeof x === "string" ? x : !!(x.title || x.detail)))
        : !!v;
    };
    const keys = computed(() =>
      (Object.keys(labels) as (keyof Profile)[]).filter(hasField),
    );
    function regroup() {
      proposal.value = proposeImport(source.value);
      groupedSource.value = source.value;
      candidate.value = JSON.parse(JSON.stringify(proposal.value.profile));
      selected.value = [];
      notice.value = "已按修正后的原文重新归类，请勾选确认需要导入的字段";
    }
    async function removeJob(id: string) {
      try {
        const r = await fetch("/api/resume-extractions/" + id, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
          headers: { "X-CSRF-Token": session.csrf || "" },
        });
        if (!r.ok && r.status !== 404) throw Error("delete failed");
      } catch {
        if (!disposed)
          notice.value =
            "本地结果已清除，服务器删除未确认；临时结果最迟约16分钟自动过期。";
      }
    }
    async function discard() {
      generation++;
      stopped = true;
      uploadAbort?.abort();
      if (pollTimer) clearTimeout(pollTimer);
      pollResolve?.();
      pollResolve = null;
      const id = jobId.value;
      jobId.value = "";
      processing.value = false;
      result.value = null;
      source.value = "";
      candidate.value = null;
      proposal.value = null;
      selected.value = [];
      if (id) await removeJob(id);
    }
    async function start() {
      if (!file.value || processing.value || saving.value || props.disabled)
        return;
      const cleanup = discard();
      const mine = generation;
      processing.value = true;
      stopped = false;
      error.value = "";
      notice.value = "";
      const currentRun = () => mine === generation && !disposed;
      const f = file.value;
      filename.value = f.name;
      try {
        await cleanup;
        if (!currentRun()) return;
        const types: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
        };
        const type = types[f.name.split(".").pop()?.toLowerCase() || ""];
        if (!type) throw Error("请选择PDF、DOCX、PNG或JPEG文件");
        if (f.size < 1 || f.size > 5 * 1024 * 1024)
          throw Error("文件大小须不超过5MiB");
        const controller = new AbortController();
        uploadAbort = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        let r: Response;
        try {
          r = await fetch("/api/resume-extractions", {
            method: "POST",
            credentials: "same-origin",
            signal: controller.signal,
            headers: {
              "Content-Type": type,
              "X-CSRF-Token": session.csrf || "",
              "X-File-Name": encodeURIComponent(f.name),
            },
            body: f,
          });
        } finally {
          clearTimeout(timer);
        }
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "上传失败");
        const myId = data.job.id;
        if (!currentRun()) {
          void removeJob(myId);
          return;
        }
        jobId.value = myId;
        const end = Date.now() + 85000;
        while (currentRun() && Date.now() < end) {
          const { job } = await api("/resume-extractions/" + myId);
          if (!currentRun() || jobId.value !== myId) return;
          if (job.state === "ready") {
            result.value = job.result;
            source.value = job.result.text;
            regroup();
            notice.value = "识别完成，尚未写入个人资料或简历。请先核对原文。";
            return;
          }
          if (job.state === "failed") throw Error(job.error);
          if (job.state === "cancelled") throw Error("识别已取消");
          await new Promise<void>((resolve) => {
            pollResolve = resolve;
            pollTimer = setTimeout(resolve, 1200);
          });
        }
        if (currentRun())
          throw Error("等待结果超时，请取消后使用更精简文件重试");
      } catch (e) {
        if (currentRun()) error.value = errorText(e);
      } finally {
        if (currentRun()) processing.value = false;
      }
    }
    function applyProfile() {
      if (
        !candidate.value ||
        !props.onProfile ||
        !selected.value.length ||
        source.value !== groupedSource.value
      )
        return;
      const patch: Partial<Profile> = {};
      for (const key of selected.value as (keyof Profile)[]) {
        (patch as any)[key] = JSON.parse(JSON.stringify(candidate.value[key]));
      }
      props.onProfile(patch);
      notice.value =
        "仅将已勾选字段写入当前草稿，未自动保存；请检查下方资料后点击保存。";
    }
    async function createDocument() {
      if (
        !proposal.value ||
        saving.value ||
        props.disabled ||
        source.value !== groupedSource.value
      )
        return;
      const document = proposal.value.document;
      if (
        !confirm("将核对的原文归类为一个全新简历版本，不覆盖现有版本。继续？")
      )
        return;
      saving.value = true;
      error.value = "";
      try {
        const title =
          (filename.value.replace(/\.[a-zA-Z0-9]+$/, "") || "识别导入").slice(
            0,
            90,
          ) + " · 导入";
        const r = await api("/resumes", "POST", {
          title,
          body: { document },
        });
        await props.onCreated?.(r.resume);
        notice.value =
          "已创建独立简历版本；原有版本未改动，可在简历工作室继续双击编辑。";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        saving.value = false;
      }
    }
    onBeforeUnmount(() => {
      disposed = true;
      stopped = true;
      void discard();
    });
    return () =>
      h(
        "section",
        { class: "resume-import card", "aria-label": "简历上传识别" },
        [
          h("div", { class: "row-head" }, [
            h("div", [
              h("span", { class: "eyebrow" }, "RESUME INTAKE"),
              h("h2", "上传已有简历（可选）"),
            ]),
            h(
              "span",
              { class: "local-badge" },
              "本机解析 · 非AI · 不发送第三方",
            ),
          ]),
          h(
            "p",
            "PDF / DOCX / PNG / JPEG，≤5MiB；PDF最多4页，图片≤1200万像素。没有简历也可以手动填写。",
          ),
          h("div", { class: "import-upload" }, [
            h("input", {
              type: "file",
              accept: ".pdf,.docx,.png,.jpg,.jpeg",
              "aria-label": "选择简历文件",
              disabled: processing.value || saving.value || props.disabled,
              onChange: (e: Event) => {
                file.value = (e.target as HTMLInputElement).files?.[0] || null;
                error.value = "";
              },
            }),
            h(
              "button",
              {
                class: "primary",
                type: "button",
                disabled:
                  !file.value ||
                  processing.value ||
                  saving.value ||
                  props.disabled,
                onClick: start,
              },
              processing.value ? "正在识别…" : "上传并识别",
            ),
            processing.value || result.value
              ? h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      stopped = true;
                      void discard();
                      notice.value = "已清除临时识别结果，原有资料未改动";
                    },
                  },
                  processing.value ? "取消识别" : "清除识别结果",
                )
              : null,
          ]),
          processing.value
            ? h(
                "p",
                { role: "status" },
                "正在提取文字；扫描件使用本地中英文OCR。为其他服务保留余量，全站只运行一个识别任务。",
              )
            : null,
          result.value && proposal.value
            ? h("div", { class: "import-review" }, [
                h("h3", "1 · 核对逐页识别证据"),
                h(
                  "p",
                  { class: "import-meta" },
                  filename.value +
                    " · " +
                    result.value.method +
                    " · 识别完成后核对确认不设倒计时",
                ),
                ...result.value.pages.map((page) =>
                  h("details", { class: "source-page" }, [
                    h("summary", "第" + page.page + "页 / " + page.method),
                    h("pre", page.text),
                  ]),
                ),
                h("label", { class: "field" }, [
                  h("span", "核对并修正原文（归类前可编辑）"),
                  h("textarea", {
                    "aria-label": "识别原文",
                    value: source.value,
                    maxlength: 40000,
                    rows: 8,
                    onInput: (e: Event) =>
                      (source.value = (e.target as HTMLTextAreaElement).value),
                  }),
                ]),
                h(
                  "button",
                  { type: "button", onClick: regroup },
                  source.value !== groupedSource.value
                    ? "原文已改变，请重新归类"
                    : "按修正原文重新归类",
                ),
                h(
                  "ul",
                  { class: "import-warnings" },
                  [
                    ...new Set([
                      ...result.value.warnings,
                      ...proposal.value.warnings,
                    ]),
                  ].map((w) => h("li", w)),
                ),
                props.onProfile
                  ? h("div", [
                      h("h3", "2 · 选择要写入个人资料的字段"),
                      h(
                        "p",
                        "默认不勾选。已勾选字段会替换当前同名字段；经历字段会替换该类全部条目，未勾选的一律保留。无法确认的姓名、城市、岗位不会猜测。",
                      ),
                      ...(keys.value.length
                        ? keys.value.map((k) =>
                            h("div", { class: "import-candidate" }, [
                              h("label", [
                                h("input", {
                                  type: "checkbox",
                                  "aria-label": "导入" + labels[k],
                                  checked: selected.value.includes(k),
                                  onChange: (e: Event) => {
                                    if ((e.target as HTMLInputElement).checked)
                                      selected.value.push(k);
                                    else
                                      selected.value = selected.value.filter(
                                        (x) => x !== k,
                                      );
                                  },
                                }),
                                labels[k],
                              ]),
                              typeof candidate.value?.[k] === "string"
                                ? h("input", {
                                    "aria-label": "识别" + labels[k],
                                    value: candidate.value[k] as string,
                                    onInput: (e: Event) =>
                                      ((candidate.value as any)[k] = (
                                        e.target as HTMLInputElement
                                      ).value),
                                  })
                                : h(
                                    "div",
                                    (candidate.value![k] as any[]).map((x, i) =>
                                      h("label", { class: "field" }, [
                                        h("span", x.title || labels[k]),
                                        h("textarea", {
                                          "aria-label":
                                            "识别" + labels[k] + (i + 1),
                                          value: x.detail,
                                          rows: 3,
                                          onInput: (e: Event) =>
                                            (x.detail = (
                                              e.target as HTMLTextAreaElement
                                            ).value),
                                        }),
                                      ]),
                                    ),
                                  ),
                              h(
                                "small",
                                { class: "field-evidence" },
                                "来源：" +
                                  proposal
                                    .value!.evidence.filter(
                                      (e) =>
                                        e.field === k ||
                                        e.field.startsWith(k + "["),
                                    )
                                    .map((e) => e.source)
                                    .join(" · ")
                                    .slice(0, 500),
                              ),
                            ]),
                          )
                        : [
                            h(
                              "p",
                              "没有可安全映射的字段，完整原文仍可创建简历版本。",
                            ),
                          ]),
                      h(
                        "button",
                        {
                          class: "primary",
                          type: "button",
                          disabled:
                            !selected.value.length ||
                            source.value !== groupedSource.value ||
                            saving.value ||
                            props.disabled,
                          onClick: applyProfile,
                        },
                        "将勾选字段写入草稿",
                      ),
                    ])
                  : null,
                h(
                  "h3",
                  props.onProfile
                    ? "3 · 或创建独立简历版本"
                    : "2 · 创建独立简历版本",
                ),
                h(
                  "p",
                  "按照已核对原文识别板块，未分类内容保留为原文，不复原原PDF排版，不补写经历。",
                ),
                h(
                  "div",
                  { class: "chips" },
                  proposal.value.document.sections.map((s) =>
                    h("span", { class: "chip" }, s.title),
                  ),
                ),
                h(
                  "button",
                  {
                    class: "primary",
                    type: "button",
                    disabled:
                      saving.value ||
                      props.disabled ||
                      source.value !== groupedSource.value,
                    onClick: createDocument,
                  },
                  saving.value ? "正在创建…" : "确认并创建简历版本",
                ),
              ])
            : null,
          error.value
            ? h("p", { class: "error", role: "alert" }, error.value)
            : null,
          notice.value
            ? h("p", { class: "notice", role: "status" }, notice.value)
            : null,
          h(
            "small",
            "上传原件只临时存于服务器私有目录，解析完成/失败后清理；上传和后台模型任务有资源保护超时，识别完成后用户核对、修改、勾选、确认不设倒计时。当前结果仅在本页待确认，刷新或离页可能丢失；只有你确认导入个人资料或创建新版本后才持久保存。",
          ),
        ],
      );
  },
});
