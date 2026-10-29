import {
  defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick, watch,
} from "vue";
import { api, errorText } from "./api";
import { petPositions, setPetPos } from "./pet-store";
import { voiceOn, setVoiceOn, speakAs, stopSpeech } from "./voice";
import { addMemory, clearMemory, memoryEntries, memoryStats, memoryText, MEMORY_TTL_DAYS } from "./agent-memory";
import { extractFile } from "./extract-file";
import { confirmPendingAction } from "./agent-action";

const ROLE_SHORT: Record<string, string> = {
  主理人: "主理", 学习助教: "学习", 求职顾问: "求职", 生活管家: "生活",
};

export const AGENT_GREETS: Record<string, string> = {
  xingye: "我是星野。卡住了就问我，讲题、选岗位、看企业都行。",
  zhiwei: "我是知微，负责陪你把题刷明白。哪道题不懂？",
  yanzhou: "我是砚舟。简历、岗位、面试节奏都可以问我。",
  qichi: "我是栖迟。租房、通勤、城市生活的事找我。",
};

/** 把图片压到适合多模态请求的尺寸，避免超过服务端体积上限。 */
async function imageToDataUrl(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const max = 1100;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  try { bmp.close(); } catch {}
  return c.toDataURL("image/jpeg", 0.84);
}

export default defineComponent({
  props: {
    agentId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "" },
    avatar: { type: String, default: "" },
    // 功能图标（emoji）：按需求用图标代替花哨立绘头像
    icon: { type: String, default: "" },
    slot: { type: Number, default: 0 },
    page: { type: String, default: "" },
  },
  setup(props) {
    const open = ref(false);
    const log = ref<{ role: "me" | "ai"; text: string; image?: string }[]>([
      { role: "ai", text: AGENT_GREETS[props.agentId] || "我在。" },
    ]);
    const loaded = ref(false);
    const busy = ref(false);
    const err = ref("");
    const msg = ref("");
    const pendingImage = ref("");
    const pendingDoc = ref<{ name: string; text: string; chars: number } | null>(null);
    const listening = ref(false);
    const memPct = ref(memoryStats(props.name).pct);
    const memDismissed = ref(false);
    const memBusy = ref(false);
    const logEl = ref<HTMLElement | null>(null);
    const inputEl = ref<HTMLElement | null>(null);
    const drafts = ref<{ id: number; label: string; content: string }[]>([]);
    const sessions = ref<{ id: string; title: string; messages: any[]; updatedAt: number }[]>([]);
    const activeSession = ref("");
    const sessionMenu = ref(false);
    const tutorSteps = ref<any[]>([]);
    const tutorOpen = ref(false);
    const bubbleText = ref("");
    const bubbleVisible = ref(false);
    let bubbleTimer: any = 0;
    const pageHtml = ref("");
    const pageTitle = ref("");
    const pageId = ref("");
    const pageOpen = ref(false);
    const tutorStep = ref(0);
    const tutorScene = ref<any>(null);
    const tutorBoard = ref<HTMLCanvasElement | null>(null);
    const tutorHost = ref<HTMLElement | null>(null);
    const visibleTutorSteps = computed(() => tutorSteps.value.slice(0, tutorStep.value + 1));
    let tutorRaf = 0, tutorRenderer: any = null, tutorSceneObj: any = null, tutorGroup: any = null, tutor3dToken = 0;
    const vw = ref(window.innerWidth);
    const vh = ref(window.innerHeight);

    const pos = computed(() => petPositions[props.agentId] || { x: 0, y: 0 });
    /** 对话框锚定在该 chip 正上方：左边跟随 chip 中心，底边贴在 chip 顶上 10px。 */
    const panelStyle = computed(() => {
      const W = 300;
      const p = pos.value;
      const left = Math.min(Math.max(8, p.x + 27 - W / 2), Math.max(8, vw.value - W - 8));
      const bottom = Math.max(8, vh.value - p.y + 10);
      const maxHeight = Math.max(170, Math.min(Math.round(vh.value * 0.52), p.y - 76));
      return { left: left + "px", bottom: bottom + "px", top: "auto", maxHeight: maxHeight + "px" };
    });

    const SESSION_KEY = "zg.agentSessions." + props.agentId;
    function readSessionStore() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        const data = raw ? JSON.parse(raw) : null;
        if (data && Array.isArray(data.sessions)) return data;
      } catch {}
      return null;
    }
    function saveSessionStore() {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          active: activeSession.value,
          sessions: sessions.value.slice(0, 20),
        }));
      } catch {}
    }
    function titleOf(messages: any[]) {
      const first = (messages || []).find((m) => m.role === "me" && String(m.text || "").trim());
      return first ? String(first.text).replace(/\s+/g, " ").slice(0, 22) : "新会话";
    }
    function persistActive() {
      if (!activeSession.value) return;
      const s = sessions.value.find((x) => x.id === activeSession.value);
      if (!s) return;
      s.messages = log.value.slice(-80);
      s.title = titleOf(s.messages);
      s.updatedAt = Date.now();
      saveSessionStore();
    }
    function resetTutor() {
      tutorSteps.value = [];
      tutorScene.value = null;
      tutorOpen.value = false;
      pageHtml.value = "";
      pageTitle.value = "";
      pageId.value = "";
      pageOpen.value = false;
      drafts.value = [];
      stopTutor3D();
    }
    function clearInput() {
      msg.value = "";
      if (inputEl.value) inputEl.value.textContent = "";
      autoResize();
    }
    function newSession() {
      persistActive();
      const id = "s" + Date.now() + Math.floor(Math.random() * 1000);
      const s = { id, title: "新会话", messages: [{ role: "ai" as const, text: AGENT_GREETS[props.agentId] || "我在。" }], updatedAt: Date.now() };
      sessions.value = [s, ...sessions.value].slice(0, 20);
      activeSession.value = id;
      log.value = s.messages;
      resetTutor();
      clearInput();
      sessionMenu.value = false;
      saveSessionStore();
      nextTick(() => { scrollLog(); inputEl.value?.focus(); });
    }
    function switchSession(id: string) {
      const s = sessions.value.find((x) => x.id === id);
      if (!s) return;
      persistActive();
      activeSession.value = id;
      log.value = s.messages;
      resetTutor();
      clearInput();
      sessionMenu.value = false;
      saveSessionStore();
      nextTick(scrollLog);
    }
    function deleteSession(id: string) {
      const target = sessions.value.find((x) => x.id === id);
      if (!target || !confirm("删除会话「" + (target.title || "新会话") + "」？此操作不可撤销。")) return;
      const wasActive = activeSession.value === id;
      const rest = sessions.value.filter((x) => x.id !== id);
      if (!rest.length) {
        const nid = "s" + Date.now() + Math.floor(Math.random() * 1000);
        const s = { id: nid, title: "新会话", messages: [{ role: "ai" as const, text: AGENT_GREETS[props.agentId] || "我在。" }], updatedAt: Date.now() };
        sessions.value = [s];
        activeSession.value = nid;
        log.value = s.messages;
      } else {
        sessions.value = rest;
        if (wasActive) {
          activeSession.value = rest[0].id;
          log.value = rest[0].messages;
        }
      }
      resetTutor();
      clearInput();
      saveSessionStore();
      nextTick(scrollLog);
    }
    function ensureSession() {
      if (sessions.value.length) {
        if (!activeSession.value) activeSession.value = sessions.value[0].id;
        return;
      }
      const id = "s" + Date.now() + Math.floor(Math.random() * 1000);
      const s = { id, title: titleOf(log.value), messages: log.value.slice(), updatedAt: Date.now() };
      sessions.value = [s];
      activeSession.value = id;
      saveSessionStore();
    }
    const savedStore = readSessionStore();
    if (savedStore?.sessions?.length) {
      sessions.value = savedStore.sessions;
      activeSession.value = savedStore.active && savedStore.sessions.some((s: any) => s.id === savedStore.active) ? savedStore.active : savedStore.sessions[0].id;
      const active = savedStore.sessions.find((s: any) => s.id === activeSession.value);
      if (active?.messages?.length) {
        log.value = active.messages;
        loaded.value = true;
      }
    }
    watch(log, () => persistActive(), { deep: true });

    function scrollLog() {
      void nextTick(() => {
        if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
      });
    }
    const INPUT_MIN_W = 120, INPUT_MAX_W = 260, INPUT_MIN_H = 36, INPUT_MAX_H = 120;
    function autoResize() {
      const el = inputEl.value;
      if (!el) return;
      el.style.width = "auto";
      el.style.whiteSpace = "pre";
      el.style.height = "auto";
      el.style.overflowY = "hidden";
      const want = el.scrollWidth;
      if (want <= INPUT_MAX_W) {
        el.style.width = Math.max(INPUT_MIN_W, want) + "px";
        el.style.height = INPUT_MIN_H + "px";
      } else {
        el.style.whiteSpace = "pre-wrap";
        el.style.width = INPUT_MAX_W + "px";
        el.style.height = Math.min(el.scrollHeight, INPUT_MAX_H) + "px";
        el.style.overflowY = el.scrollHeight > INPUT_MAX_H ? "auto" : "hidden";
      }
    }
    function onInput() {
      msg.value = (inputEl.value?.innerText || "").replaceAll("\u00a0", " ");
      autoResize();
    }

    async function loadHistory() {
      if (loaded.value) return;
      loaded.value = true;
      try {
        const r = await api<any>("/companion/history?agent=" + encodeURIComponent(props.agentId), "GET", undefined, { timeoutMs: 10000 });
        const list = Array.isArray(r?.messages) ? r.messages : [];
        // 只在还没开始聊天时套用服务端历史，避免和用户刚发出的消息打架
        if (list.length && log.value.length <= 1 && !busy.value) log.value = list.map((m: any) => ({
          role: m.role === "user" ? "me" : "ai",
          text: String(m.text || ""),
        }));
        scrollLog();
        ensureSession();
      } catch {}
    }

    const bubbleQueue: { text: string; duration: number }[] = [];
    function showBubble(text: string, duration = 6500) {
      const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
      if (!clean) return;
      if (bubbleVisible.value) {
        if (bubbleQueue.length < 4) bubbleQueue.push({ text: clean, duration });
        return;
      }
      displayBubble(clean, duration);
    }
    function displayBubble(clean: string, duration: number) {
      bubbleText.value = clean;
      bubbleVisible.value = true;
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => {
        bubbleVisible.value = false;
        const next = bubbleQueue.shift();
        if (next) setTimeout(() => displayBubble(next.text, next.duration), 180);
      }, duration);
    }
    function onAgentBubble(ev: any) {
      if (ev?.detail?.agentId !== props.agentId) return;
      if (ev.detail.text) showBubble(String(ev.detail.text), Number(ev.detail.duration) || 6000);
    }
    function emitBubble(agentId: string, text: string, duration = 12000) {
      window.dispatchEvent(new CustomEvent("zg:agent-bubble", { detail: { agentId, text, duration } }));
    }
    function idByName(name: string) {
      return ({ 星野: "xingye", 知微: "zhiwei", 砚舟: "yanzhou", 栖迟: "qichi" } as Record<string, string>)[name] || "";
    }
    function openChat(force = false) {
      if (force) open.value = true;
      else open.value = !open.value;
      if (open.value) {
        // 同一时间只展开一个对话框：几个 chip 挨得很近，300px 的面板会互相盖住。
        window.dispatchEvent(new CustomEvent("zg:chat-opened", { detail: { agentId: props.agentId } }));
        memPct.value = memoryStats(props.name).pct;
        void loadHistory();
        nextTick(() => { autoResize(); inputEl.value?.focus(); });
        scrollLog();
      } else stopSpeech();
    }

    async function attachDoc(file: File) {
      try {
        err.value = "";
        const d = await extractFile(file);
        pendingDoc.value = { name: d.name, text: d.text, chars: d.chars };
      } catch (e) { err.value = (e as Error).message || "文件解析失败"; }
    }
    async function attachImage(file: Blob) {
      try {
        pendingImage.value = await imageToDataUrl(file);
      } catch (e) {
        err.value = "这张图读不出来，换一张试试";
      }
    }

    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || []);
      const hit = items.find((it) => (it.type || "").startsWith("image/"));
      if (!hit) return;
      const file = hit.getAsFile();
      if (!file) return;
      e.preventDefault();
      void attachImage(file);
    }

    function drawTutorBoard() {
      const cv = tutorBoard.value;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 260, hh = 150;
      cv.width = w * dpr; cv.height = hh * dpr;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, w, hh);
      ctx.fillStyle = "#3f3353";
      ctx.font = "500 12px system-ui, -apple-system, sans-serif";
      let y = 22;
      for (const st of visibleTutorSteps.value) {
        const text = String(st?.text || "");
        let line = "";
        for (const ch of text) {
          if (ctx.measureText(line + ch).width > w - 28) { ctx.fillText(line, 14, y); y += 18; line = ch; }
          else line += ch;
        }
        if (line) { ctx.fillText(line, 14, y); y += 18; }
        y += 4;
        if (y > hh - 12) break;
      }
    }
    function stopTutor3D() {
      tutor3dToken++;
      cancelAnimationFrame(tutorRaf);
      tutorRaf = 0;
      try { tutorRenderer?.dispose(); } catch {}
      tutorRenderer = null; tutorSceneObj = null; tutorGroup = null;
      if (tutorHost.value) tutorHost.value.innerHTML = "";
    }
    async function mountTutor3D() {
      const host = tutorHost.value;
      const spec = tutorScene.value;
      if (!host || !spec) return;
      stopTutor3D();
      const token = ++tutor3dToken;
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (token !== tutor3dToken || !tutorHost.value) return;
      host.replaceChildren();
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xfaf8fd);
      const objects = Array.isArray(spec.objects) && spec.objects.length ? spec.objects : [{ shape: spec.shape || "cube" }];
      host.dataset.objectCount = String(objects.length);
      host.dataset.objectOpacity = objects.map((o: any) => String(o.opacity == null ? 1 : o.opacity)).join(",");
      const cam = new THREE.PerspectiveCamera(50, host.clientWidth / Math.max(1, host.clientHeight), 0.1, 100);
      cam.position.set(objects.length > 1 ? 4.8 : 3.2, objects.length > 1 ? 3.4 : 2.6, objects.length > 1 ? 5.4 : 3.6);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(host.clientWidth, host.clientHeight);
      host.appendChild(renderer.domElement);
      const ctrl = new OrbitControls(cam, renderer.domElement);
      ctrl.enableDamping = true;
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(4, 6, 5); scene.add(dir);
      scene.add(new THREE.GridHelper(6, 12, 0xe6def0, 0xefe9f7));
      const grp = new THREE.Group();
      const line = new THREE.LineBasicMaterial({ color: 0x2f2a45 });
      const add = (m: any) => { m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), line)); return m; };
      objects.forEach((obj: any, i: number) => {
        const shape = String(obj.shape || "cube");
        const opacity = obj.opacity == null ? 1 : Math.max(0.12, Math.min(1, Number(obj.opacity) || 1));
        const transparent = opacity < 0.99;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(obj.color || "#7460c9"),
          roughness: 0.35,
          metalness: 0.15,
          transparent,
          opacity,
          depthWrite: !transparent,
          side: transparent ? THREE.DoubleSide : THREE.FrontSide,
        });
        let geometry;
        if (shape === "sphere") geometry = new THREE.SphereGeometry(1, 32, 24);
        else if (shape === "cone") geometry = new THREE.ConeGeometry(1, 1.8, 32);
        else if (shape === "cylinder") geometry = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32);
        else if (shape === "torus") geometry = new THREE.TorusGeometry(1, 0.35, 16, 48);
        else if (shape === "pyramid") geometry = new THREE.ConeGeometry(1, 1.8, 4);
        else geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
        const mesh = add(new THREE.Mesh(geometry, mat));
        const pos = Array.isArray(obj.position) ? obj.position : [objects.length > 1 ? (i - (objects.length - 1) / 2) * 2.2 : 0, 0, 0];
        mesh.position.set(Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0);
        mesh.scale.setScalar(Math.max(0.2, Math.min(3, Number(obj.scale) || 1)));
        grp.add(mesh);
      });
      scene.add(grp);
      tutorRenderer = renderer; tutorSceneObj = scene; tutorGroup = grp;
      const loop = () => { tutorRaf = requestAnimationFrame(loop); ctrl.update(); renderer.render(scene, cam); };
      loop();
    }
    watch(visibleTutorSteps, drawTutorBoard, { deep: true });
    watch(tutorScene, async (v) => {
      if (!v) { stopTutor3D(); return; }
      if (!tutorOpen.value) return;
      await nextTick();
      void mountTutor3D();
    });
    watch(open, (v) => { if (!v) { tutorOpen.value = false; pageOpen.value = false; } });
    watch(tutorOpen, async (v) => {
      if (!v) { stopTutor3D(); return; }
      await nextTick();
      drawTutorBoard();
      if (tutorScene.value) await mountTutor3D();
    });

    function isTutorRequest(text: string) {
      return /画布|3D|3d|立方体|正方体|球体|圆柱|圆锥|几何|立体|旋转|模型|透明|讲题|讲解|这道|题目|步骤|演示|知识|考点|题/.test(text);
    }
    function isTeamTask(text: string) {
      return /(团队|协作|一起|分配|汇总|让\s*(知微|砚舟|栖迟))/.test(String(text || ""));
    }
    function isPageRequest(text: string) {
      return /(生成|做|创建|设计|写|自定义|制作).{0,12}(网页|页面|报告页|HTML|站点)|AI\s*网页|网页版|报告页/i.test(text);
    }
    async function answerPage(text: string) {
      const r = await api<any>("/ai/custom-page", "POST", { prompt: text }, { timeoutMs: 180000 });
      const html = String(r?.html || "");
      if (!/<html[\s>]/i.test(html)) throw new Error("AI 没有返回完整网页");
      const title = String(r?.title || "AI 自定义页面").slice(0, 80);
      pageHtml.value = html;
      pageTitle.value = title;
      pageId.value = "";
      try {
        const saved = await api<any>("/ai/pages", "POST", { title, html, subjectId: "" });
        if (saved?.id) pageId.value = String(saved.id);
      } catch { /* 页面仍可在本地 iframe 查看 */ }
      pageOpen.value = true;
      log.value.push({ role: "ai", text: "已生成「" + title + "」，页面已在独立窗口打开。" });
      scrollLog();
    }
    async function answerTutor(text: string) {
      const r = await api<any>("/study/tutor", "POST", { question: text, answer: "", message: "" }, { timeoutMs: 180000 });
      log.value.push({ role: "ai", text: String(r?.reply || "我先在画布上拆成几步。") });
      tutorSteps.value = Array.isArray(r?.steps) ? r.steps : [];
      tutorStep.value = 0;
      tutorScene.value = r?.scene || (r?.need3d ? { shape: "graph", text: "3D 辅助演示" } : null);
      tutorOpen.value = true;
      await nextTick();
      drawTutorBoard();
      if (tutorScene.value) await mountTutor3D();
      scrollLog();
    }

    async function send() {
      const typed = (inputEl.value?.innerText || msg.value || "").replaceAll("\u00a0", " ").trim();
      const draftText = drafts.value.map((d) => d.content).join("\n");
      const text = [typed, draftText].filter(Boolean).join("\n");
      const image = pendingImage.value;
      const doc = pendingDoc.value;
      if ((!text && !image && !doc && !drafts.value.length) || busy.value) return;
      const shown = [drafts.value.map((d) => "[" + d.label + "]").join(" "), typed].filter(Boolean).join(" ");
      msg.value = "";
      if (inputEl.value) inputEl.value.textContent = "";
      autoResize();
      drafts.value = [];
      pendingImage.value = "";
      pendingDoc.value = null;
      log.value.push({ role: "me", text: (shown || (doc ? "📄 " + doc.name : "帮我看看这张图。")) + (doc ? "\n\n【附件：" + doc.name + "】" : ""), image: image || undefined });
      busy.value = true;
      err.value = "";
      scrollLog();
      try {
        if (!image && !doc && isPageRequest(text) && !isTeamTask(text)) {
          await answerPage(text);
          return;
        }
        if (props.agentId === "zhiwei" && !image && !doc && isTutorRequest(text)) {
          await answerTutor(text);
          return;
        }
        const r = await api<any>("/companion/chat", "POST", {
          message: (text || (doc ? "请阅读这个文件并帮我分析。" : "请看看这张图，帮我讲解一下。")) + (doc ? "\n\n【附件：" + doc.name + "】\n" + doc.text : ""),
          persona: props.name,
          page: props.page || location.hash.replace(/^#/, ""),
          history: log.value.slice(-7, -1).map((x) => ({ role: x.role, text: x.text })),
          image: image || undefined,
          memory: memoryText(props.name) || undefined,
        }, { timeoutMs: 120000 });
        const reply = String(r?.reply || "……我再想想。");
        if (r?.pendingAction) {
          const done = await confirmPendingAction(r.pendingAction);
          log.value.push({ role: "ai", text: done.cancelled ? "已取消写入。" : done.ok ? "已执行写入：" + JSON.stringify(done.result || {}).slice(0, 300) : "写入失败：" + (done.error || "未知错误") });
          return;
        }
        if (Array.isArray(r?.plan) && r.plan.length) {
          log.value.push({
            role: "ai",
            text: "🧭 " + r.plan.length + " 步：" + r.plan
              .map((p: any) => p.agent + (p.tool ? "·" + p.tool : "") + (p.ok ? " ✓" : " ✗"))
              .join(" → "),
          });
          showBubble("收到任务，我来协调其他 agent。", 7000);
          for (const step of r.plan) {
            const peerId = idByName(String(step.agent || ""));
            if (!peerId || peerId === props.agentId) continue;
            emitBubble(peerId, "收到「" + props.name + "」分配的任务：" + String(step.task || "协作处理").slice(0, 70));
            if (step.ok && step.summary) {
              emitBubble(peerId, "「" + props.name + "」的任务已处理完，结果回传中…");
              emitBubble(props.agentId, "【" + step.agent + "】返回：" + String(step.summary).slice(0, 100));
            }
          }
        } else if (r?.delegation) {
          log.value.push({
            role: "ai",
            text: "🧭 已让 " + r.delegation.agent + " 查了" + (r.delegation.tool ? "「" + r.delegation.tool + "」" : "资料") + "，再把结果交给我综合。",
          });
          const peerId = idByName(String(r.delegation.agent || ""));
          if (peerId && peerId !== props.agentId) {
            showBubble("我把这个任务交给 " + r.delegation.agent + "，等它回传结果。", 6000);
            emitBubble(peerId, "收到「" + props.name + "」的任务：" + String(r.delegation.task || "查询资料").slice(0, 70));
          }
        }
        if (isPageRequest(text) && Array.isArray(r?.plan) && r.plan.length) {
          const summary = r.plan.map((step: any) => step.agent + "：" + (step.ok ? (step.summary || "已完成") : "暂未拿到结果")).join("\n");
          try {
            await answerPage("根据以下多智能体执行结果生成求职行动清单报告页，不要编造数据：\n" + summary + "\n用户原话：" + text);
          } catch (e) {
            log.value.push({ role: "ai", text: "报告页生成失败：" + errorText(e) });
          }
        }
        log.value.push({ role: "ai", text: reply });
        if (r?.memory && addMemory(props.name, String(r.memory))) memPct.value = memoryStats(props.name).pct;
        showBubble(reply);
        const collaborative = (Array.isArray(r?.plan) && r.plan.length) || !!r?.delegation || !!r?.handoff;
        if (!collaborative) void speakAs(props.name, reply);
        if (r?.handoff?.reply) {
          const peer = String(r.handoff.to || "队友");
          log.value.push({ role: "ai", text: "【" + peer + "】" + r.handoff.reply });
          const peerId = idByName(peer);
          if (peerId) emitBubble(peerId, String(r.handoff.reply).slice(0, 160));
          // 协作气泡不朗读，避免多个音色同时说话
        }
      } catch (e) {
        err.value = errorText(e);
      } finally {
        busy.value = false;
        scrollLog();
      }
    }

    async function uploadMemory() {
      if (memBusy.value) return;
      const entries = memoryEntries(props.name);
      if (!entries.length) { memDismissed.value = true; return; }
      memBusy.value = true;
      try {
        const r = await api<any>("/agents/" + props.agentId + "/memories", "POST", { entries }, { timeoutMs: 20000 });
        clearMemory(props.name);
        memPct.value = 0;
        memDismissed.value = true;
        log.value.push({ role: "ai", text: "已把 " + (r?.added || entries.length) + " 条记忆上传到服务器，保留 30 天；本地记忆已清空。" });
        scrollLog();
      } catch (e) {
        err.value = errorText(e);
      } finally {
        memBusy.value = false;
      }
    }
    function clearLocalMemory() {
      clearMemory(props.name);
      memPct.value = 0;
      memDismissed.value = true;
      log.value.push({ role: "ai", text: "本地记忆已清空。服务器上的副本（如果有）会在 30 天后自动删除。" });
      scrollLog();
    }

    function toggleAsr() {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { err.value = "当前浏览器不支持语音识别（建议 Chrome / Edge）"; return; }
      if (listening.value) return;
      const recog = new SR();
      recog.lang = "zh-CN";
      recog.interimResults = false;
      recog.onresult = (ev: any) => {
        const text = ev?.results?.[0]?.[0]?.transcript || "";
        if (text) { msg.value = text; void send(); }
      };
      recog.onerror = () => { err.value = "没听清，再说一遍？"; listening.value = false; };
      recog.onend = () => { listening.value = false; };
      try { recog.start(); listening.value = true; } catch { listening.value = false; }
    }

    function startDrag(e: MouseEvent) {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const origin = { ...pos.value };
      let moved = false;
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (!moved) return;
        setPetPos(props.agentId, {
          x: Math.max(0, origin.x + dx),
          y: Math.max(0, origin.y + dy),
        });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (!moved) openChat();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up, { once: true });
    }

    function onToggleChat(ev: any) {
      const id = ev?.detail?.agentId || ev?.detail?.personaId;
      if (id && id === props.agentId) openChat(!!ev.detail.open);
    }
    function onOtherChat(ev: any) {
      if (ev?.detail?.agentId && ev.detail.agentId !== props.agentId && open.value) {
        open.value = false;
      }
    }
    function onAgentMessage(ev: any) {
      if (ev?.detail?.agentId !== props.agentId) return;
      const draft = ev.detail.draft || null;
      const text = String(ev.detail.message || "").trim().slice(0, 4000);
      if (!draft && !text) return;
      ensureSession();
      openChat(true);
      if (draft) {
        drafts.value.push({ id: Date.now() + Math.floor(Math.random() * 1000), label: String(draft.label || "题目").slice(0, 20), content: String(draft.content || "").slice(0, 4000) });
      } else {
        msg.value = text;
        if (inputEl.value) inputEl.value.textContent = text;
      }
      nextTick(() => { inputEl.value?.focus(); autoResize(); scrollLog(); });
    }
    function onResize() { vw.value = window.innerWidth; vh.value = window.innerHeight; }
    function onHashChange() {
      // 换页面时收起对话框：它是 fixed 面板，留着会盖住新页面的内容
      if (open.value) { open.value = false; stopSpeech(); }
    }

    onMounted(() => {
      window.addEventListener("zg:toggle-chat", onToggleChat);
      window.addEventListener("zg:chat-opened", onOtherChat);
      window.addEventListener("zg:agent-message", onAgentMessage);
      window.addEventListener("zg:agent-bubble", onAgentBubble);
      window.addEventListener("resize", onResize);
      window.addEventListener("hashchange", onHashChange);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("zg:toggle-chat", onToggleChat);
      window.removeEventListener("zg:chat-opened", onOtherChat);
      window.removeEventListener("zg:agent-message", onAgentMessage);
      window.removeEventListener("zg:agent-bubble", onAgentBubble);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("hashchange", onHashChange);
      clearTimeout(bubbleTimer);
      stopSpeech();
    });

    return () => [
      bubbleVisible.value
        ? h("div", {
            class: "agent-bubble-pop",
            style: { left: Math.max(8, pos.value.x) + "px", top: Math.max(8, pos.value.y - 62) + "px" },
            role: "status",
          }, [
            h("strong", null, "【" + props.name + "】"),
            h("span", null, bubbleText.value),
            h("i", { class: "agent-bubble-tail" }),
          ])
        : null,
      h("button", {
        class: "agent-chip" + (open.value ? " on" : ""),
        style: { left: pos.value.x + "px", top: pos.value.y + "px" },
        onMousedown: startDrag,
        title: props.name + " · " + props.role + "（单击对话，再点收起，按住拖动）",
        "aria-expanded": open.value ? "true" : "false",
      }, [
        props.icon
          ? h("i", { class: "agent-chip-icon", "aria-hidden": "true" }, props.icon)
          : h("img", { src: props.avatar, alt: props.name, draggable: false }),
        h("span", props.name + "·" + (ROLE_SHORT[props.role] || props.role)),
      ]),
      open.value
        ? h("div", {
            class: "companion-chat agent-chat",
            style: panelStyle.value,
            role: "dialog",
            "aria-label": props.name + " 的对话",
            onKeydown: (e: KeyboardEvent) => { if (e.key === "Escape") open.value = false; },
          }, [
            h("header", { class: "companion-head" }, [
              h("span", null, props.name + " · " + props.role),
              h("div", { class: "agent-head-tools" }, [
                h("button", { title: "选择历史会话", onClick: () => (sessionMenu.value = !sessionMenu.value) }, "会话"),
                h("button", { title: "开始新会话", onClick: newSession }, "＋"),
                h("button", {
                  class: "agent-voice-btn" + (voiceOn.value ? " on" : ""),
                  title: voiceOn.value ? "回复自动朗读，点击静音" : "已静音，点击恢复自动朗读",
                  onClick: () => setVoiceOn(!voiceOn.value),
                }, voiceOn.value ? "🔊 自动" : "🔇 静音"),
                h("button", { title: "收起对话", onClick: () => { open.value = false; stopSpeech(); } }, "×"),
              ]),
            ]),
            sessionMenu.value
              ? h("div", { class: "agent-session-menu" }, [
                  h("div", { class: "agent-session-title" }, "历史会话"),
                  ...sessions.value.map((s) => h("div", {
                    class: "agent-session-item" + (s.id === activeSession.value ? " on" : ""),
                  }, [
                    h("button", {
                      class: "agent-session-open",
                      onClick: () => switchSession(s.id),
                    }, [
                      h("strong", null, s.title || "新会话"),
                      h("small", null, new Date(s.updatedAt || Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })),
                    ]),
                    h("button", {
                      class: "agent-session-del",
                      title: "删除会话",
                      "aria-label": "删除会话 " + (s.title || "新会话"),
                      onClick: (e: Event) => { e.stopPropagation(); deleteSession(s.id); },
                    }, "×"),
                  ])),
                ])
              : null,
            h("div", { class: "companion-log", ref: logEl }, [
              ...log.value.map((x, i) => h("p", { class: "companion-bubble " + (x.role === "me" ? "me" : "ai"), key: i }, [
                x.image ? h("img", { class: "agent-bubble-img", src: x.image, alt: "附图" }) : null,
                h("span", null, x.text),
              ])),
              busy.value ? h("p", { class: "companion-bubble ai agent-typing" }, "正在想…") : null,
            ]),
            tutorSteps.value.length || tutorScene.value
              ? h("button", {
                  class: "agent-tutor-entry",
                  onClick: () => (tutorOpen.value = true),
                }, "讲题画布 · " + (tutorSteps.value.length ? "第 " + (tutorStep.value + 1) + "/" + tutorSteps.value.length + " 步" : "打开") + " · 展开")
              : null,
            pageHtml.value
              ? h("button", {
                  class: "agent-page-entry",
                  onClick: () => (pageOpen.value = true),
                }, "AI 页面 · " + pageTitle.value + " · 打开")
              : null,
            err.value ? h("p", { class: "companion-error" }, err.value) : null,
            memPct.value >= 0.8 && !memDismissed.value
              ? h("div", { class: "agent-mem-warn" }, [
                  h("span", { title: "本地记忆保留 " + MEMORY_TTL_DAYS + " 天；上传后服务器保留 30 天" },
                    "🧠 本地记忆已用 " + Math.round(memPct.value * 100) + "%，" + props.name + " 建议上传或清空"),
                  h("div", null, [
                    h("button", { disabled: memBusy.value, onClick: () => void uploadMemory() }, memBusy.value ? "上传中…" : "上传并清空"),
                    h("button", { onClick: clearLocalMemory }, "仅清空"),
                    h("button", { onClick: () => (memDismissed.value = true) }, "稍后"),
                  ]),
                ])
              : null,
            pendingDoc.value
              ? h("div", { class: "agent-img-preview" }, [
                  h("span", null, "📄 " + pendingDoc.value.name + " · " + Math.ceil(pendingDoc.value.chars / 1000) + "k 字"),
                  h("button", { title: "移除文件", onClick: () => (pendingDoc.value = null) }, "×"),
                ])
              : null,
            pendingImage.value
              ? h("div", { class: "agent-img-preview" }, [
                  h("img", { src: pendingImage.value, alt: "待发送图片" }),
                  h("span", null, "图片已附上"),
                  h("button", { title: "移除图片", onClick: () => (pendingImage.value = "") }, "×"),
                ])
              : null,
            drafts.value.length
              ? h("div", { class: "agent-drafts" }, drafts.value.map((d) =>
                  h("span", { class: "agent-draft", title: d.content, key: d.id }, [
                    d.label,
                    h("button", {
                      title: "移除",
                      onClick: () => { drafts.value = drafts.value.filter((x) => x.id !== d.id); persistActive(); },
                    }, "×"),
                  ]),
                ))
              : null,
            h("div", { class: "agent-composer", onPaste }, [
              h("div", { class: "agent-input-row" }, [
                h("div", {
                  ref: inputEl,
                  class: "agent-input",
                  contenteditable: "true",
                  "data-placeholder": busy.value ? "我想想…" : "问我点什么，Shift+Enter 换行",
                  onInput,
                  onKeydown: (e: KeyboardEvent) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  },
                  onPaste,
                }),
              ]),
              h("div", { class: "agent-composer-tools" }, [
                h("label", { class: "agent-attach", title: "发图 / 粘贴截图（Ctrl+V）" }, [
                  "📎",
                  h("input", {
                    type: "file", accept: "image/*", style: { display: "none" },
                    onChange: (e: Event) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) void attachImage(f);
                      (e.target as HTMLInputElement).value = "";
                    },
                  }),
                ]),
                h("label", { class: "agent-attach", title: "上传 PDF/Word/Excel/PPT" }, [
                  "📄",
                  h("input", {
                    type: "file", accept: ".pdf,.docx,.xlsx,.pptx", style: { display: "none" },
                    onChange: (e: Event) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) void attachDoc(f);
                      (e.target as HTMLInputElement).value = "";
                    },
                  }),
                ]),
                h("button", { class: "companion-mic" + (listening.value ? " on" : ""), title: "语音输入", onClick: toggleAsr }, listening.value ? "●" : "🎤"),
                h("button", { class: "agent-send", disabled: busy.value, onClick: () => void send() }, "发送"),
              ]),
            ]),
          ])
        : null,
      tutorOpen.value
        ? h("div", { class: "agent-tutor-overlay", role: "dialog", "aria-modal": "true", "aria-label": props.name + " 的讲题画布" }, [
            h("div", { class: "agent-tutor-window" }, [
              h("header", { class: "agent-tutor-window-head" }, [
                h("div", null, [
                  h("strong", null, "讲题画布 · " + props.name),
                  h("span", null, "第 " + (tutorStep.value + 1) + " / " + Math.max(1, tutorSteps.value.length) + " 步"),
                ]),
                h("button", {
                  class: "agent-tutor-min",
                  title: "最小化到对话框",
                  onClick: () => (tutorOpen.value = false),
                }, "−"),
              ]),
              h("div", { class: "agent-tutor-window-body" }, [
                h("canvas", { ref: tutorBoard, class: "agent-tutor-board" }),
                h("ol", { class: "agent-tutor-steps" }, visibleTutorSteps.value.map((s: any, i: number) => h("li", { key: i }, String(s?.text || "")))),
                tutorStep.value + 1 < tutorSteps.value.length
                  ? h("button", { class: "agent-tutor-next", onClick: () => (tutorStep.value += 1) }, "懂了，继续")
                  : null,
                tutorScene.value
                  ? h("div", { class: "agent-tutor-3d" }, [
                      h("div", { class: "agent-tutor-head" }, [h("strong", null, "3D 演示 · " + (tutorScene.value.text || tutorScene.value.shape || "模型"))]),
                      h("div", { ref: tutorHost, class: "agent-tutor-3d-host" }),
                    ])
                  : null,
              ]),
            ]),
          ])
        : null,
      pageOpen.value
        ? h("div", { class: "agent-page-overlay", role: "dialog", "aria-modal": "true", "aria-label": pageTitle.value }, [
            h("div", { class: "agent-page-window" }, [
              h("header", { class: "agent-page-head" }, [
                h("div", null, [h("strong", null, pageTitle.value || "AI 自定义页面"), h("span", null, "AI 网页 · " + props.name)]),
                h("div", { class: "agent-page-actions" }, [
                  pageId.value
                    ? h("button", { title: "在新窗口打开", onClick: () => window.open("/orig/#/ai-page/" + pageId.value, "_blank", "noopener") }, "↗")
                    : null,
                  h("button", { class: "agent-page-min", title: "最小化到对话框", onClick: () => (pageOpen.value = false) }, "−"),
                ]),
              ]),
              h("iframe", { class: "agent-page-frame", srcdoc: pageHtml.value, sandbox: "", title: pageTitle.value }),
            ]),
          ])
        : null,
    ];
  },
});
