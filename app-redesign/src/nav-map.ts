import { computed, defineComponent, h, onBeforeUnmount, onMounted, type PropType } from "vue";

type Page = string[];

/**
 * 求职导航（白板版）
 * 把原来的两套星盘合并成一张纯白板地图：无底图、无粒子、无连线动画。
 * 顺序即求职流程：前置工作 → 投递岗位 → 准备面试 → 工具栏。
 */
const GROUPS: { title: string; hint: string; ids: string[] }[] = [
  { title: "前置工作", hint: "先把材料备齐：认识自己、写好简历、建好数据空间。", ids: ["home", "guide", "profile", "resume", "data"] },
  { title: "投递岗位", hint: "投递前先看清市场：岗位、企业、租房、数据与通勤路线。", ids: ["jobs", "companies", "housing", "dashboard", "map", "plan"] },
  { title: "准备面试", hint: "题库先上传，题目刷得动，面试才练得实。", ids: ["study-upload", "knowledge", "practice", "interview"] },
  { title: "工具栏", hint: "协作、心愿与设置，随时可用。", ids: ["chat", "wish", "settings"] },
];

export default defineComponent({
  name: "NavMap",
  props: {
    pages: { type: Array as PropType<Page[]>, required: true },
    active: { type: String, default: "" },
    onGo: { type: Function as PropType<(id: string) => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const label = (id: string) => props.pages.find((p) => p[0] === id)?.[1] || id;
    const steps = computed(() => {
      const m = new Map<string, number>();
      let i = 0;
      for (const g of GROUPS) for (const id of g.ids) m.set(id, ++i);
      return m;
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    onMounted(() => window.addEventListener("keydown", onKey));
    onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

    return () =>
      h("div", { class: "nav-map", role: "dialog", "aria-modal": "true", "aria-label": "求职导航" }, [
        h("header", { class: "nav-map-head" }, [
          h("div", { class: "nav-map-title" }, [
            h("h1", { class: "nav-map-h1" }, "求职流程"),
            h(
              "p",
              { class: "nav-map-sub" },
              "从左到右、从上到下，就是一次完整的求职顺序：先把材料备齐，再投递岗位，然后准备面试；工具栏随时可用。",
            ),
          ]),
          h("button", { class: "nav-map-close", onClick: props.onClose, "aria-label": "收起求职导航" }, "收起导航 ×"),
        ]),
        h(
          "div",
          { class: "nav-map-body" },
          GROUPS.map((g) =>
            h("section", { class: "nav-group", key: g.title }, [
              h("div", { class: "nav-group-head" }, [h("h2", null, g.title), h("p", null, g.hint)]),
              h(
                "div",
                { class: "nav-group-grid" },
                g.ids.map((id) =>
                  h(
                    "button",
                    {
                      key: id,
                      class: ["nav-item", props.active === id ? "is-current" : ""],
                      onClick: () => props.onGo(id),
                      "aria-label": label(id),
                      "data-page": id,
                    },
                    [
                      h("span", { class: "nav-item-no" }, String(steps.value.get(id) || 0).padStart(2, "0")),
                      h("span", { class: "nav-item-name" }, label(id)),
                    ],
                  ),
                ),
              ),
            ]),
          ),
        ),
      ]);
  },
});
