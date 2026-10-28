import { computed, defineComponent, h, ref, type PropType } from "vue";

type Page = string[];
type NodeDef = { x: number; y: number; desc: string; side?: "left" | "right" };

const BG = "/assets/star-map/rpg-cosmos.jpg";
const NODES: Record<string, NodeDef> = {
  home: { x: 55.1, y: 49.2, desc: "从这里出发，把愿望变成下一步。", side: "right" },
  guide: { x: 17.8, y: 27.0, desc: "先看看这座宇宙怎么运转。", side: "right" },
  knowledge: { x: 33.2, y: 15.6, desc: "在书海里点亮问题。", side: "right" },
  practice: { x: 45.1, y: 20.2, desc: "一剑一题，练到会为止。", side: "right" },
  map: { x: 59.8, y: 15.6, desc: "在岛屿与航线之间穿行。", side: "right" },
  dashboard: { x: 81.2, y: 18.4, desc: "观察整片就业星海。", side: "left" },
  interview: { x: 90.1, y: 34.3, desc: "穿过试炼之门。", side: "left" },
  companies: { x: 76.0, y: 44.8, desc: "识别值得靠近的星球。", side: "left" },
  chat: { x: 68.0, y: 60.0, desc: "和你的 AI 同伴们交谈。", side: "left" },
  settings: { x: 87.0, y: 56.2, desc: "校准你的星盘。", side: "left" },
  housing: { x: 80.0, y: 76.0, desc: "找到可以安放生活的地方。", side: "left" },
  wish: { x: 59.7, y: 75.0, desc: "把愿望投进流星池。", side: "right" },
  plan: { x: 45.7, y: 72.8, desc: "规划一条抵达的路。", side: "right" },
  jobs: { x: 34.0, y: 83.0, desc: "在机会的潮汐里寻找坐标。", side: "right" },
  data: { x: 17.6, y: 71.0, desc: "把散落的信息变成星图。", side: "right" },
  profile: { x: 27.8, y: 56.5, desc: "整理你的经历与坐标。", side: "right" },
  resume: { x: 11.8, y: 47.0, desc: "把故事写成一张纸。", side: "right" },
  "study-upload": { x: 29.0, y: 39.6, desc: "打开知识传送门。", side: "right" },
};
const LINKS = [
  ["home", "guide"], ["guide", "knowledge"], ["knowledge", "practice"],
  ["practice", "map"], ["map", "dashboard"], ["dashboard", "interview"],
  ["interview", "companies"], ["companies", "chat"], ["chat", "settings"],
  ["settings", "housing"], ["housing", "wish"], ["wish", "plan"],
  ["plan", "jobs"], ["jobs", "data"], ["data", "profile"],
  ["profile", "resume"], ["resume", "study-upload"], ["study-upload", "home"],
];
const STARS = (() => { let s = 23; const r = () => (s = (s * 48271) % 2147483647) / 2147483647; return Array.from({ length: 130 }, (_, i) => ({ left: r() * 100, top: r() * 100, size: 3 + r() * 7, d: 3 + r() * 6, delay: r() * 8, key: i })); })();
const METEORS = (() => { let s = 91; const r = () => (s = (s * 48271) % 2147483647) / 2147483647; return Array.from({ length: 7 }, (_, i) => ({ left: 4 + r() * 88, top: r() * 46, len: 75 + r() * 100, delay: r() * 12, dur: 3.6 + r() * 3, key: i })); })();

function pct(id: string) { return NODES[id] || { x: 50, y: 50, desc: "" }; }
function vx(id: string) { return pct(id).x * 10; }
function vy(id: string) { return pct(id).y * 5.62; }

export function preloadStarAssets() {
  const im = new Image();
  im.src = BG;
  im.decode?.().catch(() => {});
}

export default defineComponent({
  props: {
    pages: { type: Array as PropType<Page[]>, required: true },
    active: { type: String, default: "" },
    onGo: { type: Function as PropType<(id: string) => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const hovered = ref("");
    const tilt = ref({ x: 0, y: 0 });
    const hoverPage = computed(() => props.pages.find((p) => p[0] === hovered.value) || null);
    const hoverNode = computed(() => (hovered.value ? pct(hovered.value) : null));
    const title = (id: string) => props.pages.find((p) => p[0] === id)?.[1] || id;
    function move(e: PointerEvent) {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      tilt.value = { x: ((e.clientY - r.top) / r.height - .5) * -2.2, y: ((e.clientX - r.left) / r.width - .5) * 2.4 };
    }
    function reset() { tilt.value = { x: 0, y: 0 }; }
    function node(id: string) {
      const p = pct(id);
      return h("button", {
        key: id,
        class: ["rpg-node", props.active === id ? "is-current" : "", hovered.value === id ? "is-hovered" : "", p.side || "right"],
        style: { left: p.x + "%", top: p.y + "%" },
        onPointerenter: () => (hovered.value = id),
        onPointerleave: () => (hovered.value = ""),
        onFocus: () => (hovered.value = id),
        onBlur: () => (hovered.value = ""),
        onClick: () => props.onGo(id),
        "aria-label": title(id),
        "data-page": id,
      }, [
        h("span", { class: "rpg-node-ring" }),
        h("span", { class: "rpg-node-core" }, "✦"),
        h("span", { class: "rpg-node-name" }, title(id)),
        h("span", { class: "rpg-node-desc" }, p.desc),
      ]);
    }
    function link(pair: string[], i: number) {
      const [a, b] = pair;
      const x1 = vx(a), y1 = vy(a), x2 = vx(b), y2 = vy(b);
      const mx = (x1 + x2) / 2 + (i % 2 ? 30 : -30);
      const my = (y1 + y2) / 2 - 24 - (i % 3) * 8;
      const d = "M" + x1 + " " + y1 + " Q" + mx + " " + my + " " + x2 + " " + y2;
      return h("g", { key: a + b, class: "rpg-link" }, [
        h("path", { class: "rpg-link-base", d }),
        h("path", { class: "rpg-link-glow", d }),
        h("circle", { class: "rpg-link-spark", r: 2.4 }, [h("animateMotion", { dur: 4.5 + i * .17 + "s", begin: i * .35 + "s", repeatCount: "indefinite", path: d })]),
      ]);
    }
    return () => h("div", { class: ["star-map", "rpg-map"], role: "dialog", "aria-modal": "true", "aria-label": "逐光星盘" }, [
      h("div", { class: "rpg-stars" }, STARS.map((s) => h("i", { key: s.key, style: { left: s.left + "%", top: s.top + "%", width: s.size + "px", height: s.size + "px", animationDuration: s.d + "s", animationDelay: s.delay + "s" } }))),
      h("div", { class: "rpg-meteors" }, METEORS.map((m) => h("i", { key: m.key, style: { left: m.left + "%", top: m.top + "%", width: m.len + "px", animationDelay: m.delay + "s", animationDuration: m.dur + "s" } }))),
      h("header", { class: "rpg-head" }, [
        h("div", [h("span", { class: "rpg-eyebrow" }, "THE JOURNEY CONSTELLATION"), h("h1", "逐光星盘"), h("p", "十八座浮空岛，记录你的求职旅程")]),
        h("button", { class: "rpg-close", onClick: props.onClose, "aria-label": "收起星盘" }, "收起星盘 ×"),
      ]),
      h("div", { class: "rpg-stage-wrap" }, h("div", {
        class: "rpg-stage",
        style: { "--rx": tilt.value.x + "deg", "--ry": tilt.value.y + "deg" },
        onPointermove: move,
        onPointerleave: reset,
      }, [
        h("div", { class: "rpg-canvas", style: { backgroundImage: "url(\"" + BG + "\")" } }),
        h("div", { class: "rpg-vignette" }),
        ...props.pages.map(([id]) => node(id)),
      ])),
      hoverPage.value && hoverNode.value
        ? h("aside", { class: "rpg-preview", "aria-hidden": "true" }, [
            h("div", {
              class: "rpg-preview-img",
              style: {
                backgroundImage: "url(\"" + BG + "\")",
                backgroundSize: "300% auto",
                backgroundPosition: hoverNode.value.x + "% " + hoverNode.value.y + "%",
              },
            }),
            h("div", { class: "rpg-preview-copy" }, [
              h("span", null, "法天象地 · ✦"),
              h("strong", null, hoverPage.value[1]),
              h("p", null, hoverNode.value.desc || "点击进入这一站"),
              h("small", null, "点击星球进入 →"),
            ]),
          ])
        : null,
      h("div", { class: "rpg-foot" }, [h("span", null, "拖动视角 · 悬停放大 · 点击进入")]),
    ]);
  },
});
