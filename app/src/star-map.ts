import { defineComponent, h, ref, type PropType } from "vue";

type Page = string[];
type Position = { x: number; y: number; z: number; size: number };
type Connect = { a: string; b: string; kind: string };

const POS: Record<string, Position> = {
  home: { x: 50, y: 16, z: 50, size: 134 },
  profile: { x: 69, y: 39, z: 24, size: 118 },
  resume: { x: 68, y: 61, z: 38, size: 132 },
  jobs: { x: 50, y: 72, z: 18, size: 124 },
  data: { x: 31, y: 61, z: 30, size: 116 },
  plan: { x: 30, y: 40, z: 42, size: 120 },
  guide: { x: 79, y: 22, z: 8, size: 96 },
  dashboard: { x: 88, y: 44, z: 10, size: 104 },
  companies: { x: 82, y: 70, z: 6, size: 108 },
  housing: { x: 60, y: 86, z: 12, size: 108 },
  knowledge: { x: 38, y: 87, z: 8, size: 106 },
  practice: { x: 17, y: 76, z: 16, size: 112 },
  interview: { x: 10, y: 54, z: 4, size: 100 },
  chat: { x: 16, y: 28, z: 12, size: 110 },
  wish: { x: 35, y: 17, z: 22, size: 100 },
  map: { x: 62, y: 15, z: 14, size: 104 },
  "study-upload": { x: 87, y: 86, z: 0, size: 88 },
  settings: { x: 8, y: 84, z: 0, size: 84 },
};
const CONNECTIONS: Connect[] = [
  { a: "home", b: "profile", kind: "starlight" },
  { a: "profile", b: "resume", kind: "bridge" },
  { a: "resume", b: "jobs", kind: "chain" },
  { a: "jobs", b: "data", kind: "portal" },
  { a: "data", b: "plan", kind: "starlight" },
  { a: "plan", b: "home", kind: "chain" },
  { a: "home", b: "wish", kind: "thread" },
  { a: "wish", b: "map", kind: "bridge" },
  { a: "map", b: "guide", kind: "starlight" },
  { a: "guide", b: "dashboard", kind: "portal" },
  { a: "dashboard", b: "companies", kind: "chain" },
  { a: "companies", b: "housing", kind: "bridge" },
  { a: "housing", b: "knowledge", kind: "thread" },
  { a: "knowledge", b: "practice", kind: "portal" },
  { a: "practice", b: "interview", kind: "chain" },
  { a: "interview", b: "chat", kind: "starlight" },
  { a: "chat", b: "wish", kind: "bridge" },
  { a: "resume", b: "plan", kind: "thread" },
  { a: "jobs", b: "companies", kind: "portal" },
  { a: "knowledge", b: "study-upload", kind: "bridge" },
  { a: "practice", b: "settings", kind: "chain" },
  { a: "dashboard", b: "study-upload", kind: "starlight" },
  { a: "chat", b: "settings", kind: "portal" },
];
const KIND_LABEL: Record<string, string> = { chain: "星链", bridge: "星桥", portal: "星门", starlight: "流光", thread: "命运红线" };
const STARS = (() => { let s = 17; const r = () => (s = (s * 48271) % 2147483647) / 2147483647; return Array.from({ length: 90 }, (_, i) => ({ left: r() * 100, top: r() * 100, d: r() * 6 + 2, delay: r() * 8, size: r() * 2 + 1, key: i })); })();
const DESCS: Record<string, string> = {
  home: "从这里出发，把愿望变成下一步。", profile: "整理你的经历与坐标。", resume: "把故事写成一张纸。", jobs: "在机会的潮汐里寻找坐标。", data: "把散落的信息变成星图。", plan: "规划一条抵达的路。", guide: "先看看这座宇宙怎么运转。", dashboard: "观察整片就业星海。", companies: "识别值得靠近的星球。", housing: "找到可以安放生活的地方。", knowledge: "在书海里点亮问题。", practice: "一剑一题，练到会为止。", interview: "穿过试炼之门。", chat: "和你的 AI 同伴们交谈。", wish: "把愿望投进流星池。", map: "在岛屿与航线之间穿行。", "study-upload": "打开知识传送门。", settings: "校准你的星盘。",
};

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
    function move(e: PointerEvent) {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      tilt.value = { x: ((e.clientY - r.top) / r.height - .5) * -6, y: ((e.clientX - r.left) / r.width - .5) * 7 };
    }
    function reset() { tilt.value = { x: 0, y: 0 }; }
    function pos(id: string) { return POS[id] || { x: 50, y: 50, z: 0, size: 100 }; }
    function linkActive(c: Connect) { return !hovered.value || hovered.value === c.a || hovered.value === c.b; }
    function planet(id: string, name: string, icon: string) {
      const p = pos(id);
      return h("button", {
        key: id,
        class: ["star-planet", props.active === id ? "is-current" : "", hovered.value === id ? "is-hovered" : ""],
        style: { left: p.x + "%", top: p.y + "%", width: p.size + "px", zIndex: 20 + Math.round(p.z), "--z": p.z + "px" },
        onPointerenter: () => (hovered.value = id),
        onPointerleave: () => (hovered.value = ""),
        onFocus: () => (hovered.value = id),
        onBlur: () => (hovered.value = ""),
        onClick: () => props.onGo(id),
        title: DESCS[id] || name,
        "data-page": id,
      }, [
        h("span", { class: "star-planet-halo" }),
        h("span", { class: "star-planet-img" }, [
          h("span", { class: "star-planet-fallback" }, icon),
          h("img", { class: "star-planet-photo", src: "/assets/star-map/" + id + ".webp", alt: "", draggable: false, onError: (e: Event) => ((e.target as HTMLImageElement).style.display = "none") }),
        ]),
        h("span", { class: "star-planet-name" }, name),
        h("span", { class: "star-planet-desc" }, DESCS[id] || "点击进入"),
      ]);
    }
    return () => h("div", { class: "star-map", role: "dialog", "aria-modal": "true", "aria-label": "逐光星盘" }, [
      h("div", { class: "star-map-bg", style: { backgroundImage: 'url("/assets/star-map/cosmos.webp")' } }),
      h("div", { class: "star-map-stars" }, STARS.map((s) => h("i", { key: s.key, style: { left: s.left + "%", top: s.top + "%", width: s.size + "px", height: s.size + "px", animationDuration: s.d + "s", animationDelay: s.delay + "s" } }))),
      h("header", { class: "star-map-head" }, [
        h("div", [h("span", { class: "star-map-eyebrow" }, "THE JOURNEY CONSTELLATION"), h("h1", "逐光星盘"), h("p", "每一颗星球，都是你旅程的一站")]),
        h("button", { class: "star-map-close", onClick: props.onClose, "aria-label": "收起星盘" }, "收起星盘 ×"),
      ]),
      h("div", { class: "star-map-stage", style: { "--rx": tilt.value.x + "deg", "--ry": tilt.value.y + "deg" }, onPointermove: move, onPointerleave: reset }, [
        h("div", { class: "star-ring ring-1" }), h("div", { class: "star-ring ring-2" }), h("div", { class: "star-ring ring-3" }),
        h("div", { class: "star-core" }, [
          h("span", { class: "star-core-glow" }), h("strong", null, "逐光星盘"), h("small", null, "选择你的下一站"),
        ]),
        h("svg", { class: "star-links", viewBox: "0 0 1600 1000", preserveAspectRatio: "none", "aria-hidden": "true" }, CONNECTIONS.map((c, i) => {
          const a = pos(c.a), b = pos(c.b);
          const x1 = a.x * 16, y1 = a.y * 10, x2 = b.x * 16, y2 = b.y * 10;
          const mx = (x1 + x2) / 2 + (i % 2 ? 24 : -24), my = (y1 + y2) / 2 - 32;
          return h("g", { class: ["star-link", "link-" + c.kind, hovered.value && !linkActive(c) ? "is-dim" : "", linkActive(c) ? "is-related" : ""] }, [
            h("path", { d: "M" + x1 + " " + y1 + " Q" + mx + " " + my + " " + x2 + " " + y2, "stroke-dasharray": c.kind === "chain" ? "2 9" : c.kind === "portal" ? "8 12" : c.kind === "thread" ? "1 8" : "none" }),
            c.kind === "chain" ? h("circle", { cx: mx, cy: my, r: 4 }) : null,
            c.kind === "portal" ? h("circle", { cx: mx, cy: my, r: 11 }) : null,
          ]);
        })),
        ...props.pages.map(([id, name, icon]) => planet(id, name, icon)),
      ]),
      h("div", { class: "star-map-foot" }, [
        h("span", null, "拖动视角 · 悬停点亮星链 · 点击星球进入"),
        h("div", { class: "star-map-legend" }, Object.entries(KIND_LABEL).map(([k, label]) => h("span", { class: "legend-" + k }, label))),
      ]),
    ]);
  },
});
