import { defineComponent, h, ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { api, errorText } from "./api";

let sdkPromise: Promise<any> | null = null;
function loadAMap(cfg: { key: string; security: string }) {
  if ((window as any).AMap) return Promise.resolve((window as any).AMap);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    (window as any)._AMapSecurityConfig = { securityJsCode: cfg.security };
    const s = document.createElement("script");
    s.src =
      "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(cfg.key) +
      "&plugin=AMap.ToolBar,AMap.Scale,AMap.MapType,AMap.HawkEye,AMap.Geolocation,AMap.RangingTool,AMap.AutoComplete,AMap.PlaceSearch,AMap.MouseTool,AMap.Geocoder";
    s.async = true;
    s.onload = () => resolve((window as any).AMap);
    s.onerror = () => reject(new Error("高德 JS SDK 加载失败，请检查网络或 key 白名单"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch { return false; }
}
const TILE = 256;
const lngX = (lng: number, z: number) => ((lng + 180) / 360) * Math.pow(2, z) * TILE;
const latY = (lat: number, z: number) => {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z) * TILE;
};
const KIND: Record<string, { color: string; label: string }> = {
  job: { color: "#7460c9", label: "岗位" },
  housing: { color: "#2f9e8f", label: "租房" },
  subway: { color: "#3b82f6", label: "地铁站" },
  hotel: { color: "#e08a3c", label: "酒店" },
  found: { color: "#e0473c", label: "推荐" },
};

export default defineComponent({
  setup() {
    const mapEl = ref<HTMLElement | null>(null);
    let AMap: any = null;
    let map: any = null;
    let infoWindow: any = null;
    let ruler: any = null;
    let routeLine: any = null;
    let radiusCircle: any = null;
    const markerGroups: Record<string, any[]> = { job: [], housing: [], subway: [], hotel: [], found: [] };

    const useFallback = ref(false);
    const fb = ref({ zoom: 12, lng: 121.4737, lat: 31.2304 });
    const fbSize = ref({ w: 1200, h: 800 });
    const fbPopup = ref<any>(null);
    const ready = ref(false);
    const error = ref("");
    const notice = ref("");
    const toolboxOpen = ref(true);
    const tbBtn = ref({ x: 24, y: 78 });
    let btnDrag: any = null;
    function btnDown(e: PointerEvent) {
      btnDrag = { x: e.clientX, y: e.clientY, ox: tbBtn.value.x, oy: tbBtn.value.y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    function btnUp() {
      if (btnDrag && !btnDrag.moved) toolboxOpen.value = !toolboxOpen.value;
      btnDrag = null;
    }
    const tbPos = computed(() => ({ x: tbBtn.value.x, y: tbBtn.value.y + 42 }));
    function btnMove(e: PointerEvent) {
      if (!btnDrag) return;
      const dx = e.clientX - btnDrag.x, dy = e.clientY - btnDrag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) btnDrag.moved = true;
      if (!btnDrag.moved) return;
      tbBtn.value = {
        x: Math.max(8, Math.min(window.innerWidth - 120, btnDrag.ox + dx)),
        y: Math.max(8, Math.min(window.innerHeight - 60, btnDrag.oy + dy)),
      };
    }
    const layers = ref<any>({ jobs: [], housing: [] });
    const showJobs = ref(true);
    const showHousing = ref(true);
    const showSubway = ref(false);
    const showSubwayLines = ref(false);
    const subwayLines = ref<any[]>([]);
    const subwayLineObjs: any[] = [];
    const showHotels = ref(false);
    const radius = ref(2000);
    const hotels = ref<any[]>([]);
    const subway = ref<any[]>([]);
    const extra = ref<any[]>([]);
    const jobSel = ref<any>(null);
    const houseSel = ref<any>(null);
    const mode = ref<"transit" | "drive" | "walk" | "bicycle">("transit");
    const routeInfo = ref<any>(null);
    const busying = ref(false);
    const measuring = ref(false);
    const tips = ref<any[]>([]);
    const tipFor = ref<"" | "search" | "from" | "to">("");
    const tipPos = ref({ x: 0, y: 0, w: 260 });
    const routeOpen = ref(false);
    let auto: any = null;
    let toastTimer: any = null;
    watch(notice, (v) => {
      if (toastTimer) clearTimeout(toastTimer);
      if (v) toastTimer = setTimeout(() => (notice.value = ""), 4500);
    });
    watch(error, (v) => {
      if (toastTimer) clearTimeout(toastTimer);
      if (v) toastTimer = setTimeout(() => (error.value = ""), 6000);
    });
    function autocomplete(kind: "search" | "from" | "to", value: string, ev: Event) {
      tipFor.value = kind;
      const el = ev.target as HTMLElement;
      const r = el.getBoundingClientRect();
      tipPos.value = { x: r.left, y: r.bottom + 4, w: Math.max(r.width, 240) };
      if (!value.trim()) { tips.value = []; return; }
      if (!auto) { tips.value = []; return; }
      auto.search(value, (st: string, res: any) => {
        tips.value = (res?.tips || []).filter((t: any) => t.location).slice(0, 8);
      });
    }
    async function pickTip(t: any) {
      const name = t.name || t.district || "";
      if (tipFor.value === "search") searchFrom.value = name;
      else if (tipFor.value === "from") searchFrom.value = name;
      else if (tipFor.value === "to") searchTo.value = name;
      tips.value = [];
      const loc = t.location;
      if (loc && map) map.setZoomAndCenter(15, [loc.lng, loc.lat]);
      tipFor.value = "";
    }
    const searchFrom = ref("");
    const searchTo = ref("");
    const poiBusy = ref(false);
    const poiKind = ref("");
    const aiInput = ref("");
    const ai = ref<any>(null);
    const aiBusy = ref(false);

    const POI_TYPES: Record<string, { types: string; label: string }> = {
      mall: { types: "060100", label: "商场" },
      gas: { types: "010100", label: "加油站" },
      community: { types: "120300", label: "小区" },
      scenic: { types: "110000", label: "景点" },
      leisure: { types: "080000", label: "休闲娱乐" },
      subway: { types: "150500", label: "地铁站" },
    };

    function clearGroup(name: string) {
      for (const m of markerGroups[name]) m.setMap(null);
      markerGroups[name] = [];
    }
    const validPos = (p: any) => p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lat) <= 85 && Math.abs(p.lng) <= 180;
    function markerOf(kind: string, item: any, onClick: () => void) {
      if (!validPos(item?.pos)) return null;
      const el = document.createElement("div");
      el.className = "amap-dot";
      el.style.cssText = "width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);background:" + KIND[kind].color + ";cursor:pointer";
      const m = new AMap.Marker({ position: [item.pos.lng, item.pos.lat], content: el, offset: new AMap.Pixel(-7, -7), title: item.title || item.name || "" });
      m.on("click", onClick);
      m.setMap(map);
      (markerGroups[kind] || (markerGroups[kind] = [])).push(m);
      return m;
    }

    // 通用地点卡片：带关闭、设为岗位/住房、缺少电话时补查详情
    function cardDom(opts: {
      title: string; rows: [string, string][]; pos: { lng: number; lat: number };
      url?: string; poiId?: string; onSet?: boolean;
    }) {
      const box = document.createElement("div");
      box.className = "amap-card";
      const head = document.createElement("div");
      head.className = "amap-card-head";
      const title = document.createElement("strong");
      title.textContent = opts.title || "未命名";
      const close = document.createElement("button");
      close.className = "amap-card-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "关闭");
      close.onclick = () => infoWindow.close();
      head.appendChild(title);
      head.appendChild(close);
      box.appendChild(head);
      const body = document.createElement("div");
      const paint = (rows: [string, string][]) => {
        body.innerHTML = "";
        for (const [k, v] of rows) {
          if (!v) continue;
          const p2 = document.createElement("p");
          p2.textContent = k + "：" + v;
          body.appendChild(p2);
        }
      };
      paint(opts.rows);
      box.appendChild(body);
      if (opts.onSet !== false) {
        const actions = document.createElement("div");
        actions.className = "amap-info-actions";
        const b1 = document.createElement("button");
        b1.textContent = "设为岗位地址";
        b1.onclick = () => {
          jobSel.value = { title: opts.title, address: opts.rows.find((r) => r[0] === "地址")?.[1] || "", pos: opts.pos };
          notice.value = "已设为岗位地址：" + opts.title;
          infoWindow.close();
        };
        const b2 = document.createElement("button");
        b2.textContent = "设为住房地址";
        b2.onclick = () => {
          houseSel.value = { title: opts.title, address: opts.rows.find((r) => r[0] === "地址")?.[1] || "", pos: opts.pos };
          notice.value = "已设为住房地址：" + opts.title;
          infoWindow.close();
        };
        actions.appendChild(b1);
        actions.appendChild(b2);
        box.appendChild(actions);
      }
      if (opts.url) {
        const a = document.createElement("a");
        a.href = opts.url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "打开原链接 ↗";
        box.appendChild(a);
      }
      // 没有电话就去查详情（列表接口常常不带电话）
      if (opts.poiId && !opts.rows.some(([k, v]) => k === "电话" && v)) {
        void api<any>("/geo/poi-detail?id=" + encodeURIComponent(opts.poiId), "GET", undefined, { timeoutMs: 20000 })
          .then((r) => {
            if (!r?.poi) return;
            paint([
              ...opts.rows.filter(([k]) => k !== "电话"),
              ["电话", r.poi.tel || ""],
            ]);
            if (r.poi.tel) opts.rows = [...opts.rows.filter(([k]) => k !== "电话"), ["电话", r.poi.tel]];
          })
          .catch(() => {});
      }
      return box;
    }

    function showInfo(item: any, kind: string) {
      const rows: [string, string][] = [
        ["类型", KIND[kind]?.label || kind],
        ["地址", item.address || ""],
        ["电话", item.tel || item.phone || ""],
        ["距离", item.distance ? Math.round(item.distance) + " 米" : ""],
        ["租金", item.rent ? item.rent + " 元/月" : ""],
        ["公司", item.company || ""],
      ];
      infoWindow.setContent(cardDom({
        title: item.title || item.name || "未命名",
        rows: rows.filter(([, v]) => v) as [string, string][],
        pos: { lng: item.pos.lng, lat: item.pos.lat },
        url: item.url || "",
        poiId: item.id || "",
      }));
      infoWindow.open(map, [item.pos.lng, item.pos.lat]);
    }

    function renderMarkers() {
      if (!map) return;
      clearGroup("job"); clearGroup("housing"); clearGroup("subway"); clearGroup("hotel"); clearGroup("found");
      if (showJobs.value)
        for (const j of layers.value.jobs || []) markerOf("job", j, () => showInfo(j, "job"));
      if (showHousing.value)
        for (const hr of layers.value.housing || []) markerOf("housing", hr, () => showInfo(hr, "housing"));
      if (showSubway.value)
        for (const st of subway.value) markerOf("subway", st, () => showInfo(st, "subway"));
      if (showHotels.value)
        for (const ht of hotels.value) markerOf("hotel", ht, () => showInfo(ht, "hotel"));
      for (const x of extra.value) markerOf("found", x, () => showInfo(x, "found"));
    }

    async function toggleSubwayLines(on: boolean) {
      showSubwayLines.value = on;
      while (subwayLineObjs.length) { const l = subwayLineObjs.pop(); l.setMap(null); }
      if (!on) return;
      try {
        if (!subwayLines.value.length) {
          const city = jobSel.value?.city || (layers.value.jobs || []).find((j: any) => j.pos)?.city || "上海";
          const r = await api<any>("/geo/subway-lines?city=" + encodeURIComponent(city), "GET", undefined, { timeoutMs: 30000 });
          subwayLines.value = r.lines || [];
        }
        for (const line of subwayLines.value) {
          const pl = new AMap.Polyline({
            path: line.path, strokeColor: line.color, strokeWeight: 4, strokeOpacity: 0.9, lineJoin: "round",
          });
          pl.setMap(map);
          subwayLineObjs.push(pl);
        }
        notice.value = "已显示 " + subwayLines.value.length + " 条地铁线路";
      } catch (e) { error.value = errorText(e); showSubwayLines.value = false; }
    }

    function updateCircle() {
      if (!map || !AMap) return;
      if (radiusCircle) { radiusCircle.setMap(null); radiusCircle = null; }
      const a = jobSel.value || houseSel.value;
      if (!a?.pos) return;
      radiusCircle = new AMap.Circle({
        center: [a.pos.lng, a.pos.lat], radius: radius.value,
        strokeColor: "#7460c9", strokeWeight: 1, strokeOpacity: 0.6,
        fillColor: "#7460c9", fillOpacity: 0.08,
      });
      radiusCircle.setMap(map);
    }

    async function loadHotels() {
      const a = jobSel.value || houseSel.value;
      const c = map?.getCenter?.();
      const center = a?.pos || (c ? { lng: c.lng, lat: c.lat } : null);
      if (!center) return;
      try {
        const r = await api<any>("/geo/nearby?lng=" + center.lng + "&lat=" + center.lat + "&radius=" + radius.value, "GET", undefined, { timeoutMs: 30000 });
        hotels.value = (r.pois || []).map((x: any) => ({ ...x, pos: { lng: x.lng, lat: x.lat } }));
        renderMarkers();
      } catch (e) { error.value = errorText(e); }
    }
    async function loadSubway() {
      const city = jobSel.value?.city || (layers.value.jobs || []).find((j: any) => j.pos)?.city || "上海";
      try {
        const r = await api<any>("/geo/nearby?kind=subway&city=" + encodeURIComponent(city), "GET", undefined, { timeoutMs: 30000 });
        subway.value = (r.pois || []).map((x: any) => ({ ...x, pos: { lng: x.lng, lat: x.lat } }));
        if (showSubway.value) renderMarkers();
      } catch { subway.value = []; }
    }

    async function search() {
      const q = searchFrom.value.trim();
      if (!q) { error.value = "请输入要搜索的地点"; return; }
      try {
        const r = await api<any>("/geo/geocode?address=" + encodeURIComponent(q), "GET", undefined, { timeoutMs: 30000 });
        if (!r?.result) throw Error("没找到这个地址");
        const pos = { lng: r.result.lng, lat: r.result.lat };
        map.setZoomAndCenter(15, [pos.lng, pos.lat]);
        infoWindow.setContent(cardDom({
          title: r.result.address || q,
          rows: [["地址", r.result.address || q]],
          pos,
        }));
        infoWindow.open(map, [pos.lng, pos.lat]);
        notice.value = "已定位到：" + (r.result.address || q) + "（点卡片可直接设为岗位/住房地址）";
      } catch (e) { error.value = errorText(e); }
    }

    async function routeFromInputs() {
      if (!searchFrom.value.trim() || !searchTo.value.trim()) { error.value = "请输入起点和终点地址"; return; }
      busying.value = true; error.value = "";
      try {
        const [a, b] = await Promise.all([
          api<any>("/geo/geocode?address=" + encodeURIComponent(searchFrom.value), "GET", undefined, { timeoutMs: 30000 }),
          api<any>("/geo/geocode?address=" + encodeURIComponent(searchTo.value), "GET", undefined, { timeoutMs: 30000 }),
        ]);
        if (!a?.result || !b?.result) throw Error("有一个地址没找到，换个说法试试");
        houseSel.value = { pos: { lng: a.result.lng, lat: a.result.lat }, title: a.result.address, city: "" };
        jobSel.value = { pos: { lng: b.result.lng, lat: b.result.lat }, title: b.result.address, city: "" };
        await plan();
      } catch (e) { error.value = errorText(e); }
      finally { busying.value = false; }
    }

    async function plan() {
      const from = houseSel.value, to = jobSel.value;
      if (!from?.pos || !to?.pos) { error.value = "请先在地图上点一个岗位和一个住房，或用上面的路线搜索"; return; }
      busying.value = true; error.value = "";
      try {
        const r = await api<any>("/geo/route", "POST", {
          mode: mode.value, from: from.pos, to: to.pos, city: to.city || from.city || "",
        }, { timeoutMs: 30000 });
        routeInfo.value = r.route;
        if (routeLine) { routeLine.setMap(null); routeLine = null; }
        if (r.route.polyline?.length) {
          routeLine = new AMap.Polyline({ path: r.route.polyline, strokeColor: "#2f9e8f", strokeWeight: 6, strokeOpacity: 0.9, showDir: true });
          routeLine.setMap(map);
          map.setFitView([routeLine], false, [60, 60, 60, 60]);
        }
        notice.value = (r.route.summary || "") + " · 距离 " +
          (r.route.distance >= 1000 ? (r.route.distance / 1000).toFixed(1) + " km" : r.route.distance + " m") +
          " · 约 " + Math.max(1, Math.round(r.route.duration / 60)) + " 分钟";
      } catch (e) { error.value = errorText(e); }
      finally { busying.value = false; }
    }

    function swapSlots() {
      const j = jobSel.value, hs = houseSel.value;
      jobSel.value = hs; houseSel.value = j; routeInfo.value = null;
      notice.value = "已互换：现在方向是「" + (houseSel.value?.title || "住房") + " → " + (jobSel.value?.title || "岗位") + "」";
    }

    function toggleMeasure() {
      if (!ruler) return;
      measuring.value = !measuring.value;
      if (measuring.value) { ruler.turnOn(); notice.value = "测距：点第一下开始，右键结束（高德原生测距工具）"; }
      else { ruler.turnOff(); notice.value = "测距已结束"; }
    }

    async function searchPoi(key: string) {
      const spec = POI_TYPES[key];
      if (!spec || poiBusy.value) return;
      poiBusy.value = true; poiKind.value = key;
      try {
        const c = map.getCenter();
        const r = await api<any>("/geo/nearby?lng=" + c.lng + "&lat=" + c.lat + "&radius=" + Math.max(radius.value, 2000) + "&types=" + spec.types, "GET", undefined, { timeoutMs: 30000 });
        extra.value = (r.pois || []).map((x: any) => ({ ...x, pos: { lng: x.lng, lat: x.lat } }));
        renderMarkers();
        notice.value = "在附近找到 " + extra.value.length + " 个" + spec.label;
      } catch (e) { error.value = errorText(e); }
      finally { poiBusy.value = false; }
    }

    async function askAi() {
      const anchor = jobSel.value || houseSel.value;
      if (!anchor?.pos) { error.value = "先选一个岗位或住房，AI 才知道从哪儿开始找"; return; }
      aiBusy.value = true; ai.value = null;
      try {
        ai.value = await api<any>("/geo/ai-assist", "POST", {
          lng: anchor.pos.lng, lat: anchor.pos.lat, radius: radius.value,
          label: anchor.title || anchor.name || "所选位置",
          need: aiInput.value.slice(0, 300),
          anchorType: jobSel.value ? "job" : "housing",
        }, { timeoutMs: 180000 });
      } catch (e) { error.value = errorText(e); }
      finally { aiBusy.value = false; }
    }

    function plotAi() {
      const c = ai.value?.candidates;
      if (!c) return;
      const add: any[] = [];
      const push = (x: any, kindLabel: string) => {
        const pos = x.pos || (x.lng && x.lat ? { lng: x.lng, lat: x.lat } : null);
        if (pos) add.push({ ...x, pos, title: x.title || x.name, address: x.address || kindLabel });
      };
      for (const x of c.hotels || []) push(x, "酒店");
      for (const x of c.housing || []) push(x, "租房");
      for (const x of c.jobs || []) push(x, "岗位");
      extra.value = add;
      renderMarkers();
      if (add[0]) map.setZoomAndCenter(14, [add[0].pos.lng, add[0].pos.lat]);
      notice.value = "已把 " + add.length + " 个推荐点标注到地图";
    }

    // —— 无 WebGL 时的兼容渲染（栅格瓦片 + DOM 标记） ——
    const fbOffset = () => ({
      ox: fbSize.value.w / 2 - lngX(fb.value.lng, fb.value.zoom),
      oy: fbSize.value.h / 2 - latY(fb.value.lat, fb.value.zoom),
    });
    const fbTiles = computed(() => {
      if (!useFallback.value) return [];
      const { ox, oy } = fbOffset();
      const cols = Math.ceil(fbSize.value.w / TILE) + 2;
      const rows = Math.ceil(fbSize.value.h / TILE) + 2;
      const sx = Math.floor(-ox / TILE);
      const sy = Math.floor(-oy / TILE);
      const max = Math.pow(2, fb.value.zoom);
      const out: any[] = [];
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const tx = sx + i, ty = sy + j;
          if (ty < 0 || ty >= max) continue;
          const x = ((tx % max) + max) % max;
          out.push({
            key: fb.value.zoom + "/" + x + "/" + ty,
            url: "https://webrd0" + (((x + ty) % 4) + 1) + ".is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=" + x + "&y=" + ty + "&z=" + fb.value.zoom,
            left: tx * TILE + ox,
            top: ty * TILE + oy,
          });
        }
      }
      return out;
    });
    const fbPins = computed(() => {
      if (!useFallback.value) return [];
      const { ox, oy } = fbOffset();
      const out: any[] = [];
      const add = (kind: string, item: any) => {
        const pos = item?.pos;
        if (!pos || !Number.isFinite(pos.lng)) return;
        const x = lngX(pos.lng, fb.value.zoom) + ox;
        const y = latY(pos.lat, fb.value.zoom) + oy;
        if (x < -40 || y < -40 || x > fbSize.value.w + 40 || y > fbSize.value.h + 40) return;
        out.push({ kind, item, x, y });
      };
      if (showJobs.value) for (const j of layers.value.jobs || []) add("job", j);
      if (showHousing.value) for (const h2 of layers.value.housing || []) add("housing", h2);
      if (showSubway.value) for (const st of subway.value) add("subway", st);
      if (showHotels.value) for (const ht of hotels.value) add("hotel", ht);
      for (const x of extra.value) add("found", x);
      return out;
    });
    let fbDrag: any = null;
    function fbDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest(".fb-pin, .fb-pop")) return;
      fbDrag = { x: e.clientX, y: e.clientY, cx: lngX(fb.value.lng, fb.value.zoom), cy: latY(fb.value.lat, fb.value.zoom) };
    }
    function fbMove(e: PointerEvent) {
      if (!fbDrag) return;
      const cx = fbDrag.cx - (e.clientX - fbDrag.x);
      const cy = fbDrag.cy - (e.clientY - fbDrag.y);
      const z = fb.value.zoom, max = Math.pow(2, z);
      fb.value = {
        zoom: z,
        lng: (cx / (max * TILE)) * 360 - 180,
        lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(Math.PI - (2 * Math.PI * cy) / (max * TILE)) - Math.exp(-Math.PI + (2 * Math.PI * cy) / (max * TILE)))),
      };
    }
    function fbUp() { fbDrag = null; }
    function fbZoom(d: number) { fb.value = { ...fb.value, zoom: Math.max(5, Math.min(18, fb.value.zoom + d)) }; }

    onMounted(async () => {
      try {
        if (!hasWebGL()) {
          useFallback.value = true;
          const el = document.querySelector(".map-full");
          if (el) {
            const r = el.getBoundingClientRect();
            fbSize.value = { w: r.width || 1200, h: r.height || 800 };
          }
          const rr = await api<any>("/geo/layers");
          layers.value = rr;
          const first = (rr.jobs || []).find((j: any) => j.pos);
          if (first) fb.value = { ...fb.value, lng: first.pos.lng, lat: first.pos.lat, zoom: 13 };
          await loadSubway();
          ready.value = true;
          notice.value = "当前浏览器未启用 WebGL，已切换到兼容地图（可拖动/缩放，高德原生控件不可用）";
          window.addEventListener("resize", () => {
            const e2 = document.querySelector(".map-full");
            if (e2) { const q = e2.getBoundingClientRect(); fbSize.value = { w: q.width, h: q.height }; }
          });
          return;
        }
        const cfg = await api<any>("/geo/config");
        if (!cfg?.js?.ready) throw new Error("服务端未配置高德 JS API key");
        AMap = await loadAMap(cfg.js);
        map = new AMap.Map(mapEl.value, {
          zoom: 12,
          center: [121.4737, 31.2304],
          viewMode: "2D",
          features: ["bg", "road", "building", "point"],
        });
        // 高德自带组件：保持它自己的默认位置
        map.addControl(new AMap.ToolBar({ position: { right: "18px", bottom: "170px" } }));
        map.addControl(new AMap.Scale({ position: { left: "18px", bottom: "18px" } }));
        map.addControl(new AMap.MapType({ position: { right: "18px", top: "120px" } }));
        map.addControl(new AMap.HawkEye({ position: { right: "18px", bottom: "280px" } }));
        map.addControl(new AMap.Geolocation({ position: { right: "18px", top: "62px" }, enableHighAccuracy: true }));
        (window as any).__map = map;
        infoWindow = new AMap.InfoWindow({ isCustom: true, offset: new AMap.Pixel(0, -12) });
        ruler = new AMap.RangingTool(map);
        ruler.on("end", () => { measuring.value = false; });

        // 点底图：e.poi 精确命中就用它；没有就显示该点地址 + 附近几个地点供选择
        auto = new AMap.AutoComplete({ city: "全国", citylimit: false });
        const placeSearch = new AMap.PlaceSearch({ pageSize: 5, extensions: "all" });
        const geocoder = new AMap.Geocoder({ radius: 100, extensions: "base" });
        map.on("click", async (e: any) => {
          try {
          const ll = e?.lnglat || map.getCenter();
          const pos = { lng: ll.lng, lat: ll.lat };
          let p = e.poi;
          if (!p) {
            const nearby = (radius2: number) => new Promise<any[]>((resolve) => {
              placeSearch.searchNearBy("", [pos.lng, pos.lat], radius2, (st: string, rr: any) => {
                resolve(rr?.poiList?.pois || []);
              });
            });
            let list = await nearby(30);
            if (!list.length) list = await nearby(120);
            // 30 米内命中：说明就是点在标注上，直接用这个地点，不再"猜"
            const direct = list[0] && Number(list[0].distance) <= 30 ? list[0] : null;
            if (direct) {
              const dpos = { lng: direct.location.lng, lat: direct.location.lat };
              infoWindow.setContent(cardDom({
                title: direct.name,
                rows: [
                  ["类型", String(direct.type || "").split(";").pop() || ""],
                  ["地址", Array.isArray(direct.address) ? "" : direct.address || ""],
                  ["电话", Array.isArray(direct.tel) ? "" : direct.tel || ""],
                ],
                pos: dpos,
                poiId: direct.id || "",
              }));
              infoWindow.open(map, [dpos.lng, dpos.lat]);
              return;
            }
            const addr = await new Promise<string>((resolve) => {
              geocoder.getAddress([pos.lng, pos.lat], (st: string, rr: any) => {
                resolve(rr?.regeocode?.formattedAddress || "");
              });
            });
            const box = document.createElement("div");
            box.className = "amap-card";
            const head = document.createElement("div");
            head.className = "amap-card-head";
            const t = document.createElement("strong");
            t.textContent = addr || "你点击的位置";
            const close = document.createElement("button");
            close.className = "amap-card-close";
            close.textContent = "×";
            close.onclick = () => infoWindow.close();
            head.appendChild(t);
            head.appendChild(close);
            box.appendChild(head);
            const tip = document.createElement("p");
            tip.className = "amap-card-tip";
            tip.textContent = list.length ? "附近地点（点一下即可选中）：" : "附近没有登记地点";
            box.appendChild(tip);
            for (const poi of list.slice(0, 3)) {
              const row = document.createElement("button");
              row.className = "amap-card-row";
              row.textContent = poi.name + (poi.distance ? " · " + Math.round(poi.distance) + "米" : "");
              row.onclick = () => {
                const ppos = { lng: poi.location.lng, lat: poi.location.lat };
                infoWindow.setContent(cardDom({
                  title: poi.name,
                  rows: [["类型", String(poi.type || "").split(";").pop() || ""], ["地址", Array.isArray(poi.address) ? "" : poi.address || ""], ["电话", Array.isArray(poi.tel) ? "" : poi.tel || ""]],
                  pos: ppos,
                  poiId: poi.id || "",
                }));
                infoWindow.open(map, [ppos.lng, ppos.lat]);
              };
              box.appendChild(row);
            }
            const actions = document.createElement("div");
            actions.className = "amap-info-actions";
            const b1 = document.createElement("button");
            b1.textContent = "把这里设为岗位地址";
            b1.onclick = () => { jobSel.value = { title: addr || "地图选点", address: addr, pos }; notice.value = "已设为岗位地址"; infoWindow.close(); };
            const b2 = document.createElement("button");
            b2.textContent = "把这里设为住房地址";
            b2.onclick = () => { houseSel.value = { title: addr || "地图选点", address: addr, pos }; notice.value = "已设为住房地址"; infoWindow.close(); };
            actions.appendChild(b1);
            actions.appendChild(b2);
            box.appendChild(actions);
            infoWindow.setContent(box);
            infoWindow.open(map, [pos.lng, pos.lat]);
            return;
          }
          const ppos = { lng: e.lnglat.lng, lat: e.lnglat.lat };
          infoWindow.setContent(cardDom({
            title: p.name || "未命名地点",
            rows: [
              ["类型", String(p.type || "").split(";").pop() || ""],
              ["地址", Array.isArray(p.address) ? "" : p.address || ""],
              ["电话", Array.isArray(p.tel) ? "" : p.tel || ""],
            ],
            pos: ppos,
            poiId: p.id || "",
          }));
          infoWindow.open(map, [ppos.lng, ppos.lat]);
          } catch (err) { console.warn("poi click failed", err); }
        });

        const r = await api<any>("/geo/layers");
        layers.value = r;
        const first = (r.jobs || []).find((j: any) => j.pos);
        if (first) map.setZoomAndCenter(13, [first.pos.lng, first.pos.lat]);
        await loadSubway();
        renderMarkers();
        ready.value = true;
      } catch (e) { error.value = errorText(e); }
    });
    onBeforeUnmount(() => {
      try { ruler?.turnOff(); } catch {}
      try { map?.destroy(); } catch {}
      map = null;
    });

    const counts = computed(() => ({
      jobs: (layers.value.jobs || []).filter((j: any) => j.pos).length,
      housing: (layers.value.housing || []).filter((x: any) => x.pos).length,
      subway: subway.value.length,
      hotels: hotels.value.length,
    }));

    const slot = (label: string, item: any, hint: string) =>
      h("div", { class: "map-slot" }, [
        h("span", { class: "map-slot-label" }, label),
        h("strong", item ? (item.title || item.name || "未命名") : "未选择"),
        h("small", item?.address || hint),
      ]);

    return () =>
      h("div", { class: "map-full" }, [
        useFallback.value
          ? h("div", {
              class: "map-fallback",
              onPointerdown: fbDown,
              onPointermove: fbMove,
              onPointerup: fbUp,
              onPointerleave: fbUp,
              onWheel: (e: WheelEvent) => { e.preventDefault(); fbZoom(e.deltaY < 0 ? 1 : -1); },
            }, [
              ...fbTiles.value.map((t) =>
                h("img", { key: t.key, class: "fb-tile", src: t.url, alt: "", draggable: false, style: { left: t.left + "px", top: t.top + "px" } })),
              ...fbPins.value.map((pin) =>
                h("button", {
                  key: pin.kind + "-" + (pin.item.id || pin.item.name),
                  class: "fb-pin",
                  style: { left: pin.x + "px", top: pin.y + "px", background: KIND[pin.kind]?.color || "#7460c9" },
                  title: pin.item.title || pin.item.name || "",
                  onClick: (e: Event) => {
                    e.stopPropagation();
                    fbPopup.value = { item: pin.item, kind: pin.kind, x: pin.x, y: pin.y };
                    jobSel.value = pin.kind === "housing" ? jobSel.value : pin.item;
                    if (pin.kind === "housing") houseSel.value = pin.item;
                  },
                }),
              ),
              fbPopup.value
                ? h("div", {
                    class: "fb-pop",
                    style: {
                      left: Math.min(Math.max(8, fbPopup.value.x + 14), fbSize.value.w - 250) + "px",
                      top: Math.min(Math.max(8, fbPopup.value.y - 10), fbSize.value.h - 190) + "px",
                    },
                  }, [
                    h("header", { style: { display: "flex", justifyContent: "space-between" } }, [
                      h("strong", fbPopup.value.item.title || fbPopup.value.item.name || "未命名"),
                      h("button", { onClick: () => (fbPopup.value = null), style: { border: 0, background: "none", cursor: "pointer" } }, "×"),
                    ]),
                    ...[
                      ["类型", KIND[fbPopup.value.kind]?.label || ""],
                      ["地址", fbPopup.value.item.address || ""],
                      ["电话", fbPopup.value.item.tel || fbPopup.value.item.phone || ""],
                      ["租金", fbPopup.value.item.rent ? fbPopup.value.item.rent + " 元/月" : ""],
                      ["公司", fbPopup.value.item.company || ""],
                    ].filter(([, v]) => v).map(([k, v]) => h("p", k + "：" + v)),
                    h("div", { class: "map-popup-actions" }, [
                      h("button", { onClick: () => { jobSel.value = fbPopup.value.item; notice.value = "已设为岗位地址"; fbPopup.value = null; } }, "设为岗位地址"),
                      h("button", { onClick: () => { houseSel.value = fbPopup.value.item; notice.value = "已设为住房地址"; fbPopup.value = null; } }, "设为住房地址"),
                    ]),
                    fbPopup.value.item.url
                      ? h("a", { href: fbPopup.value.item.url, target: "_blank", rel: "noopener noreferrer" }, "打开原链接 ↗")
                      : null,
                  ])
                : null,
              h("div", { class: "map-zoom" }, [
                h("button", { onClick: () => fbZoom(1), "aria-label": "放大" }, "＋"),
                h("button", { onClick: () => fbZoom(-1), "aria-label": "缩小" }, "－"),
              ]),
            ])
          : h("div", { ref: mapEl, class: "map-canvas amap-host" }),

        h("div", { class: "map-topbar" }, [
          h("a", { class: "map-brand", href: "#home" }, "✦ 城市与通勤地图"),
          h("div", { class: "map-search" }, [
            h("input", {
              "aria-label": "搜索地点",
              placeholder: "搜索公司、小区、地铁站或任意地址",
              value: searchFrom.value,
              onInput: (e: Event) => { searchFrom.value = (e.target as HTMLInputElement).value; autocomplete("search", searchFrom.value, e); },
              onFocus: (e: Event) => { if (searchFrom.value) autocomplete("search", searchFrom.value, e); },
              onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") { tips.value = []; void search(); } },
            }),
            h("button", { onClick: () => { tips.value = []; void search(); } }, "搜索"),
            h("button", {
              class: routeOpen.value ? "on" : "",
              onClick: () => (routeOpen.value = !routeOpen.value),
              title: "展开/收起通勤规划",
            }, routeOpen.value ? "收起路线" : "路线"),
          ]),
          h("div", { class: "map-quick" }, [
            h("button", { class: measuring.value ? "on" : "", onClick: toggleMeasure }, "测距"),
          ]),
        ]),

        routeOpen.value
          ? h("div", { class: "map-route-panel" }, [
              h("div", { class: "map-route-field" }, [
                h("span", "起点"),
                h("input", {
                  "aria-label": "路线起点",
                  placeholder: "输入起点地址",
                  value: searchFrom.value,
                  onInput: (e: Event) => { searchFrom.value = (e.target as HTMLInputElement).value; autocomplete("from", searchFrom.value, e); },
                  onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") { tips.value = []; void routeFromInputs(); } },
                }),
              ]),
              h("div", { class: "map-route-field" }, [
                h("span", "终点"),
                h("input", {
                  "aria-label": "路线终点",
                  placeholder: "输入终点地址",
                  value: searchTo.value,
                  onInput: (e: Event) => { searchTo.value = (e.target as HTMLInputElement).value; autocomplete("to", searchTo.value, e); },
                  onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") { tips.value = []; void routeFromInputs(); } },
                }),
              ]),
              h("div", { class: "map-route-modes" }, [["transit", "公交/地铁"], ["drive", "驾车"], ["walk", "步行"], ["bicycle", "骑行"]]
                .map(([v, t]) => h("button", {
                  class: mode.value === v ? "on" : "",
                  onClick: () => (mode.value = v as any),
                }, t))),
              h("button", { class: "map-wide", disabled: busying.value, onClick: () => { tips.value = []; void routeFromInputs(); } },
                busying.value ? "规划中…" : "查询通勤"),
            ])
          : null,
        h("button", {
          class: "map-tb-toggle" + (toolboxOpen.value ? " open" : ""),
          style: { left: tbBtn.value.x + "px", top: tbBtn.value.y + "px" },
          onPointerdown: btnDown,
          onPointermove: btnMove,
          onPointerup: btnUp,
          title: "单击展开/收起，按住可拖动",
        }, toolboxOpen.value ? "◀ 收起工具箱" : "▶ 展开工具箱"),
        toolboxOpen.value
          ? h("aside", {
              class: "map-toolbox",
              style: { left: tbPos.value.x + "px", top: tbPos.value.y + "px", right: "auto", bottom: "auto" },
            }, [
              h("div", { class: "map-toolbox-handle" }, [
                h("span", "工具箱（可拖动）"),
                h("button", { onClick: () => (toolboxOpen.value = false), "aria-label": "收起工具箱" }, "×"),
              ]),
              h("section", { class: "map-card" }, [
                h("h3", "图层"),
                h("div", { class: "map-layers" },
                  ([
                    ["岗位 " + counts.value.jobs, showJobs],
                    ["租房 " + counts.value.housing, showHousing],
                    ["地铁站 " + counts.value.subway, showSubway],
                    ["酒店 " + counts.value.hotels, showHotels],
                    ["地铁线路", showSubwayLines],
                  ] as any[]).map(([label, flag]: any) =>
                    h("label", { class: "map-check" }, [
                      h("input", {
                        type: "checkbox",
                        checked: flag.value,
                        onChange: (e: Event) => {
                          const on = (e.target as HTMLInputElement).checked;
                          if (flag === showSubwayLines) { void toggleSubwayLines(on); return; }
                          flag.value = on;
                          if (flag === showSubway && !subway.value.length) void loadSubway();
                          if (flag === showHotels && !hotels.value.length) void loadHotels();
                          renderMarkers();
                        },
                      }),
                      label,
                    ]),
                  ),
                ),
              ]),
              h("section", { class: "map-card" }, [
                h("h3", "周边搜索（以地图中心）"),
                h("div", { class: "map-poi" }, Object.keys(POI_TYPES).map((k) =>
                  h("button", {
                    class: poiKind.value === k ? "on" : "",
                    disabled: poiBusy.value,
                    onClick: () => void searchPoi(k),
                  }, POI_TYPES[k].label))),
              ]),
              h("section", { class: "map-card" }, [
                h("h3", "搜索半径"),
                h("div", { class: "map-radius" }, [
                  h("input", {
                    type: "range", min: "500", max: "10000", step: "500", value: String(radius.value),
                    onInput: (e: Event) => (radius.value = Number((e.target as HTMLInputElement).value)),
                    onChange: () => { updateCircle(); void loadHotels(); },
                  }),
                  h("span", (radius.value / 1000).toFixed(1) + " km"),
                ]),
              ]),
              h("section", { class: "map-card" }, [
                h("h3", "通勤方向"),
                slot("住房地址", houseSel.value, "点地图上的绿色租房点"),
                h("button", { class: "map-swap", onClick: swapSlots }, "⇅ 互换方向"),
                slot("岗位地址", jobSel.value, "点地图上的紫色岗位点"),
                h("div", { class: "map-route-row" }, [
                  h("select", {
                    "aria-label": "通勤方式", value: mode.value,
                    onChange: (e: Event) => (mode.value = (e.target as HTMLSelectElement).value as any),
                  }, [["transit", "公共交通"], ["drive", "驾车"], ["walk", "步行"], ["bicycle", "骑行"]]
                    .map(([v, t]) => h("option", { value: v }, t))),
                  h("button", { disabled: busying.value, onClick: plan }, busying.value ? "规划中…" : "规划路线"),
                ]),
                routeInfo.value
                  ? h("p", { class: "map-route-summary" },
                      "距离 " + (routeInfo.value.distance >= 1000 ? (routeInfo.value.distance / 1000).toFixed(1) + " km" : routeInfo.value.distance + " m") +
                      " · 约 " + Math.max(1, Math.round(routeInfo.value.duration / 60)) + " 分钟" +
                      (routeInfo.value.summary ? " · " + routeInfo.value.summary : ""))
                  : null,
              ]),
              h("section", { class: "map-card" }, [
                h("h3", "✦ 让看板娘帮你选"),
                h("textarea", {
                  "aria-label": "需求描述",
                  placeholder: "例如：预算 4000 以内、通勤 30 分钟内、要靠近地铁",
                  rows: 2,
                  value: aiInput.value,
                  onInput: (e: Event) => (aiInput.value = (e.target as HTMLTextAreaElement).value),
                }),
                h("button", { class: "primary", disabled: aiBusy.value, onClick: askAi }, aiBusy.value ? "AI 正在找…" : "帮我在附近做选择"),
                ai.value
                  ? h("div", { class: "map-ai" }, [
                      h("p", { class: "map-ai-advice" }, ai.value.advice || "AI 没有给出建议"),
                      ...(ai.value.picks || []).map((x: any) =>
                        h("div", { class: "map-ai-pick" }, [h("strong", x.name), h("span", x.reason)])),
                      h("button", { onClick: plotAi }, "把推荐标注到地图"),
                    ])
                  : null,
              ]),
            ])
          : null,

        tips.value.length
          ? h("ul", {
              class: "map-tips",
              style: { left: tipPos.value.x + "px", top: tipPos.value.y + "px", width: tipPos.value.w + "px" },
            }, tips.value.map((t) =>
              h("li", { onClick: () => void pickTip(t) }, [
                h("strong", t.name || ""),
                h("small", [t.district || "", t.address || ""].filter(Boolean).join(" · ")),
              ]),
            ))
          : null,
        error.value ? h("p", { class: "map-toast error", role: "alert" }, [error.value, h("button", { onClick: () => (error.value = "") }, "×")]) : null,
        notice.value ? h("p", { class: "map-toast notice", role: "status" }, [notice.value, h("button", { onClick: () => (notice.value = "") }, "×")]) : null,
      ]);
  },
});
