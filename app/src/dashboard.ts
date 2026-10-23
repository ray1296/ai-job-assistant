import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { api, errorText } from "./api";

let echartsMod: any = null;
async function ensureEcharts() {
  if (echartsMod) return echartsMod;
  const core = await import("echarts/core");
  const charts = await import("echarts/charts");
  const comps = await import("echarts/components");
  const renderers = await import("echarts/renderers");
  core.use([
    charts.MapChart, charts.BarChart, charts.LineChart, charts.ScatterChart, charts.LinesChart,
    comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, comps.TitleComponent,
    renderers.CanvasRenderer,
  ]);
  echartsMod = core;
  return core;
}
let chinaMap: any = null;
async function ensureChina() {
  if (chinaMap) return chinaMap;
  const r = await fetch("/assets/china.json");
  if (!r.ok) throw new Error("中国地图数据加载失败");
  chinaMap = await r.json();
  return chinaMap;
}

const CYAN = "#16ffff";
const MINT = "#57e0c0";
const ROW_H = 24;

export default defineComponent({
  setup() {
    const data = ref<any>(null);
    const loading = ref(true);
    const error = ref("");
    const now = ref(new Date());
    let timer: any = null;
    let tagsTimer: any = null;
    let disposed = false;
    const charts: any[] = [];
    const scrollers = new Set<HTMLElement>();

    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await api<any>("/dashboard/summary?city=%E5%85%A8%E5%9B%BD");
        data.value = r;
        await nextTick();
        draw();
        drawWordCloud();
        nextTick(() => setupScrollers());
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }

    const axisCommon = {
      axisLabel: { color: "#8fa7c4", fontSize: 10 },
      axisLine: { lineStyle: { color: "rgba(120,170,220,.25)" } },
      splitLine: { lineStyle: { color: "rgba(120,170,220,.10)" } },
    };
    function mount(el: HTMLElement | null, option: any) {
      if (!el || !echartsMod) return;
      const c = echartsMod.init(el, undefined, { renderer: "canvas" });
      c.setOption(option);
      charts.push(c);
    }
    function dispose() { while (charts.length) charts.pop().dispose(); }

    // 地图 + 立体圆柱（沿用 bigdata 的 lines/scatter 假 3D）
    function mapOption(d: any) {
      const list = (d.provinces || []).map((p: any) => ({ name: p.name, value: p.jobs, salary: p.avgSalary, coord: p.coord }));
      const max = Math.max(1, ...list.map((x: any) => x.value));
      const rate = 12 / max;
      const lineData = list.map((x: any) => ({ coords: [x.coord, [x.coord[0], x.coord[1] + x.value * rate]] }));
      const topData = list.map((x: any) => [x.coord[0], x.coord[1] + x.value * rate]);
      const baseData = list.map((x: any) => ({ name: x.name, value: x.coord }));
      return {
        tooltip: {
          trigger: "item",
          formatter: (p: any) => {
            const row = list.find((x: any) => x.name === p.name);
            if (!row) return p.name || "";
            return row.name + "<br/>岗位 " + row.value + " 个" + (row.salary ? "<br/>平均 " + row.salary + "K/月" : "<br/>薪资未公开");
          },
          backgroundColor: "rgba(8,24,40,.92)",
          borderColor: "rgba(90,200,220,.4)",
          textStyle: { color: "#cfe3f5", fontSize: 11 },
        },
        geo: {
          map: "china", aspectScale: 0.85, layoutCenter: ["50%", "52%"], layoutSize: "128%",
          roam: true, scaleLimit: { min: 0.8, max: 4 },
          itemStyle: { areaColor: "#0f3350", borderColor: "#2f6f96", borderWidth: 1, shadowColor: "#276fce", shadowOffsetY: 12, shadowBlur: 12 },
          emphasis: { itemStyle: { areaColor: "#1c5b84" }, label: { show: false } },
        },
        series: [
          { type: "map", map: "china", geoIndex: 0, roam: true, data: list.map((x: any) => ({ name: x.name, value: x.value })) },
          { type: "lines", coordinateSystem: "geo", zlevel: 5, silent: true, effect: { show: false },
            lineStyle: { width: 9, color: CYAN, opacity: 0.75, curveness: 0 }, data: lineData },
          { type: "scatter", coordinateSystem: "geo", zlevel: 6, silent: true, symbol: "circle",
            symbolSize: [9, 4], itemStyle: { color: CYAN }, data: topData },
          { type: "scatter", coordinateSystem: "geo", zlevel: 4, silent: true, symbol: "circle",
            symbolSize: [9, 4], itemStyle: { color: CYAN }, data: baseData,
            label: { show: true, formatter: "{b}", position: "bottom", color: "#bfe6ff", fontSize: 10, distance: 4 } },
          { type: "scatter", coordinateSystem: "geo", zlevel: 3, silent: true, symbol: "circle",
            symbolSize: [22, 10],
            itemStyle: { color: { type: "radial", x: 0.5, y: 0.5, r: 0.5, global: false,
              colorStops: [
                { offset: 0, color: "rgba(22,255,255,0)" },
                { offset: 0.72, color: "rgba(22,255,255,0)" },
                { offset: 0.73, color: "rgba(22,255,255,.85)" },
                { offset: 1, color: "rgba(22,255,255,.15)" },
              ] } },
            data: baseData },
        ],
      };
    }

    function draw() {
      dispose();
      const d = data.value;
      if (!d) return;
      document.querySelectorAll<HTMLElement>("[data-dash]").forEach((el) => {
        const kind = el.dataset.dash;
        if (kind === "map") mount(el, mapOption(d));
        else if (kind === "rank") {
          const rows = [...(d.provinces || [])].sort((a: any, b: any) => b.jobs - a.jobs);
          mount(el, {
            grid: { left: 64, right: 18, top: 8, bottom: 16 },
            tooltip: { trigger: "axis" },
            xAxis: { type: "value", ...axisCommon },
            yAxis: { type: "category", inverse: true, data: rows.map((x: any) => x.name.replace(/省|市|自治区|壮族|回族|维吾尔/g, "")), ...axisCommon, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: "bar", data: rows.map((x: any) => x.jobs), barMaxWidth: 13,
              itemStyle: { borderRadius: [0, 4, 4, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "rgba(87,224,192,.3)" }, { offset: 1, color: MINT }] } } }],
          });
        } else if (kind === "eduSalary") {
          const rows = d.educationSalary || [];
          mount(el, {
            grid: { left: 44, right: 18, top: 18, bottom: 24 },
            tooltip: {
              trigger: "axis",
              formatter: (ps: any) => {
                const p = ps[0];
                const row = rows.find((x: any) => x.name === p.name);
                return p.name + "：" + (row?.value != null ? row.value + "K/月" : "无公开月薪") + "（" + (row?.jobs || 0) + " 个岗位）";
              },
            },
            xAxis: { type: "category", data: rows.map((x: any) => x.name), ...axisCommon },
            yAxis: { type: "value", ...axisCommon },
            series: [{ type: "line", smooth: true, connectNulls: false, symbolSize: 7,
              data: rows.map((x: any) => x.value),
              itemStyle: { color: "#6fb7ff" }, lineStyle: { width: 2, color: "#6fb7ff" },
              label: { show: true, color: "#9fd8ea", fontSize: 10, formatter: (p: any) => (p.value != null ? p.value + "K" : "") },
              areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(111,183,255,.3)" }, { offset: 1, color: "rgba(111,183,255,0)" }] } } }],
          });
        } else if (kind === "provinceSalary") {
          const rows = [...(d.provinces || [])].sort((a: any, b: any) => (b.avgSalary || 0) - (a.avgSalary || 0) || b.jobs - a.jobs);
          mount(el, {
            grid: { left: 64, right: 26, top: 8, bottom: 16 },
            tooltip: {
              trigger: "axis",
              formatter: (ps: any) => {
                const row = rows.find((x: any) => x.name.replace(/省|市|自治区|壮族|回族|维吾尔/g, "") === ps[0].name);
                return ps[0].name + "：" + (row?.avgSalary ? row.avgSalary + "K/月" : "薪资未公开") + "（" + (row?.jobs || 0) + " 个岗位）";
              },
            },
            xAxis: { type: "value", ...axisCommon, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => (v ? v + "K" : "") } },
            yAxis: { type: "category", inverse: true, data: rows.map((x: any) => x.name.replace(/省|市|自治区|壮族|回族|维吾尔/g, "")), ...axisCommon, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: "bar", data: rows.map((x: any) => x.avgSalary || 0), barMaxWidth: 12,
              itemStyle: { borderRadius: [0, 4, 4, 0], color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "rgba(111,183,255,.3)" }, { offset: 1, color: "#6fb7ff" }] } } }],
          });
        }
      });
    }

    // 动态 3D 球形词云：自绘 canvas，按词频分字号/颜色，整体缓慢旋转
    const CLOUD_COLORS = ["#7fd4ff", "#6fe6d2", "#ffd166", "#ff9db5", "#c084fc", "#9ae6b4"];
    let cloudRaf = 0;
    function stopCloud() { if (cloudRaf) cancelAnimationFrame(cloudRaf); cloudRaf = 0; }
    function drawWordCloud() {
      stopCloud();
      const canvas = document.getElementById("word-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const words = (data.value?.words || []).slice(0, 60);
      const box = canvas.parentElement?.getBoundingClientRect();
      const W = Math.max(240, Math.round(box?.width || 320));
      const H = Math.max(160, Math.round(box?.height || 210));
      const dpr = Math.min(2, (window as any).devicePixelRatio || 1);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d");
      if (!ctx || !words.length) return;
      const max = words[0].value || 1;
      const min = words[words.length - 1].value || 1;
      const R0 = Math.min(W, H) * 0.46;
      // 斐波那契球面均匀布点
      const pts = words.map((w: any, i: number) => {
        const t = max === min ? 1 : (w.value - min) / (max - min);
        const phi = Math.acos(1 - (2 * (i + 0.5)) / words.length);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        return {
          name: w.name,
          t,
          size: Math.round(9 + t * 12),
          color: CLOUD_COLORS[Math.min(CLOUD_COLORS.length - 1, Math.floor(t * CLOUD_COLORS.length))],
          x: Math.sin(phi) * Math.cos(theta),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta),
        };
      });
      let angle = 0;
      let tiltAngle = -0.35;
      let dragging = false;
      let lastX = 0, lastY = 0;
      canvas.style.cursor = "grab";
      canvas.onpointerdown = (e: PointerEvent) => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture?.(e.pointerId);
        canvas.style.cursor = "grabbing";
      };
      canvas.onpointermove = (e: PointerEvent) => {
        if (!dragging) return;
        angle += (e.clientX - lastX) * 0.008;
        tiltAngle = Math.max(-1.1, Math.min(1.1, tiltAngle + (e.clientY - lastY) * 0.006));
        lastX = e.clientX; lastY = e.clientY;
      };
      const endDrag = () => { dragging = false; canvas.style.cursor = "grab"; };
      canvas.onpointerup = endDrag;
      canvas.onpointerleave = endDrag;
      canvas.onwheel = (e: WheelEvent) => { e.preventDefault(); angle += e.deltaY > 0 ? 0.15 : -0.15; };
      const render = () => {
        if (disposed || !canvas.isConnected) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const tilt = tiltAngle, ct = Math.cos(tilt), st = Math.sin(tilt);
        const view = pts.map((p: any) => {
          const x1 = p.x * cos + p.z * sin;
          const z1 = -p.x * sin + p.z * cos;
          const y1 = p.y * ct - z1 * st;
          const z2 = p.y * st + z1 * ct;
          return { ...p, sx: W / 2 + x1 * R0, sy: H / 2 + y1 * R0, depth: z2 };
        }).sort((a: any, b: any) => a.depth - b.depth);
        for (const p of view) {
          const k = (p.depth + 1) / 2; // 0 后 → 1 前
          const alpha = 0.35 + k * 0.65;
          const size = p.size * (0.72 + k * 0.42);
          ctx.globalAlpha = alpha;
          ctx.font = (p.t > 0.6 ? "600 " : "400 ") + size.toFixed(1) + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.fillStyle = p.color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.name, p.sx, p.sy);
        }
        ctx.globalAlpha = 1;
        if (!dragging) angle += 0.006;
        cloudRaf = requestAnimationFrame(render);
      };
      render();
    }

    // 自动循环滚动，鼠标悬停暂停
    function setupScrollers() {
      const els = document.querySelectorAll<HTMLElement>("[data-scroll]");
      els.forEach((el) => {
        if (scrollers.has(el)) return;
        scrollers.add(el);
        el.addEventListener("mouseenter", () => (el.dataset.paused = "1"));
        el.addEventListener("mouseleave", () => (el.dataset.paused = ""));
        const tick = () => {
          if (disposed || !el.isConnected) return;
          if (!el.dataset.paused && el.scrollHeight > el.clientHeight + 2) {
            el.scrollTop += 0.35;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) el.scrollTop = 0;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }

    function resize() { for (const c of charts) c.resize(); }

    onMounted(async () => {
      await ensureEcharts();
      try {
        const geo = await ensureChina();
        const mod = await import("echarts/core");
        mod.registerMap("china", geo);
      } catch (e) { error.value = errorText(e); }
      void load();
      window.addEventListener("resize", resize);
      timer = setInterval(() => (now.value = new Date()), 30000);
    });
    onBeforeUnmount(() => {
      disposed = true;
      window.removeEventListener("resize", resize);
      if (timer) clearInterval(timer);
      if (tagsTimer) clearTimeout(tagsTimer);
      stopCloud();
      dispose();
      try { (window as any).TagCanvas?.Stop?.("word-canvas"); } catch {}
    });

    const kpi = computed(() => data.value?.kpi || { jobs: 0, companies: 0, cities: 0, campus: 0, intern: 0 });
    const panel = (title: string, child: any, extra = "") =>
      h("section", { class: "dash-panel " + extra }, [h("h4", title), child]);
    const scrollBox = (height: number, child: any) =>
      h("div", { class: "dash-scroll", style: { height: height + "px" }, "data-scroll": "" }, [child]);

    return () =>
      h("div", { class: "proto-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR CAREER, YOUR WAY"),
          h("h1", "就业数据大屏"),
          h("p", "从数据里，看见更多可能"),
        ]),
        h("div", { class: "dash-toolbar" }, [
          h("button", {
            class: "btn",
            onClick: () => {
              const el = document.querySelector(".dash-dark") as HTMLElement | null;
              if (!el) return;
              if (document.fullscreenElement) void document.exitFullscreen();
              else void el.requestFullscreen?.().catch(() => {});
            },
          }, "⤢ 全屏大屏"),
        ]),
        h("p", { class: "muted" },
          (loading.value ? "正在统计…" : "共 " + kpi.value.jobs + " 个岗位参与统计") +
          " · 数据范围：平台公开岗位 + 你上传的数据。地图可拖动/滚轮缩放；排行榜、薪资榜与数据浏览会自动滚动，鼠标移上去暂停。"),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,

        h("div", { class: "dash-dark" }, [
          h("header", { class: "dash-dark-head" }, [
            h("h2", "职业规划智慧大屏"),
            h("span", now.value.toLocaleString("zh-CN", { hour12: false })),
          ]),
          h("div", { class: "dash-dark-kpis" }, [
            ["在招岗位", kpi.value.jobs], ["覆盖企业", kpi.value.companies], ["覆盖城市", kpi.value.cities],
            ["校招岗位", kpi.value.campus], ["实习岗位", kpi.value.intern],
          ].map(([label, value]) =>
            h("div", { class: "dash-dark-kpi" }, [h("span", String(label)), h("strong", String(value))]))),
          h("div", { class: "dash-dark-grid" }, [
            h("div", { class: "dash-col" }, [
              panel("各省份招聘岗位数排行榜（可滚动）",
                h("div", { class: "dash-chart-fit" }, [
                  scrollBox(300,
                    h("div", { class: "dash-dark-chart", style: { height: BigRankH(data.value?.provinces?.length || 0) + "px" }, "data-dash": "rank" })),
                ]), "grow"),
              panel("各学历平均薪资（K/月）", h("div", { class: "dash-dark-chart", "data-dash": "eduSalary" })),
            ]),
            h("div", { class: "dash-col dash-col-mid" }, [
              panel("中国各省招聘分布（柱高=岗位数）", h("div", { class: "dash-dark-chart dash-map", "data-dash": "map" }), "grow"),
              panel("数据浏览",
                h("div", { class: "dash-chart-fit" }, [
                  scrollBox(212, h("div", { class: "dash-dark-list single", "data-scroll": "" },
                    (data.value?.jobs || []).length
                      ? (data.value?.jobs || []).map((j: any) =>
                          h("a", { class: "dash-dark-row single", href: j.url || "#jobs", target: j.url ? "_blank" : undefined, rel: "noopener noreferrer" }, [
                            h("span", { class: "t" }, j.title || "未命名岗位"),
                            h("span", { class: "c" }, j.company || ""),
                            h("span", { class: "city" }, j.city || ""),
                            h("span", { class: "s" }, j.salary || "未公示"),
                          ]))
                      : [h("p", { class: "dash-dark-empty" }, "暂无岗位")],
                  )),
                ])),
            ]),
            h("div", { class: "dash-col" }, [
              panel("各省份平均薪资（K/月，可滚动）",
                h("div", { class: "dash-chart-fit" }, [
                  scrollBox(300,
                    h("div", { class: "dash-dark-chart", style: { height: BigRankH(data.value?.provinces?.length || 0) + "px" }, "data-dash": "provinceSalary" })),
                ]), "grow"),
              panel("职位描述词云", h("div", { class: "dash-cloud" }, [
                h("canvas", { id: "word-canvas", width: "320", height: "210" }),
                h("div", { id: "word-tags", class: "dash-cloud-tags" }),
              ])),
            ]),
          ]),
        ]),
      ]);
  },
});

function BigRankH(n: number) {
  return Math.max(220, n * ROW_H + 40);
}
