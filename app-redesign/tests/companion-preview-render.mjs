/**
 * 生成「看板娘形象」缩略图：用真实 Live2D 渲染器在 Chromium 里逐个模型截图，
 * 裁掉透明边、统一成 132x180，落到 app/public/assets/companions/model-<key>.png。
 *
 * 用法（需要本地服务已启动在 5173，因为模型走 /live2d/ 静态路径）：
 *   node tests/companion-preview-render.mjs
 *
 * key 必须与 Live2DPet.vue 的 MODEL_NAMES 顺序一致。
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const OUT = new URL("../public/assets/companions/", import.meta.url);
const MODELS = {
  miku: "/live2d/live2d-widget-models/live2d-widget-model-miku/assets/miku.model.json",
  shizuku: "/live2d/live2d-widget-models/live2d-widget-model-shizuku/assets/shizuku.model.json",
  chitose: "/live2d/live2d-widget-models/live2d-widget-model-chitose/assets/chitose.model.json",
  koharu: "/live2d/live2d-widget-models/live2d-widget-model-koharu/assets/koharu.model.json",
  haru: "/live2d/live2d-widget-models/live2d-widget-model-haru/01/assets/haru01.model.json",
  wanko: "/live2d/live2d-widget-models/live2d-widget-model-wanko/assets/wanko.model.json",
  vert: "/live2d/live2d-widget-models/live2d-widget-model-vert/vert_classic/vert_classic.model.json",
  nepgear_extra: "/live2d/live2d-widget-models/live2d-widget-model-nepgear_extra/nepgear_extra/nepgear_extra.model.json",
  haruto: "/live2d/live2d-widget-models/live2d-widget-model-haruto/assets/haruto.model.json",
  haru2: "/live2d/live2d-widget-models/live2d-widget-model-haru/02/assets/haru02.model.json",
  histoire: "/live2d/live2d-widget-models/live2d-widget-model-histoire/histoire/histoire.model.json",
  blanc_normal: "/live2d/live2d-widget-models/live2d-widget-model-blanc_normal/blanc_normal/blanc_normal.model.json",
};
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 300, height: 360 }, deviceScaleFactor: 2 });
await fs.mkdir(OUT, { recursive: true });
for (const [id, url] of Object.entries(MODELS)) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + "/live2d-pet.html?model=" + encodeURIComponent(url));
  await p.waitForTimeout(3200);
  const shot = await p.locator("#pet").screenshot({ omitBackground: true });
  const data = await p.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
      if (d[(y * c.width + xx) * 4 + 3] > 12) {
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const W = 132, H = 180;
    const out = document.createElement("canvas");
    out.width = W; out.height = H;
    const ox = out.getContext("2d");
    const s = Math.min(W / bw, H / bh);
    ox.drawImage(c, minX, minY, bw, bh, (W - bw * s) / 2, (H - bh * s) / 2, bw * s, bh * s);
    return out.toDataURL("image/png");
  }, shot.toString("base64"));
  if (!data) { console.log("EMPTY", id, errs); await p.close(); continue; }
  const buf = Buffer.from(data.split(",")[1], "base64");
  await fs.writeFile(new URL("model-" + id + ".png", OUT), buf);
  console.log("WROTE", id, buf.length, "bytes");
  await p.close();
}
await browser.close();
