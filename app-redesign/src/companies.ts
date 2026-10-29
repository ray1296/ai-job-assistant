import { defineComponent, h, ref, computed, onMounted } from "vue";
import { api, errorText } from "./api";

export default defineComponent({
  setup() {
    const list = ref<any[]>([]);
    const q = ref("");
    const city = ref("");
    const loading = ref(true);
    const error = ref("");
    const detail = ref<any>(null);
    const detailLoading = ref(false);

    async function load() {
      loading.value = true; error.value = "";
      try {
        const r = await api<any>("/companies?q=" + encodeURIComponent(q.value) + "&city=" + encodeURIComponent(city.value), "GET", undefined, { timeoutMs: 30000 });
        list.value = r.companies || [];
      } catch (e) { error.value = errorText(e); }
      finally { loading.value = false; }
    }
    async function open(id: string) {
      detailLoading.value = true;
      try {
        const r = await api<any>("/companies/" + id, "GET", undefined, { timeoutMs: 30000 });
        detail.value = r.company;
      } catch (e) { error.value = errorText(e); }
      finally { detailLoading.value = false; }
    }
    onMounted(load);

    const cities = ["北京", "上海", "深圳", "杭州", "广州", "成都", "武汉", "南京", "西安", "厦门"];
    const RATING_COLOR: Record<string, string> = { "A+": "#2f9e8f", A: "#57b894", "A-": "#8fbf7f", B: "#e0a63c", "B-": "#e08a3c", C: "#d9534f" };

    const infoRows = (c: any) => ([
      ["公司全称", c.fullName], ["统一社会信用代码", c.creditCode], ["成立日期", c.founded],
      ["注册资本", c.capital], ["法定代表人", c.legalPerson], ["经营状态", c.status],
      ["注册地址", c.address], ["企业规模", c.scale], ["所属行业", c.industry],
      ["融资/上市", c.financing], ["岗位方向", c.directions], ["覆盖城市", c.cities],
      ["本表岗位数", c.jobCount], ["薪资待遇", c.salary], ["风评样本量", c.samples],
    ] as [string, string][]).filter(([, v]) => v);

    const reviewRows = (c: any) => ([
      ["薪资福利", c.benefits], ["加班强度", c.overtime], ["面试体验", c.interviewExp],
      ["正面口碑", c.pros], ["负面口碑", c.cons],
    ] as [string, string][]).filter(([, v]) => v);

    const channels = (c: any) => [
      ["数据来源", c.source], ["工商核验", c.bizSource], ["核验状态", c.bizVerified],
      ["评论获取", c.reviewStatus], ["平台覆盖", c.coverage], ["职Q", c.zhiqScore || c.zhiqStatus],
    ].filter(([, v]) => v) as [string, string][];

    return () =>
      h("div", { class: "proto-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR CAREER, YOUR WAY"),
          h("h1", "企业观察"),
          h("p", "先看企业底细与风评，再决定要不要投"),
        ]),
        h("div", { class: "toolbar" }, [
          h("input", {
            class: "map-input", style: "max-width:260px", placeholder: "搜索公司、行业、方向",
            value: q.value,
            onInput: (e: Event) => (q.value = (e.target as HTMLInputElement).value),
            onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void load(); },
          }),
          h("button", { class: "btn", onClick: () => void load() }, "搜索"),
          h("button", { class: "btn" + (city.value === "" ? " primary" : ""), onClick: () => { city.value = ""; void load(); } }, "全部城市"),
          ...cities.map((c) => h("button", {
            class: "btn" + (city.value === c ? " primary" : ""),
            onClick: () => { city.value = c; void load(); },
          }, c)),
        ]),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
        h("div", { class: "notice" }, "数据来自公开渠道整理（2026-10-19），仅作求职参考；样本有限，建议你自己再核对一遍。"),

        detail.value
          ? h("section", { class: "card company-detail" }, [
              h("div", { class: "company-detail-head" }, [
                h("div", [h("h2", detail.value.name), h("small", [detail.value.industry, detail.value.scale].filter(Boolean).join(" · "))]),
                h("div", [
                  h("span", { class: "company-rating", style: { background: RATING_COLOR[detail.value.rating] || "#8b7d99" } }, detail.value.rating || "—"),
                  h("button", { class: "btn", onClick: () => (detail.value = null) }, "关闭"),
                ]),
              ]),
              detail.value.summary ? h("p", { class: "company-summary" }, detail.value.summary) : null,
              h("h3", "风评"),
              h("div", { class: "table" }, reviewRows(detail.value).map(([k, v]) =>
                h("div", { class: "tr c2", style: { gridTemplateColumns: "130px 1fr" } }, [h("span", k), h("span", String(v))]))),
              h("h3", "工商与规模"),
              h("div", { class: "table" }, infoRows(detail.value).map(([k, v]) =>
                h("div", { class: "tr c2", style: { gridTemplateColumns: "130px 1fr" } }, [h("span", k), h("span", String(v))]))),
              h("h3", "渠道与核验"),
              h("div", { class: "table" }, channels(detail.value).map(([k, v]) =>
                h("div", { class: "tr c2", style: { gridTemplateColumns: "130px 1fr" } }, [h("span", k), h("span", String(v))]))),
              h("p", { class: "muted" }, "想看更多真实评价？建议自己去脉脉、职Q、看准网、牛客搜公司名——我们样本有限，渠道给你，结论你定。"),
            ])
          : null,

        loading.value
          ? h("p", { role: "status" }, "正在读取企业数据…")
          : h("div", { class: "company-grid" }, list.value.map((c) =>
              h("article", { class: "company-card", onClick: () => void open(c.id) }, [
                h("div", { class: "company-card-top" }, [
                  h("strong", c.name),
                  h("span", { class: "company-rating", style: { background: RATING_COLOR[c.rating] || "#8b7d99" } }, c.rating || "—"),
                ]),
                h("small", [c.industry, c.scale].filter(Boolean).join(" · ")),
                h("p", c.summary || ""),
                h("div", { class: "company-tags" }, String(c.cities || "").split(/[\/、,，]/).filter(Boolean).slice(0, 5).map((x) => h("span", { class: "dash-tag" }, x))),
                h("small", "本表岗位 " + (c.jobCount || "—") + " 个 · 点开看风评"),
              ])),
          ),
      ]);
  },
});
