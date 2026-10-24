<template>
  <div class="ai-tools">
    <div class="ai-tools-head">
      <strong>✦ AI 学习工具</strong>
      <span class="ai-tools-hint">讲题一次一步，懂了再继续</span>
    </div>
    <div class="ai-tools-row">
      <select v-model="pickedId" class="ai-select">
        <option value="">选择一道题…</option>
        <option v-for="q in questions.slice(0, 100)" :key="q.id" :value="q.id">{{ q.stem.slice(0, 30) }}</option>
      </select>
      <button class="ai-btn" :disabled="!pickedId || busy" @click="tutor(false)">分步讲题</button>
      <button class="ai-btn" :disabled="!pickedId || busy" @click="tutor(true)">3D 演示</button>
      <button class="ai-btn" :disabled="busy" @click="generate('single')">生成选择题</button>
      <button class="ai-btn" :disabled="busy" @click="generate('judge')">生成判断题</button>
      <button class="ai-btn" :disabled="busy || !questions.length" @click="simplifyAll">批量简化答案</button>
    </div>
    <p v-if="tip" class="ai-tip">{{ tip }}</p>

    <div v-if="steps.length" class="ai-board">
      <div class="ai-board-head">
        <strong>板书</strong>
        <label class="ai-voice"><input type="checkbox" v-model="speakOn" /> 语音朗读</label>
        <button class="ai-btn" @click="speakCurrent">重听这一步</button>
      </div>
      <canvas ref="boardRef" class="ai-board-canvas"></canvas>
    </div>
    <div v-if="steps.length" class="ai-steps">
      <ol>
        <li v-for="(s, i) in visibleSteps" :key="i">{{ s.text }}</li>
      </ol>
      <div class="ai-steps-actions">
        <button v-if="waiting" class="ai-btn primary" @click="nextStep">懂了，继续</button>
        <span v-else class="ai-tools-hint">这一步讲完了，可以继续追问</span>
        <input v-model="ask" class="ai-input" placeholder="追问：为什么？/ 举个例子" @keyup.enter="askMore" />
        <button class="ai-btn" :disabled="!ask.trim() || busy" @click="askMore">提问</button>
      </div>
    </div>

    <div v-if="scene" class="ai-3d">
      <div class="ai-3d-head">
        <strong>3D 演示 · {{ scene.text || scene.shape }}</strong>
        <button class="ai-btn" @click="scene = null">关闭</button>
      </div>
      <div ref="threeHost" class="ai-3d-host"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch, nextTick } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const props = defineProps<{ subjectId?: string; versionId?: string; questions?: any[] }>();
const emit = defineEmits<{ (e: "changed"): void }>();

const questions = computed(() => props.questions || []);
const pickedId = ref("");
const busy = ref(false);
const tip = ref("");
const steps = ref<any[]>([]);
const stepIdx = ref(0);
const waiting = ref(false);
const ask = ref("");
const scene = ref<any>(null);
const boardRef = ref<HTMLCanvasElement | null>(null);
const speakOn = ref(true);
let audioEl: HTMLAudioElement | null = null;
const threeHost = ref<HTMLElement | null>(null);

const visibleSteps = computed(() => steps.value.slice(0, stepIdx.value + 1));

watch(visibleSteps, () => { drawBoard(); speakCurrent(); }, { deep: true });

function drawBoard() {
  const cv = boardRef.value;
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 600, h = 220;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#3f3353";
  ctx.font = "500 14px system-ui, -apple-system, sans-serif";
  let y = 26;
  for (const st of visibleSteps.value) {
    const text = String(st.text || "");
    let line = "";
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > w - 48) { ctx.fillText(line, 22, y); y += 22; line = ch; }
      else line += ch;
    }
    if (line) { ctx.fillText(line, 22, y); y += 22; }
    if (st.draw && st.draw !== "text") { drawMark(ctx, st.draw, 24, y, w); y += 54; }
    y += 6;
    if (y > h - 30) break;
  }
}
function drawMark(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, w: number) {
  ctx.strokeStyle = "#7460c9"; ctx.lineWidth = 2;
  if (kind === "line" || kind === "arrow") {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 160, y); ctx.stroke();
    if (kind === "arrow") { ctx.beginPath(); ctx.moveTo(x + 160, y); ctx.lineTo(x + 148, y - 6); ctx.lineTo(x + 148, y + 6); ctx.closePath(); ctx.fill(); }
  } else if (kind === "circle") { ctx.beginPath(); ctx.arc(x + 24, y, 18, 0, Math.PI * 2); ctx.stroke(); }
  else if (kind === "box") { ctx.strokeRect(x, y - 18, 90, 40); }
}
async function speakCurrent() {
  if (!speakOn.value) return;
  const text = visibleSteps.value[visibleSteps.value.length - 1]?.text || "";
  if (!text) return;
  try {
    const res = await fetch("/api/ai/tts-aliyun", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(window.__zgCsrf ? { "X-CSRF-Token": window.__zgCsrf } : {}) },
      credentials: "same-origin",
      body: JSON.stringify({ text, voice: "Cherry" }),
    });
    if (!res.ok) throw new Error("tts");
    const blob = await res.blob();
    audioEl?.pause();
    audioEl = new Audio(URL.createObjectURL(blob));
    void audioEl.play().catch(() => {});
  } catch {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text.slice(0, 120));
      u.lang = "zh-CN";
      window.speechSynthesis.speak(u);
    }
  }
}

async function call(path: string, body: any) {
  const res = await fetch("/api" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(window.__zgCsrf ? { "X-CSRF-Token": window.__zgCsrf } : {}) },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "请求失败");
  return json;
}

async function simplifyAll() {
  if (busy.value) return;
  busy.value = true; tip.value = "正在批量生成简化答案（每次最多 8 道）…";
  try {
    let done = 0;
    for (const q of questions.value) {
      if (q.simpleAnswer) continue;
      if (done >= 8) break;
      await call("/study/questions/" + q.id + "/simplify", {});
      done++;
    }
    tip.value = "已生成 " + done + " 道题的简化答案";
    emit("changed");
  } catch (e: any) { tip.value = "失败：" + e.message; }
  finally { busy.value = false; }
}

async function generate(kind: string) {
  if (!props.versionId || busy.value) return;
  busy.value = true; tip.value = "AI 正在出题…";
  try {
    const r = await call("/study/versions/" + props.versionId + "/generate", { kind, count: 5 });
    tip.value = "已向当前版本追加 " + r.appended + " 道" + (kind === "single" ? "选择题" : "判断题");
    emit("changed");
  } catch (e: any) { tip.value = "失败：" + e.message; }
  finally { busy.value = false; }
}

async function tutor(with3d: boolean) {
  if (busy.value) return;
  busy.value = true; tip.value = "AI 正在备课…"; steps.value = []; scene.value = null;
  try {
    const r = await call("/study/tutor", {
      questionId: pickedId.value,
      message: with3d ? "请用 3D 模型演示这个知识点" : "",
    });
    steps.value = r.steps || [];
    stepIdx.value = 0; waiting.value = steps.value.length > 1;
    if (r.scene) scene.value = r.scene;
    tip.value = r.reply || "";
  } catch (e: any) { tip.value = "失败：" + e.message; }
  finally { busy.value = false; }
}

function nextStep() {
  if (stepIdx.value + 1 < steps.value.length) {
    stepIdx.value += 1;
    waiting.value = stepIdx.value + 1 < steps.value.length;
  } else waiting.value = false;
}

async function askMore() {
  if (!ask.value.trim() || busy.value) return;
  const q = ask.value.trim(); ask.value = "";
  busy.value = true;
  try {
    const r = await call("/study/tutor", { questionId: pickedId.value, message: q });
    tip.value = r.reply || "";
    if (r.steps?.length) { steps.value = r.steps; stepIdx.value = 0; waiting.value = r.steps.length > 1; }
  } catch (e: any) { tip.value = "失败：" + e.message; }
  finally { busy.value = false; }
}

// 3D
let renderer: any = null, sc: any = null, cam: any = null, ctrl: any = null, grp: any = null, raf = 0;
function buildScene(spec: any) {
  if (!sc) return;
  if (grp) { sc.remove(grp); }
  grp = new THREE.Group();
  const shape = String(spec?.shape || "cube");
  const mat = new THREE.MeshStandardMaterial({ color: 0x7460c9, roughness: 0.35, metalness: 0.15 });
  const line = new THREE.LineBasicMaterial({ color: 0x2f2a45 });
  const addEdges = (m: any) => { m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), line)); return m; };
  if (shape === "sphere") grp.add(addEdges(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat)));
  else if (shape === "cone") grp.add(addEdges(new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 32), mat)));
  else if (shape === "cylinder") grp.add(addEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32), mat)));
  else if (shape === "torus") grp.add(addEdges(new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 16, 48), mat)));
  else if (shape === "pyramid") grp.add(addEdges(new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 4), mat)));
  else if (shape === "graph") {
    const pts = [[-1.4, -1, 0], [0, 1.2, 0], [1.4, -1, 0], [0, 0, 1.2]];
    for (const p of pts) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2f9e8f }));
      d.position.set(p[0], p[1], p[2]); grp.add(d);
    }
    for (const [a, b] of [[0,1],[1,2],[0,2],[0,3],[1,3],[2,3]]) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...(pts[a] as [number, number, number])),
        new THREE.Vector3(...(pts[b] as [number, number, number])),
      ]);
      grp.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7460c9 })));
    }
  } else grp.add(addEdges(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat)));
  sc.add(grp);
}

watch(scene, async (v) => {
  if (!v) { cancelAnimationFrame(raf); if (renderer) { renderer.dispose(); renderer = null; sc = null; } return; }
  await nextTick();
  const host = threeHost.value;
  if (!host) return;
  sc = new THREE.Scene(); sc.background = new THREE.Color(0xfaf8fd);
  cam = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.1, 100);
  cam.position.set(3.2, 2.6, 3.6);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);
  ctrl = new OrbitControls(cam, renderer.domElement);
  ctrl.enableDamping = true;
  sc.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(4, 6, 5); sc.add(dir);
  sc.add(new THREE.GridHelper(6, 12, 0xe6def0, 0xefe9f7));
  buildScene(v);
  const loop = () => { raf = requestAnimationFrame(loop); ctrl.update(); renderer.render(sc, cam); };
  loop();
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); try { renderer?.dispose(); } catch {} });
</script>

<style scoped>
.ai-tools { background: #fff; border: 1px solid var(--border, #ece5f3); border-radius: 14px; padding: 12px 14px; margin: 12px 0; box-shadow: var(--shadow, 0 8px 24px rgba(60,40,90,.1)); }
.ai-tools-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.ai-tools-head strong { font-size: 14px; color: #3f3353; }
.ai-tools-hint { font-size: 11px; color: #9c8fae; }
.ai-tools-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ai-select { border: 1px solid #e6def0; border-radius: 8px; padding: 6px 8px; font-size: 12px; max-width: 260px; }
.ai-btn { border: 1px solid #e6def0; background: #fff; color: #5c4b6e; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.ai-btn.primary { background: #7460c9; border-color: #7460c9; color: #fff; }
.ai-btn:disabled { opacity: .5; cursor: not-allowed; }
.ai-tip { margin: 8px 0 0; font-size: 12px; color: #5c4b6e; line-height: 1.7; }
.ai-steps { margin-top: 10px; border-top: 1px dashed #efe9f7; padding-top: 8px; }
.ai-steps ol { margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
.ai-steps li { font-size: 12px; color: #3f3353; line-height: 1.7; }
.ai-steps-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ai-input { flex: 1; min-width: 160px; border: 1px solid #e6def0; border-radius: 8px; padding: 6px 9px; font-size: 12px; }
.ai-3d { margin-top: 10px; border: 1px solid #efe9f7; border-radius: 10px; overflow: hidden; }
.ai-3d-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #faf8fd; font-size: 12px; }
.ai-3d-host { width: 100%; height: 320px; }
.ai-board { margin-top: 10px; border: 1px solid #efe9f7; border-radius: 10px; overflow: hidden; background: #fffdf8; }
.ai-board-head { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #faf8fd; font-size: 12px; }
.ai-board-head strong { color: #3f3353; }
.ai-voice { display: flex; align-items: center; gap: 4px; color: #6b5c7d; }
.ai-board-canvas { display: block; width: 100%; height: 220px; }
</style>
