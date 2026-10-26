import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

type Node = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
type Trail = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number; hue: number };
const HUES = [252, 268, 292, 190, 210];

/**
 * 参考 bigdata_analysis 的星空粒子网络：
 * - 透明 canvas，不填充黑底，绝不覆盖站点背景
 * - 粒子之间连线，鼠标靠近产生排斥
 * - 鼠标移动留下短生命周期的星尘轨迹
 * - pointer-events:none，不影响任何点击
 */
export default defineComponent({
  name: "MouseTrail",
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null);
    let ctx: CanvasRenderingContext2D | null = null;
    let raf = 0;
    let lastFrame = 0;
    let running = true;
    let dpr = 1;
    let width = 0, height = 0;
    let mouse = { x: -999, y: -999 };
    const nodes: Node[] = [];
    const trail: Trail[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    function resize() {
      const cv = canvas.value;
      if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth; height = window.innerHeight;
      cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
      cv.style.width = width + "px"; cv.style.height = height + "px";
      ctx = cv.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(96, Math.max(42, Math.round(width * height / 18000)));
      while (nodes.length < target) nodes.push({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
        r: 0.9 + Math.random() * 1.8, hue: HUES[Math.floor(Math.random() * HUES.length)],
      });
      nodes.length = target;
    }
    function spawn(x: number, y: number) {
      if (trail.length > 120) trail.splice(0, trail.length - 120);
      for (let i = 0; i < 2; i++) trail.push({
        x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5 - 0.1,
        age: 0, life: 650 + Math.random() * 500, r: 0.8 + Math.random() * 2.2,
        hue: HUES[Math.floor(Math.random() * HUES.length)],
      });
    }
    function drawNode(n: Node) {
      if (!ctx) return;
      ctx.beginPath();
      ctx.fillStyle = "hsla(" + n.hue + ", 65%, 58%, .52)";
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "hsla(" + n.hue + ", 80%, 78%, .35)";
      ctx.arc(n.x - n.r * 0.35, n.y - n.r * 0.35, n.r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    function frame(now: number) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 16) return;
      const dt = Math.min(42, now - (lastFrame || now));
      lastFrame = now;
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      // 星光网络
      for (const n of nodes) {
        n.x += n.vx * dt * 0.06; n.y += n.vy * dt * 0.06;
        if (n.x < -10) n.x = width + 10; if (n.x > width + 10) n.x = -10;
        if (n.y < -10) n.y = height + 10; if (n.y > height + 10) n.y = -10;
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < 130 && d > 0) {
          const force = (1 - d / 130) * 0.28;
          n.x += (dx / d) * force * 6; n.y += (dy / d) * force * 6;
        }
      }
      ctx.lineWidth = 0.65;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 125) continue;
          ctx.strokeStyle = "hsla(258, 55%, 52%, " + ((1 - d / 125) * 0.18) + ")";
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      for (const n of nodes) drawNode(n);
      // 鼠标星尘
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.age += dt;
        if (p.age >= p.life) { trail.splice(i, 1); continue; }
        p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06;
        const k = 1 - p.age / p.life;
        ctx.beginPath();
        ctx.fillStyle = "hsla(" + p.hue + ", 80%, 65%, " + (k * 0.75) + ")";
        ctx.arc(p.x, p.y, p.r * (0.6 + k), 0, Math.PI * 2); ctx.fill();
        if (mouse.x > 0) {
          const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
          if (d < 90) {
            ctx.strokeStyle = "hsla(" + p.hue + ", 70%, 58%, " + (k * 0.18) + ")";
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
          }
        }
      }
    }
    function move(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      mouse = { x: e.clientX, y: e.clientY };
      spawn(e.clientX, e.clientY);
    }
    onMounted(() => {
      if (reduced) return;
      resize();
      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pointermove", move, { passive: true });
      raf = requestAnimationFrame(frame);
    });
    onBeforeUnmount(() => {
      running = false; cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    });
    return () => h("canvas", {
      ref: canvas, class: "mouse-trail-canvas", "aria-hidden": "true",
      style: { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "2147483000", background: "transparent" },
    });
  },
});
