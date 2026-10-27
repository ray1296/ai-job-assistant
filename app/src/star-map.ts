import { computed, defineComponent, h, ref, type PropType } from "vue";

type Page = string[];
type Position = { x: number; y: number; z: number; size: number };
type Connect = { a: string; b: string; kind: string };

const POS: Record<string, Position> = {
  home: { x: 50, y: 13, z: 50, size: 118 },
  profile: { x: 80, y: 38, z: 24, size: 102 },
  resume: { x: 82, y: 62, z: 38, size: 108 },
  jobs: { x: 67, y: 81, z: 18, size: 104 },
  data: { x: 33, y: 62, z: 30, size: 100 },
  plan: { x: 20, y: 38, z: 42, size: 100 },
  guide: { x: 78, y: 11, z: 8, size: 84 },
  dashboard: { x: 93, y: 27, z: 10, size: 88 },
  companies: { x: 89, y: 57, z: 6, size: 94 },
  housing: { x: 76, y: 83, z: 12, size: 96 },
  knowledge: { x: 51, y: 89, z: 8, size: 94 },
  practice: { x: 27, y: 81, z: 16, size: 94 },
  interview: { x: 9, y: 61, z: 4, size: 88 },
  chat: { x: 10, y: 32, z: 12, size: 92 },
  wish: { x: 32, y: 18, z: 22, size: 94 },
  map: { x: 67, y: 18, z: 14, size: 98 },
  "study-upload": { x: 91, y: 84, z: 0, size: 80 },
  settings: { x: 10, y: 87, z: 0, size: 78 },
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
  { a: "knowledge", b: "housing", kind: "worldtree" },
  { a: "data", b: "chat", kind: "rift" },
  { a: "jobs", b: "dashboard", kind: "rail" },
];
const METEORS = (() => { let s = 91; const r = () => (s = (s * 48271) % 2147483647) / 2147483647; return Array.from({ length: 8 }, (_, i) => ({ left: 8 + r() * 85, top: r() * 48, len: 60 + r() * 100, delay: r() * 14, dur: 4 + r() * 3, key: i })); })();
METEORS[0].delay = 0.2; METEORS[0].dur = 3.2; METEORS[0].top = 8; METEORS[0].left = 22;
METEORS[1].delay = 3.4; METEORS[1].dur = 3.8; METEORS[1].top = 18; METEORS[1].left = 70;
const STARS = (() => { let s = 17; const r = () => (s = (s * 48271) % 2147483647) / 2147483647; return Array.from({ length: 140 }, (_, i) => ({ left: r() * 100, top: r() * 100, d: r() * 6 + 2, delay: r() * 8, size: r() * 2.8 + 1, key: i })); })();
const STAR_ASSETS = ["cosmos", "astrolabe", "astrolabe2", ...Object.keys(POS)].map((id) => "/assets/star-map/" + id + ".webp");
let preloadStarted = false;
/** 空闲时预取星盘图片；配合服务端 immutable 缓存，第二次打开几乎瞬时。 */
export function preloadStarAssets() {
  if (preloadStarted) return;
  preloadStarted = true;
  const run = () => STAR_ASSETS.forEach((src) => { const img = new Image(); img.decoding = "async"; img.src = src; });
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 500);
}
function qPoint(x1: number, y1: number, mx: number, my: number, x2: number, y2: number, t: number) {
  const u = 1 - t;
  return { x: u * u * x1 + 2 * u * t * mx + t * t * x2, y: u * u * y1 + 2 * u * t * my + t * t * y2, angle: Math.atan2((my - y1) * u + (y2 - my) * t, (mx - x1) * u + (x2 - mx) * t) * 180 / Math.PI };
}
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
    const hoverPage = computed(() => props.pages.find((p) => p[0] === hovered.value) || null);
    function move(e: PointerEvent) {
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      tilt.value = { x: ((e.clientY - r.top) / r.height - .5) * -6, y: ((e.clientX - r.left) / r.width - .5) * 7 };
    }
    function reset() { tilt.value = { x: 0, y: 0 }; }
    function pos(id: string) { return POS[id] || { x: 50, y: 50, z: 0, size: 100 }; }
    function linkActive(c: Connect) { return !hovered.value || hovered.value === c.a || hovered.value === c.b; }
    function linkGroup(c: Connect, i: number) {
      const a = pos(c.a), b = pos(c.b);
      const x1 = a.x * 16, y1 = a.y * 10, x2 = b.x * 16, y2 = b.y * 10;
      const mx = (x1 + x2) / 2 + (i % 2 ? 24 : -24), my = (y1 + y2) / 2 - 32;
      const path = "M" + x1 + " " + y1 + " Q" + mx + " " + my + " " + x2 + " " + y2;
      const decor: any[] = [];
      if (c.kind === "chain") {
        for (let k = 1; k <= 7; k++) {
          const q = qPoint(x1, y1, mx, my, x2, y2, k / 8);
          decor.push(h("ellipse", { class: "chain-link", cx: q.x, cy: q.y, rx: k % 2 ? 5.2 : 3.4, ry: 2.1, transform: "rotate(" + q.angle + " " + q.x + " " + q.y + ")" }));
        }
      } else if (c.kind === "bridge") {
        for (let k = 1; k <= 9; k++) {
          const q = qPoint(x1, y1, mx, my, x2, y2, k / 10);
          const nx = Math.cos((q.angle + 90) * Math.PI / 180) * 8, ny = Math.sin((q.angle + 90) * Math.PI / 180) * 8;
          decor.push(h("line", { class: "bridge-tie", x1: q.x - nx, y1: q.y - ny, x2: q.x + nx, y2: q.y + ny }));
        }
      } else if (c.kind === "portal") {
        const q = qPoint(x1, y1, mx, my, x2, y2, .5);
        decor.push(h("circle", { class: "portal-ring", cx: q.x, cy: q.y, r: 12 }), h("circle", { class: "portal-ring inner", cx: q.x, cy: q.y, r: 6 }));
      } else if (c.kind === "worldtree") {
        const q = qPoint(x1, y1, mx, my, x2, y2, .5);
        decor.push(h("path", { class: "world-branch", d: "M" + q.x + " " + q.y + " q -24 -24 -38 -46 M" + q.x + " " + q.y + " q 28 -20 45 -34 M" + q.x + " " + q.y + " q -14 26 -28 40" }));
      } else if (c.kind === "rift") {
        const q = qPoint(x1, y1, mx, my, x2, y2, .5);
        decor.push(h("path", { class: "rift-bolt", d: "M" + (q.x - 22) + " " + (q.y + 16) + " l12 -20 l10 12 l13 -24 l9 16 l14 -20" }));
      } else if (c.kind === "rail") {
        for (let k = 1; k <= 8; k++) {
          const q = qPoint(x1, y1, mx, my, x2, y2, k / 9);
          const nx = Math.cos((q.angle + 90) * Math.PI / 180) * 4.5, ny = Math.sin((q.angle + 90) * Math.PI / 180) * 4.5;
          decor.push(h("line", { class: "rail-tie", x1: q.x - nx, y1: q.y - ny, x2: q.x + nx, y2: q.y + ny }));
        }
      }
      if (["starlight", "thread", "worldtree", "rift", "rail", "chain", "bridge", "portal"].includes(c.kind)) {
        for (let k = 0; k < 2; k++) decor.push(h("circle", { class: "link-energy", r: 2.6 }, [h("animateMotion", { dur: (4 + (i % 3)) + "s", begin: (k * 1.6 + (i % 2) * .7) + "s", repeatCount: "indefinite", path })]));
      }
      return h("g", { class: ["star-link", "link-" + c.kind, hovered.value && !linkActive(c) ? "is-dim" : "", linkActive(c) ? "is-related" : ""] }, [
        h("path", { class: "link-base", d: path }),
        ...decor,
      ]);
    }
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
        h("span", { class: "star-planet-shadow" }),
        h("span", { class: "star-planet-base" }),
        h("span", { class: "star-planet-orbit" }),
        h("span", { class: "star-planet-halo" }),
        h("span", { class: "star-planet-img" }, [
          h("span", { class: "star-planet-fallback" }, icon),
          h("img", { class: "star-planet-photo", src: "/assets/star-map/" + id + ".webp", alt: "", draggable: false, onError: (e: Event) => ((e.target as HTMLImageElement).style.display = "none") }),
        ]),
        h("span", { class: "star-planet-name" }, name),
        h("span", { class: "star-planet-desc" }, DESCS[id] || "点击进入"),
      ]);
    }
    return () => h("div", { class: ["star-map", hovered.value ? "is-previewing" : ""], role: "dialog", "aria-modal": "true", "aria-label": "逐光星盘" }, [
      h("div", { class: "star-map-bg", style: { backgroundImage: 'url("/assets/star-map/cosmos.webp")' } }),
      h("div", { class: "star-map-stars" }, STARS.map((s) => h("i", { key: s.key, style: { left: s.left + "%", top: s.top + "%", width: s.size + "px", height: s.size + "px", animationDuration: s.d + "s", animationDelay: s.delay + "s" } }))),
      h("div", { class: "star-meteors", "aria-hidden": "true" }, METEORS.map((m) => h("i", { key: m.key, style: { left: m.left + "%", top: m.top + "%", width: m.len + "px", animationDelay: m.delay + "s", animationDuration: m.dur + "s" } }))),
      h("header", { class: "star-map-head" }, [
        h("div", [h("span", { class: "star-map-eyebrow" }, "THE JOURNEY CONSTELLATION"), h("h1", "逐光星盘"), h("p", "每一颗星球，都是你旅程的一站")]),
        h("button", { class: "star-map-close", onClick: props.onClose, "aria-label": "收起星盘" }, "收起星盘 ×"),
      ]),
      h("div", { class: "star-map-stage", style: { "--rx": tilt.value.x + "deg", "--ry": tilt.value.y + "deg" }, onPointermove: move, onPointerleave: reset }, [
        h("div", { class: "star-ring ring-1" }), h("div", { class: "star-ring ring-2" }), h("div", { class: "star-ring ring-3" }),
        h("div", { class: "star-core" }, [
          h("span", { class: "star-core-glow" }), h("span", { class: "star-core-art" }), h("span", { class: "star-core-sweep" }), h("span", { class: "star-core-rune" }, "✦"),
          h("strong", null, "逐光星盘"), h("small", null, "选择你的下一站"),
        ]),
        h("svg", { class: "star-links", viewBox: "0 0 1600 1000", preserveAspectRatio: "none", "aria-hidden": "true" }, CONNECTIONS.map((c, i) => linkGroup(c, i))),
        ...props.pages.map(([id, name, icon]) => planet(id, name, icon)),
      ]),
      hoverPage.value
        ? h("div", { class: "star-preview", "aria-hidden": "true" }, [
            h("div", { class: "star-preview-img", style: { backgroundImage: 'url("/assets/star-map/' + hoverPage.value[0] + '.webp")' } }),
            h("strong", null, hoverPage.value[1]),
            h("p", null, DESCS[hoverPage.value[0]] || "点击进入这一站"),
          ])
        : null,
      h("div", { class: "star-map-foot" }, [
        h("span", null, "拖动视角 · 悬停点亮星球 · 点击进入"),
      ]),
    ]);
  },
});
