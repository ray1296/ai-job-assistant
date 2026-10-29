import {
  defineComponent,
  h,
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import { api, errorText, session } from "./api";

export function safeJobUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export default defineComponent({
  emits: ["dirty"],
  setup(_, { emit }) {
    const account = session.user?.id;
    const jobs = ref<any[]>([]),
      total = ref(0),
      loading = ref(false),
      error = ref("");
    const q = ref(""),
      direction = ref(""),
      city = ref(""),
      intentFilter = ref(""),
      page = ref(1);
    const facets = ref<{ directions: string[]; cities: string[] }>({
      directions: [],
      cities: [],
    });
    const intents = ref<string[]>([]),
      baseline = ref<string[]>([]),
      ready = ref(false),
      saving = ref(false),
      notice = ref("");
    const detail = ref<any>(null),
      detailLoading = ref(false),
      dialog = ref<HTMLDialogElement | null>(null);
    const dirty = computed(
      () =>
        intents.value.some((x) => !baseline.value.includes(x)) ||
        baseline.value.some((x) => !intents.value.includes(x)),
    );
    watch(dirty, (value) => emit("dirty", value));
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / 12)));
    let alive = true,
      loadSeq = 0,
      detailSeq = 0,
      loadController: AbortController | null = null;
    const controllers = new Set<AbortController>();
    function controller() {
      const c = new AbortController();
      controllers.add(c);
      return c;
    }
    const current = () => alive && session.user?.id === account;
    async function load() {
      const seq = ++loadSeq;
      loadController?.abort();
      const c = controller();
      loadController = c;
      loading.value = true;
      error.value = "";
      try {
        const p = new URLSearchParams({
          page: String(page.value),
          pageSize: "12",
        });
        if (q.value.trim()) p.set("q", q.value.trim());
        if (direction.value) p.set("direction", direction.value);
        if (city.value) p.set("city", city.value);
        if (intentFilter.value) p.set("intent", intentFilter.value);
        const result = await api("/jobs?" + p, "GET", undefined, {
          signal: c.signal,
        });
        if (current() && seq === loadSeq) {
          jobs.value = result.jobs;
          total.value = result.total;
        }
      } catch (e) {
        if (current() && seq === loadSeq && !c.signal.aborted)
          error.value = errorText(e);
      } finally {
        controllers.delete(c);
        if (current() && seq === loadSeq) loading.value = false;
      }
    }
    async function init() {
      const c = controller();
      error.value = "";
      try {
        const [f, selected] = await Promise.all([
          api("/jobs/facets", "GET", undefined, { signal: c.signal }),
          api("/job-intents", "GET", undefined, { signal: c.signal }),
        ]);
        if (!current()) return;
        facets.value = f;
        intents.value = [...selected.jobIds];
        baseline.value = [...selected.jobIds];
        ready.value = true;
        await load();
      } catch (e) {
        if (current() && !c.signal.aborted) error.value = errorText(e);
      } finally {
        controllers.delete(c);
      }
    }
    function toggle(id: string) {
      if (!ready.value || saving.value) return;
      intents.value = intents.value.includes(id)
        ? intents.value.filter((x) => x !== id)
        : [...intents.value, id];
      notice.value = "";
    }
    async function save() {
      if (saving.value || !ready.value) return;
      saving.value = true;
      error.value = "";
      notice.value = "";
      const wanted = [...intents.value],
        c = controller();
      try {
        // Only mutate changed job IDs: never replace another tab's complete selection.
        const changes = [...new Set([...baseline.value, ...wanted])].filter(
          (id) => baseline.value.includes(id) !== wanted.includes(id),
        );
        for (const id of changes) {
          await api(
            "/job-intents/" + encodeURIComponent(id),
            wanted.includes(id) ? "PUT" : "DELETE",
            undefined,
            { signal: c.signal },
          );
          if (!current()) return;
          baseline.value = wanted.includes(id)
            ? [...baseline.value.filter((x) => x !== id), id]
            : baseline.value.filter((x) => x !== id);
        }
        notice.value = "投递意向已保存（包括清空选择）";
        if (intentFilter.value) { page.value = 1; void load(); }
      } catch (e) {
        if (current() && !c.signal.aborted)
          error.value = errorText(e) + "；未保存的选择仍保留，可重试。";
      } finally {
        controllers.delete(c);
        if (current()) saving.value = false;
      }
    }
    async function show(job: any) {
      const seq = ++detailSeq,
        c = controller();
      detail.value = null;
      detailLoading.value = true;
      error.value = "";
      await nextTick();
      dialog.value?.showModal();
      try {
        const result = await api(
          "/jobs/" + encodeURIComponent(job.id),
          "GET",
          undefined,
          { signal: c.signal },
        );
        if (current() && seq === detailSeq) detail.value = result.job;
      } catch (e) {
        if (current() && seq === detailSeq && !c.signal.aborted)
          error.value = errorText(e);
      } finally {
        controllers.delete(c);
        if (current() && seq === detailSeq) detailLoading.value = false;
      }
    }
    function close() {
      ++detailSeq;
      detailLoading.value = false;
      dialog.value?.close();
    }
    function search() {
      page.value = 1;
      void load();
    }
    onMounted(init);
    onBeforeUnmount(() => {
      alive = false;
      controllers.forEach((c) => c.abort());
      emit("dirty", false);
    });
    return () =>
      h("section", { class: "jobs-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "DISCOVER OPPORTUNITIES"),
          h("h1", "发现岗位"),
          h(
            "p",
            "真实导入的岗位快照。筛选不是 AI 匹配；岗位信息以来源页面为准。",
          ),
        ]),
        h(
          "form",
          {
            class: "jobs-toolbar",
            onSubmit: (e: Event) => {
              e.preventDefault();
              search();
            },
          },
          [
            h("input", {
              "aria-label": "搜索岗位",
              value: q.value,
              placeholder: "搜索岗位、公司、方向或 JD",
              onInput: (e: any) => (q.value = e.target.value),
            }),
            ...(
              [
                ["方向", direction, facets.value.directions],
                ["城市", city, facets.value.cities],
              ] as const
            ).map(([name, value, options]) =>
              h(
                "select",
                {
                  "aria-label": name,
                  value: value.value,
                  onChange: (e: any) => {
                    value.value = e.target.value;
                    search();
                  },
                },
                [
                  h("option", { value: "" }, "全部" + name),
                  ...options.map((x) => h("option", { value: x }, x)),
                ],
              ),
            ),
            h(
              "select",
              {
                "aria-label": "投递意向状态",
                value: intentFilter.value,
                onChange: (e: any) => {
                  intentFilter.value = e.target.value;
                  search();
                },
              },
              [
                h("option", { value: "" }, "全部投递意向"),
                h("option", { value: "confirmed" }, "已确认投递意向"),
                h("option", { value: "unconfirmed" }, "未确认投递意向"),
              ],
            ),
            h(
              "button",
              { class: "primary", type: "submit", disabled: !ready.value },
              "搜索",
            ),
          ],
        ),
        h("div", { class: "jobs-summary" }, [
          h(
            "span",
            { role: "status" },
            "共 " +
              total.value +
              " 个岗位 · 已确认 " +
              baseline.value.length +
              " · 当前选择 " +
              intents.value.length +
              (dirty.value ? " · 有未保存选择" : ""),
          ),
          h("a", { href: "#plan" }, "前往投递方案 →"),
        ]),
        error.value
          ? h("p", { class: "error", role: "alert" }, [
              error.value,
              !ready.value
                ? h("button", { onClick: init }, "重新读取")
                : h("button", { onClick: load }, "重试读取岗位"),
            ])
          : null,
        notice.value ? h("p", { role: "status" }, notice.value) : null,
        loading.value ? h("p", { role: "status" }, "正在读取岗位…") : null,
        h(
          "div",
          { class: "job-grid", "aria-busy": loading.value },
          jobs.value.map((job) =>
            h("article", { class: "job-card", key: job.id }, [
              h("div", { class: "job-card-top" }, [
                h("span", { class: "job-direction" }, job.direction),
                h("span", job.recruitmentType),
              ]),
              h("h2", job.title),
              h("p", { class: "job-company" }, job.company + " · " + job.city),
              h("p", { class: "job-salary" }, job.salary || "薪资未披露"),
              h(
                "p",
                { class: "job-snippet" },
                job.requirements || job.jd || "暂无岗位说明",
              ),
              h(
                "small",
                "来源：" +
                  job.platform +
                  " · " +
                  job.fetchedAt +
                  " · " +
                  job.addressPrecision,
              ),
              h("div", {
                class: "job-intent-badge" + (baseline.value.includes(job.id) ? " confirmed" : intents.value.includes(job.id) ? " pending" : ""),
              }, baseline.value.includes(job.id) ? "已确认投递意向" : intents.value.includes(job.id) ? "待保存投递意向" : "未确认投递意向"),
              h("div", { class: "job-actions" }, [
                h(
                  "button",
                  {
                    onClick: () => show(job),
                    "aria-label": "查看详情：" + job.title,
                  },
                  "查看详情",
                ),
                h(
                  "button",
                  {
                    class: intents.value.includes(job.id) ? "selected" : "",
                    disabled: !ready.value || saving.value,
                    "aria-pressed": intents.value.includes(job.id),
                    onClick: () => toggle(job.id),
                  },
                  intents.value.includes(job.id)
                    ? baseline.value.includes(job.id) ? "已确认投递意向" : "待保存投递意向"
                    : "加入投递意向",
                ),
              ]),
            ]),
          ),
        ),
        ready.value && !loading.value && !jobs.value.length
          ? h("p", "没有符合筛选条件的岗位，请调整条件。")
          : null,
        h("div", { class: "jobs-footer" }, [
          h(
            "button",
            {
              disabled: page.value <= 1 || loading.value,
              onClick: () => {
                page.value--;
                void load();
              },
            },
            "上一页",
          ),
          h("span", "第 " + page.value + " / " + pageCount.value + " 页"),
          h(
            "button",
            {
              disabled: page.value >= pageCount.value || loading.value,
              onClick: () => {
                page.value++;
                void load();
              },
            },
            "下一页",
          ),
          h(
            "button",
            {
              class: "primary",
              disabled: !ready.value || saving.value || !dirty.value,
              onClick: save,
            },
            saving.value ? "正在保存…" : "保存投递意向",
          ),
        ]),
        h(
          "dialog",
          {
            class: "job-detail",
            ref: dialog,
            "aria-labelledby": "job-detail-title",
            onCancel: close,
          },
          [
            h(
              "button",
              {
                class: "job-detail-close",
                onClick: close,
                "aria-label": "关闭岗位详情",
              },
              "关闭",
            ),
            h(
              "h2",
              { id: "job-detail-title" },
              detail.value?.title || "岗位详情",
            ),
            detailLoading.value
              ? h("p", { role: "status" }, "正在读取详情…")
              : detail.value
                ? [
                    h("h3", detail.value.company),
                    h("h4", "岗位职责"),
                    h("pre", detail.value.jd || "未提供"),
                    h("h4", "任职要求"),
                    h("pre", detail.value.requirements || "未提供"),
                    h(
                      "p",
                      "地址：" +
                        (detail.value.address || "未提供") +
                        "（" +
                        detail.value.addressPrecision +
                        "）",
                    ),
                    safeJobUrl(detail.value.url)
                      ? h(
                          "a",
                          {
                            href: safeJobUrl(detail.value.url)!,
                            target: "_blank",
                            rel: "noopener noreferrer",
                          },
                          "打开来源岗位（新标签页）",
                        )
                      : h("p", "暂无安全有效的来源链接"),
                  ]
                : h("p", { role: "alert" }, error.value || "详情尚未读取"),
          ],
        ),
      ]);
  },
});
