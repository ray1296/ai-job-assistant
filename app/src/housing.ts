import { defineComponent, h, ref, onMounted } from "vue";
import { api, errorText } from "./api";

export default defineComponent({
  setup() {
    const items = ref<any[]>([]);
    const cities = ref<string[]>([]);
    const areas = ref<string[]>([]);
    const city = ref("");
    const area = ref("");
    const q = ref("");
    const maxRent = ref(0);
    const page = ref(1);
    const total = ref(0);
    const size = 24;
    const loading = ref(true);
    const error = ref("");

    async function load(p = 1) {
      loading.value = true; error.value = "";
      try {
        const r = await api<any>(
          "/housing?city=" + encodeURIComponent(city.value) + "&area=" + encodeURIComponent(area.value) +
          "&q=" + encodeURIComponent(q.value) + "&maxRent=" + maxRent.value + "&page=" + p,
          "GET", undefined, { timeoutMs: 30000 },
        );
        items.value = r.items || [];
        total.value = r.total || 0;
        page.value = r.page || 1;
        if (r.cities?.length) cities.value = r.cities;
        areas.value = r.areas || [];
      } catch (e) { error.value = errorText(e); }
      finally { loading.value = false; }
    }
    onMounted(() => void load(1));

    const pageCount = () => Math.max(1, Math.ceil(total.value / size));

    const CHANNELS = [
      ["链家", "https://bj.lianjia.com/zufang/", "房源真实、可约看，中介费通常一个月租金"],
      ["贝壳找房", "https://www.ke.com/", "覆盖广，和链家同源"],
      ["安居客", "https://www.anjuke.com/", "房源多但需防虚假图片"],
      ["自如", "https://www.ziroom.com/", "长租公寓，月付、服务费另算"],
      ["豆瓣租房小组", "https://www.douban.com/group/", "个人转租多，注意核实房东身份"],
      ["闲鱼", "https://www.goofish.com/", "个人房源，务必线下面签、不要先付定金"],
    ];

    return () =>
      h("div", { class: "proto-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR CAREER, YOUR WAY"),
          h("h1", "租房与生活"),
          h("p", "先按区域看清租金，再决定住在哪"),
        ]),
        h("div", { class: "toolbar housing-toolbar" }, [
          h("div", { class: "housing-cities" }, [
            h("button", { class: "btn housing-chip" + (city.value === "" ? " primary" : ""), onClick: () => { city.value = ""; area.value = ""; void load(1); } }, "全部城市"),
            ...cities.value.map((c) => h("button", {
              class: "btn housing-chip" + (city.value === c ? " primary" : ""),
              onClick: () => { city.value = c; area.value = ""; void load(1); },
            }, c)),
          ]),
          h("div", { class: "housing-filters" }, [
            h("input", {
              class: "map-input housing-search", placeholder: "搜小区或区域",
              value: q.value, onInput: (e: Event) => (q.value = (e.target as HTMLInputElement).value),
              onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void load(1); },
            }),
            h("button", { class: "btn primary housing-search-btn", onClick: () => void load(1) }, "搜索"),
            h("label", { class: "housing-rent" }, [
              h("span", "租金"),
              h("select", {
                "aria-label": "租金上限",
                value: String(maxRent.value),
                onChange: (e: Event) => { maxRent.value = Number((e.target as HTMLSelectElement).value); void load(1); },
              }, [["0", "不限"], ["2000", "≤2000"], ["3000", "≤3000"], ["5000", "≤5000"], ["8000", "≤8000"], ["12000", "≤12000"]]
                .map(([v, t]) => h("option", { value: v }, t))),
            ]),
          ]),
        ]),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,

        areas.value.length
          ? h("div", { class: "tabs" }, [
              h("button", { class: "tab" + (area.value === "" ? " chosen" : ""), onClick: () => { area.value = ""; void load(1); } }, "全部片区"),
              ...areas.value.map((a) => h("button", {
                class: "tab" + (area.value === a ? " chosen" : ""),
                onClick: () => { area.value = a; void load(1); },
              }, a)),
            ])
          : null,

        h("div", { class: "grid two" }, [
          h("section", { class: "card" }, [
            h("h3", "房源（" + total.value + " 条）"),
            loading.value
              ? h("p", { role: "status" }, "正在读取…")
              : h("div", { class: "housing-list" }, items.value.map((x) =>
                  h("a", { class: "housing-item", href: x.url || "#housing", target: x.url ? "_blank" : undefined, rel: "noopener noreferrer" }, [
                    h("div", { class: "housing-main" }, [
                      h("strong", x.title || x.community || "房源"),
                      h("small", [x.city, x.district, x.businessArea, x.community].filter(Boolean).join(" · ")),
                    ]),
                    h("div", { class: "housing-side" }, [
                      h("span", { class: "housing-rent" }, (x.rent || "—") + " 元/月"),
                      h("small", [x.layout, x.area ? x.area + "㎡" : ""].filter(Boolean).join(" · ")),
                    ]),
                  ]))),
            total.value > size
              ? h("div", { class: "housing-pager" }, [
                  h("button", { class: "btn", disabled: page.value <= 1, onClick: () => void load(page.value - 1) }, "上一页"),
                  h("span", "第 " + page.value + " / " + pageCount() + " 页"),
                  h("button", { class: "btn", disabled: page.value >= pageCount(), onClick: () => void load(page.value + 1) }, "下一页"),
                ])
              : null,
          ]),
          h("section", { class: "card" }, [
            h("h3", "推荐渠道"),
            h("p", { class: "muted" }, "我们的样本只有链家/安居客的片区房源，量不大。找房建议直接在下面这些渠道自己搜，再用地图核地理位置。"),
            h("div", { class: "housing-channels" }, CHANNELS.map(([name, url, note]) =>
              h("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: "housing-channel" }, [
                h("strong", name),
                h("small", note),
              ]))),
          ]),
        ]),
      ]);
  },
});
