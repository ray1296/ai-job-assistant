import { computed, defineComponent, h, onBeforeUnmount, onMounted, type PropType } from "vue";

type Page = string[];

/**
 * 求职导航（白板版）
 * 把原来的两套星盘合并成一张纯白板地图：无底图、无粒子、无连线动画。
 * 顺序即求职流程：前置工作 → 投递岗位 → 准备面试 → 工具栏。
 */
// 每个分区一个克制的主题色：只用在圆点、序号与悬停描边上，不铺底色
const GROUPS: { title: string; hint: string; accent: string; ids: string[] }[] = [
  { title: "前置工作", hint: "先把材料备齐：认识自己、写好简历、建好数据空间。", accent: "#3b6fd4", ids: ["home", "guide", "profile", "resume", "data"] },
  { title: "投递岗位", hint: "投递前先看清市场：岗位、企业、租房、数据与通勤路线。", accent: "#0f8f7e", ids: ["jobs", "companies", "housing", "dashboard", "map", "plan"] },
  { title: "准备面试", hint: "题库先上传，题目刷得动，面试才练得实。", accent: "#b4701a", ids: ["study-upload", "knowledge", "practice", "interview"] },
  { title: "工具栏", hint: "协作、心愿与设置，随时可用。", accent: "#5b6478", ids: ["chat", "wish", "settings"] },
];

/** 每个板块一句话介绍，鼠标悬停时浮在小卡片上方显示 */
const DESC: Record<string, string> = {
  home: "今天该做什么：进度、提醒、下一步，都从这里进。",
  guide: "项目怎么用：按板块查功能说明，也能直接问 AI 伙伴。",
  profile: "你的档案：经历、技能、照片，填一次到处复用。",
  resume: "多版本简历：AI 排版与内容审阅，导出 PDF / Word。",
  data: "上传岗位、房源、面经等数据，自动识别字段并去重。",
  jobs: "平台岗位库，按方向、城市、学历筛选，可加入投递方案。",
  companies: "查企业档案、风评与工商信息，判断值不值得投。",
  housing: "按城市和预算找房，和通勤时间一起算。",
  dashboard: "省份分布、薪资水平、岗位词云，看市场整体。",
  map: "岗位和房源落在同一张地图上，算清楚住哪、上班多久。",
  plan: "为某个岗位生成投递方案，事实校验后保存追踪。",
  "study-upload": "上传自己的题库，导入后立刻能在面经八股看到。",
  knowledge: "平台题库加上你上传的题目，带来源可以核对。",
  practice: "刷题、收藏、错题本，AI 讲题带步骤与 3D 演示。",
  interview: "文字或语音全双工模拟面试，逐轮追问并给出复盘。",
  chat: "四位 AI 伙伴协作，可以调用工具、生成报告页。",
  wish: "把想做的事丢进心愿池，一件件打勾。",
  settings: "账号、音色、配色与 AI 伙伴显示设置。",
};

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
            h("section", { class: "nav-group", key: g.title, style: { "--grp": g.accent } }, [
              h("div", { class: "nav-group-head" }, [
                h("h2", null, [h("span", { class: "nav-group-dot", "aria-hidden": "true" }), g.title]),
                h("p", null, g.hint),
              ]),
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
                      "data-desc": DESC[id] || "",
                    },
                    [
                      h("span", { class: "nav-item-no" }, String(steps.value.get(id) || 0).padStart(2, "0")),
                      h("span", { class: "nav-item-name" }, label(id)),
                      h("span", { class: "nav-item-go", "aria-hidden": "true" }, "→"),
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
