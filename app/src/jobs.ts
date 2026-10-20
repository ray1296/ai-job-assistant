import { defineComponent, h, ref, computed, onMounted } from "vue";
import { api, errorText, session } from "./api";

export default defineComponent({
  setup() {
    const jobs = ref<any[]>([]),
      total = ref(0),
      loading = ref(false),
      error = ref("");
    const q = ref(""),
      direction = ref(""),
      city = ref(""),
      page = ref(1);
    const facets = ref<any>({ directions: [], cities: [] });
    const intents = ref<string[]>([]),
      saved = ref(false),
      detail = ref<any>(null);
    const pageCount = computed(() => Math.max(1, Math.ceil(total.value / 12)));
    async function load() {
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
        const result = await api("/jobs?" + p.toString());
        jobs.value = result.jobs;
        total.value = result.total;
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }
    async function init() {
      try {
        facets.value = await api("/jobs/facets");
        if (session.user) intents.value = (await api("/job-intents")).jobIds;
        await load();
      } catch (e) {
        error.value = errorText(e);
      }
    }
    function toggle(id: string) {
      intents.value = intents.value.includes(id)
        ? intents.value.filter((x) => x !== id)
        : [...intents.value, id];
      saved.value = false;
    }
    async function save() {
      try {
        await api("/job-intents", "PUT", { jobIds: intents.value });
        saved.value = true;
      } catch (e) {
        error.value = errorText(e);
      }
    }
    onMounted(init);
    return () =>
      h("section", { class: "jobs-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "DISCOVER OPPORTUNITIES"),
          h("h1", "发现岗位"),
          h("p", "已导入岗位快照，来源、日期和缺失字段均明确展示。"),
        ]),
        h("div", { class: "jobs-toolbar" }, [
          h("input", {
            value: q.value,
            placeholder: "搜索岗位、公司、方向或JD",
            onInput: (e: any) => (q.value = e.target.value),
            onKeydown: (e: any) => {
              if (e.key === "Enter") {
                page.value = 1;
                void load();
              }
            },
          }),
          h(
            "select",
            {
              value: direction.value,
              onChange: (e: any) => {
                direction.value = e.target.value;
                page.value = 1;
                void load();
              },
            },
            [
              h("option", { value: "" }, "全部方向"),
              ...facets.value.directions.map((x: string) =>
                h("option", { value: x }, x),
              ),
            ],
          ),
          h(
            "select",
            {
              value: city.value,
              onChange: (e: any) => {
                city.value = e.target.value;
                page.value = 1;
                void load();
              },
            },
            [
              h("option", { value: "" }, "全部城市"),
              ...facets.value.cities.map((x: string) =>
                h("option", { value: x }, x),
              ),
            ],
          ),
          h(
            "button",
            {
              class: "primary",
              onClick: () => {
                page.value = 1;
                void load();
              },
            },
            "搜索",
          ),
        ]),
        h(
          "p",
          { class: "jobs-summary" },
          "共 " +
            total.value +
            " 个岗位" +
            (intents.value.length
              ? " · 已选投递意向 " + intents.value.length
              : "") +
            (saved.value ? " · 已保存" : ""),
        ),
        error.value
          ? h("p", { class: "error", role: "alert" }, error.value)
          : null,
        loading.value ? h("p", { role: "status" }, "正在读取岗位…") : null,
        h(
          "div",
          { class: "job-grid" },
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
              h("div", { class: "job-actions" }, [
                h(
                  "button",
                  {
                    onClick: async () => {
                      detail.value = (await api("/jobs/" + job.id)).job;
                    },
                  },
                  "查看详情",
                ),
                session.user
                  ? h(
                      "button",
                      {
                        class: intents.value.includes(job.id) ? "selected" : "",
                        onClick: () => toggle(job.id),
                      },
                      intents.value.includes(job.id)
                        ? "已选投递意向"
                        : "加入投递意向",
                    )
                  : null,
              ]),
            ]),
          ),
        ),
        h("div", { class: "jobs-footer" }, [
          h(
            "button",
            {
              disabled: page.value <= 1,
              onClick: () => {
                page.value--;
                void load();
              },
            },
            "上一页",
          ),
          h("span", page.value + " / " + pageCount.value),
          h(
            "button",
            {
              disabled: page.value >= pageCount.value,
              onClick: () => {
                page.value++;
                void load();
              },
            },
            "下一页",
          ),
          session.user && intents.value.length
            ? h("button", { class: "primary", onClick: save }, "保存投递意向")
            : null,
        ]),
        detail.value
          ? h(
              "div",
              {
                class: "job-detail-overlay",
                onClick: () => (detail.value = null),
              },
              [
                h(
                  "article",
                  {
                    class: "job-detail",
                    onClick: (e: any) => e.stopPropagation(),
                  },
                  [
                    h(
                      "button",
                      { onClick: () => (detail.value = null) },
                      "关闭",
                    ),
                    h("h2", detail.value.title),
                    h("h3", detail.value.company),
                    h("p", "岗位职责"),
                    h("pre", detail.value.jd || "未提供"),
                    h("p", "任职要求"),
                    h("pre", detail.value.requirements || "未提供"),
                    h(
                      "p",
                      "地址：" +
                        detail.value.address +
                        "（" +
                        detail.value.addressPrecision +
                        "）",
                    ),
                    detail.value.url
                      ? h(
                          "a",
                          {
                            href: detail.value.url,
                            target: "_blank",
                            rel: "noopener noreferrer",
                          },
                          "打开来源岗位",
                        )
                      : h("span", "暂无岗位链接"),
                  ],
                ),
              ],
            )
          : null,
      ]);
  },
});
