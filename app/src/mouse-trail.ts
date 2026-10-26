import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

type P = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; hue: number; spin: number };
const PALETTE = [265, 285, 315, 38, 190];

/**
 * 首页鼠标拖尾：透明 canvas，粒子在光标后散开并淡出。
 * 关键：canvas 本身不 fill 背景，只 clearRect；不会把页面背景覆盖成黑色。
 */
export default defineComponent({
  name: "MouseTrail",
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null);
    let ctx: CanvasRenderingContext2D | null = null;
    let raf = 0;
    let last = 0;
    let running = true;
    let dpr = 1;
    let width = 0, height = 0;
    const parts: P[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    function resize() {
      const cv = canvas.value;
      if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      cv.style.width = width + "px";
      cv.style.height = height + "px";
      ctx = cv.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function add(x: number, y: number) {
      if (parts.length > 160) parts.splice(0, parts.length - 160);
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.25 + Math.random() * 1.2;
        parts.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 0.2,
          age: 0,
          life: 500 + Math.random() * 550,
          size: 1.2 + Math.random() * 3.2,
          hue: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          spin: Math.random() * Math.PI,
        });
      }
    }
    function frame(now: number) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 16) return;
      const dt = Math.min(40, now - (last || now));
      last = now;
      ctx?.clearRect(0, 0, width, height);
      if (!ctx) return;
      ctx.globalCompositeOperation = "lighter";
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt * 0.06;
        p.y += p.vy * dt * 0.06;
        p.vx *= 0.992; p.vy *= 0.992;
        const k = 1 - p.age / p.life;
        const alpha = k * k * 0.9;
        const r = p.size * (0.6 + k * 0.7);
        ctx.beginPath();
        ctx.fillStyle = "hsla(" + p.hue + ", 85%, 72%, " + alpha + ")";
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (r > 2.4) {
          ctx.fillStyle = "hsla(" + p.hue + ", 95%, 88%, " + (alpha * 0.8) + ")";
          ctx.beginPath();
          ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    function move(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      add(e.clientX, e.clientY);
    }
    onMounted(() => {
      if (reduced) return;
      resize();
      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pointermove", move, { passive: true });
      raf = requestAnimationFrame(frame);
    });
    onBeforeUnmount(() => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    });
    return () => h("canvas", {
      ref: canvas,
      class: "mouse-trail-canvas",
      "aria-hidden": "true",
      style: {
        position: "fixed", inset: "0", width: "100vw", height: "100vh",
        pointerEvents: "none", zIndex: "2147483000", background: "transparent",
      },
    });
  },
});
