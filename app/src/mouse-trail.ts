import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

type Node = { x: number; y: number; vx: number; vy: number };
type Tendril = {
  spring: number;
  friction: number;
  nodes: Node[];
  update: () => void;
  draw: () => void;
};

/**
 * 从 bigdata_analysis/templates/test.html + static/assets/source/3.js 移植。
 * 原效果是 20 条、每条 50 节点的 Tendril 弹簧拖尾，黑色背景只是原页面底色。
 * 这里只保留拖尾：透明 canvas、clearRect 每帧重绘，不填黑底、不拦截点击。
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
    const target = { x: 0, y: 0 };
    let tendrils: Tendril[] = [];
    let phase = Math.random() * Math.PI * 2;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const TRAILS = 20, SIZE = 50;

    function makeTendril(spring: number): Tendril {
      const nodes: Node[] = [];
      for (let i = 0; i < SIZE; i++) nodes.push({ x: target.x, y: target.y, vx: 0, vy: 0 });
      const friction = 0.5 + (Math.random() * 0.01) - 0.005;
      return {
        spring, friction, nodes,
        update() {
          let s = this.spring;
          const first = this.nodes[0];
          first.vx += (target.x - first.x) * s;
          first.vy += (target.y - first.y) * s;
          for (let i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i];
            if (i > 0) {
              const prev = this.nodes[i - 1];
              n.vx += (prev.x - n.x) * s;
              n.vy += (prev.y - n.y) * s;
              n.vx += prev.vx * 0.25;
              n.vy += prev.vy * 0.25;
            }
            n.vx *= this.friction; n.vy *= this.friction;
            n.x += n.vx; n.y += n.vy;
            s *= 0.98;
          }
        },
        draw() {
          if (!ctx) return;
          const n = this.nodes;
          let x = n[0].x, y = n[0].y;
          ctx.beginPath();
          ctx.moveTo(x, y);
          let i = 1;
          for (; i < n.length - 2; i++) {
            const a = n[i], b = n[i + 1];
            x = (a.x + b.x) * 0.5; y = (a.y + b.y) * 0.5;
            ctx.quadraticCurveTo(a.x, a.y, x, y);
          }
          ctx.quadraticCurveTo(n[i].x, n[i].y, n[i + 1].x, n[i + 1].y);
          ctx.stroke();
        },
      };
    }
    function reset() {
      tendrils = [];
      for (let i = 0; i < TRAILS; i++) tendrils.push(makeTendril(0.45 + 0.025 * (i / TRAILS)));
    }
    function resize() {
      const cv = canvas.value; if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth; height = window.innerHeight;
      cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
      cv.style.width = width + "px"; cv.style.height = height + "px";
      ctx = cv.getContext("2d");
      if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); }
      target.x = width / 2; target.y = height / 2 - 40;
      reset();
    }
    function move(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      target.x = e.clientX; target.y = e.clientY;
    }
    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (!ctx) return;
      // 透明画布上的淡出：只降低旧像素 alpha，不填任何背景色。
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      phase += 0.0015;
      const hue = 255 + Math.sin(phase) * 65;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 0.85;
      ctx.lineCap = "round";
      // 浅色站点上用深一点的青/紫，保留原效果的色相变化
      ctx.strokeStyle = "hsla(" + Math.round(hue) + ", 78%, 45%, .22)";
      ctx.shadowBlur = 5;
      ctx.shadowColor = "hsla(" + Math.round(hue) + ", 85%, 55%, .16)";
      for (const t of tendrils) { t.update(); t.draw(); }
      ctx.shadowBlur = 0;
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
