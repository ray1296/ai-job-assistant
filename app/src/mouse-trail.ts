import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

type P = { x: number; y: number; r: number; color: string; radians: number; velocity: number; baseD: number; dx: number; dy: number; lastX: number; lastY: number };
const COLORS = ["#00bdff", "#4d39ce", "#088eff"];

/**
 * 从 bigdata_analysis/templates/shubiaotexiao.html 移植：
 * 50 个粒子围绕鼠标做圆周运动，并保留上一帧到当前帧的拖尾线。
 * 背景是深色星河，但 canvas 仍然 pointer-events:none。
 */
export default defineComponent({
  name: "MouseTrail",
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null);
    let ctx: CanvasRenderingContext2D | null = null;
    let raf = 0;
    let running = true;
    let width = 0, height = 0;
    let dpr = 1;
    const mouse = { x: 0, y: 0 };
    const particles: P[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1) + min); }
    function color() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
    function init() {
      particles.length = 0;
      for (let i = 0; i < 50; i++) {
        const d = randomInt(50, 120);
        particles.push({
          x: width / 2, y: height / 2, r: Math.random() * 2 + 1, color: color(),
          radians: Math.random() * Math.PI * 2, velocity: 0.05,
          baseD: d, dx: d, dy: d, lastX: width / 2, lastY: height / 2,
        });
      }
    }
    function resize() {
      const cv = canvas.value; if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth; height = window.innerHeight;
      cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
      cv.style.width = width + "px"; cv.style.height = height + "px";
      ctx = cv.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mouse.x = width / 2; mouse.y = height / 2 - 80;
      init();
    }
    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!ctx) return;
      // 深色底 + 半透明残影，形成长拖尾；不是纯黑覆盖层
      ctx.fillStyle = "rgba(3, 7, 18, 0.075)";
      ctx.fillRect(0, 0, width, height);
      for (const p of particles) {
        const lx = p.x, ly = p.y;
        p.radians += p.velocity;
        p.lastX += (mouse.x - p.lastX) * 0.05;
        p.lastY += (mouse.y - p.lastY) * 0.05;
        p.dx = p.baseD + Math.sin(p.radians) * 100;
        p.dy = p.baseD + Math.sin(p.radians) * 100;
        p.x = p.lastX + Math.cos(p.radians) * p.dx;
        p.y = p.lastY + Math.sin(p.radians) * p.dy;
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.r;
        ctx.moveTo(lx, ly);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
    function move(e: PointerEvent) { if (e.pointerType !== "touch") { mouse.x = e.clientX; mouse.y = e.clientY; } }
    onMounted(() => {
      if (reduced) return;
      resize(); window.addEventListener("resize", resize, { passive: true });
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
      style: { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "0", background: "#030712" },
    });
  },
});
