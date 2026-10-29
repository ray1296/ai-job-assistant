import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

type Rect = { x: number; y: number; w: number; h: number };
type Step = {
  title: string;
  body: string;
  hint: string;
  selectors: string[];
};

const STEPS: Step[] = [
  {
    title: "认识你的四位 AI 助手",
    body: "看板娘和三位立绘伙伴会陪你找工作：可以问岗位、简历、学习和生活问题。教程结束后，点他们即可对话；以后网站上有不懂的按钮或功能也可以直接问他们。",
    hint: "点击任意位置，继续认识其他入口",
    selectors: [".live2d-pet-container", ".agent-chip"],
  },
  {
    title: "展开 / 收起 AI 伙伴",
    body: "右下角的圆盘可以展开或收起看板娘和立绘伙伴。拖动圆盘还能换位置，把常用助手留在顺手的地方。",
    hint: "点击任意位置继续",
    selectors: [".companions-dial"],
  },
  {
    title: "展开星盘：全站导航",
    body: "左下角的「展开星盘」是网站的总导航。打开后可以进入岗位、简历、学习、面试、地图等各个板块。",
    hint: "点击任意位置继续",
    selectors: [".orbit-trigger"],
  },
  {
    title: "旅程地图：另一种导航画面",
    body: "右上角的「旅程地图」和星盘作用相同，只是换成上一版星球旅程的画面。两个入口都能进入全部板块。",
    hint: "点击任意位置继续",
    selectors: [".journey-map-entry"],
  },
  {
    title: "功能说明：随时查按钮",
    body: "右上角「功能说明」里能查每个板块和按钮的作用。也可以直接问 AI 助手；想重新看新手教程，也在这个页面里。",
    hint: "点击任意位置完成新手教程",
    selectors: [".guide-link"],
  },
];

export default defineComponent({
  name: "TutorialOverlay",
  props: { onFinish: { type: Function, required: true } },
  setup(props) {
    const step = ref(0);
    const rects = ref<Rect[]>([]);
    const viewport = ref({ w: typeof window === "undefined" ? 1280 : window.innerWidth, h: typeof window === "undefined" ? 800 : window.innerHeight });

    function visible(el: Element): boolean {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
    }

    function measure() {
      viewport.value = { w: window.innerWidth, h: window.innerHeight };
      const current = STEPS[step.value];
      const next: Rect[] = [];
      for (const sel of current.selectors) {
        for (const el of Array.from(document.querySelectorAll(sel))) {
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          next.push({ x: r.left - 7, y: r.top - 7, w: r.width + 14, h: r.height + 14 });
        }
      }
      rects.value = next;
    }

    function scheduleMeasure() {
      nextTick(() => {
        requestAnimationFrame(measure);
        setTimeout(measure, 220);
      });
    }

    function next() {
      if (step.value >= STEPS.length - 1) {
        props.onFinish();
        return;
      }
      step.value += 1;
      scheduleMeasure();
    }

    function finish() {
      props.onFinish();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); }
    }

    onMounted(() => {
      document.body.classList.add("tutorial-active");
      scheduleMeasure();
      window.addEventListener("resize", scheduleMeasure);
      window.addEventListener("scroll", scheduleMeasure, true);
      window.addEventListener("keydown", onKey);
    });
    onBeforeUnmount(() => {
      document.body.classList.remove("tutorial-active");
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("keydown", onKey);
    });

    return () => {
      const current = STEPS[step.value];
      const maskId = "tutorial-cutout";
      return h("div", { class: "tutorial-root", role: "dialog", "aria-modal": "true", "aria-label": "新手教程" }, [
        h("svg", { class: "tutorial-svg", width: "100%", height: "100%", "aria-hidden": "true" }, [
          h("defs", [
            h("mask", { id: maskId, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: viewport.value.w, height: viewport.value.h }, [
              h("rect", { x: 0, y: 0, width: viewport.value.w, height: viewport.value.h, fill: "#fff" }),
              ...rects.value.map((r) => h("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: 16, fill: "#000" })),
            ]),
          ]),
          h("rect", { x: 0, y: 0, width: "100%", height: "100%", fill: "rgba(4,9,22,.78)", mask: "url(#" + maskId + ")" }),
        ]),
        ...rects.value.map((r, i) => h("div", {
          key: "ring" + i,
          class: "tutorial-ring",
          style: { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" },
        })),
        h("div", { class: "tutorial-click-layer", onClick: next }),
        h("div", { class: "tutorial-card" }, [
          h("div", { class: "tutorial-step" }, "新手教程 " + (step.value + 1) + " / " + STEPS.length),
          h("h3", current.title),
          h("p", current.body),
          h("span", { class: "tutorial-hint" }, current.hint + " →"),
        ]),
        h("button", { class: "tutorial-exit", onClick: (e: Event) => { e.stopPropagation(); finish(); } }, "退出新手教程"),
      ]);
    };
  },
});
