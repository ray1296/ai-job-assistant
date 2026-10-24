import { defineComponent, h, ref, computed, onMounted } from "vue";
import { api, errorText } from "./api";
import ThreeView from "./three-view";

type Q = {
  id: string; type: "single" | "judge" | "short" | "blank";
  stem: string; options: string[]; answer: string; analysis: string;
  simpleAnswer: string; source: string; tags: string[]; attemptCount?: number;
};

const TYPE_LABEL: Record<string, string> = { single: "选择题", judge: "判断题", short: "简答题", blank: "完形填空" };

export default defineComponent({
  setup() {
    const subjects = ref<any[]>([]);
    const directions = ref<any[]>([]);
    const loading = ref(true);
    const error = ref("");
    const notice = ref("");
    const busy = ref(false);

    // 当前刷题状态
    const version = ref<any>(null);
    const questions = ref<Q[]>([]);
    const typeFilter = ref<"" | "single" | "judge" | "short" | "blank">("");
    const idx = ref(0);
    const picked = ref("");
    const revealed = ref(false);
    const flipped = ref(false);
    const answered = ref(0);
    const correctCount = ref(0);
    const drawerOpen = ref(false);
    const tutorOpen = ref(false);
    const tutorText = ref("");
    const tutorSteps = ref<any[]>([]);
    const tutorNeedCanvas = ref(false);
    const tutorNeed3d = ref(false);
    const tutorInput = ref("");
    const tutorStepIdx = ref(0);
    const tutorAllSteps = ref<any[]>([]);
    const tutorWaiting = ref(false);
    const tutorBusy = ref(false);
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    const autoPlay = ref(true);
    const speakOn = ref(true);
    const threeSpec = ref<any>(null);

    // 上传/新建弹窗
    const dialog = ref<"" | "subject" | "version">("");
    const formName = ref("");
    const formDirection = ref("");
    const formFile = ref<File | null>(null);
    const dialogSubjectId = ref("");

    const flash = (msg: string) => {
      notice.value = msg;
      window.setTimeout(() => { if (notice.value === msg) notice.value = ""; }, 4000);
    };

    async function loadSubjects() {
      loading.value = true; error.value = "";
      try {
        const r = await api<any>("/study/subjects", "GET", undefined, { timeoutMs: 30000 });
        subjects.value = r.subjects || [];
        directions.value = r.directions || [];
        if (!formDirection.value && directions.value[0]) formDirection.value = directions.value[0].name;
      } catch (e) { error.value = errorText(e); }
      finally { loading.value = false; }
    }
    onMounted(loadSubjects);

    function openSubjectDialog() { formName.value = ""; dialog.value = "subject"; error.value = ""; }
    async function createSubject() {
      if (busy.value) return;
      busy.value = true;
      try {
        await api("/study/subjects", "POST", { name: formName.value }, { timeoutMs: 20000 });
        dialog.value = ""; await loadSubjects(); flash("科目已创建");
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function renameSubject(s: any) {
      const name = window.prompt("新的科目名称", s.name);
      if (!name || name === s.name) return;
      try { await api("/study/subjects/" + s.id, "PUT", { name }, { timeoutMs: 20000 }); await loadSubjects(); flash("已重命名"); }
      catch (e) { error.value = errorText(e); }
    }
    async function deleteSubject(s: any) {
      if (!window.confirm("删除科目「" + s.name + "」以及它下面的所有版本？")) return;
      try { await api("/study/subjects/" + s.id, "DELETE", undefined, { timeoutMs: 20000 }); await loadSubjects(); flash("已删除"); }
      catch (e) { error.value = errorText(e); }
    }
    function openVersionDialog(subjectId: string) {
      dialogSubjectId.value = subjectId; formName.value = ""; formFile.value = null; dialog.value = "version"; error.value = "";
    }
    async function createVersion() {
      if (busy.value) return;
      busy.value = true;
      try {
        let payload: any = { name: formName.value || ("版本 " + new Date().toLocaleDateString("zh-CN")) };
        if (formFile.value) {
          const text = await formFile.value.text();
          const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const qs = lines.map((l) => {
            const parts = l.split(/\t|\|/);
            if (parts.length >= 2) return { type: "short", stem: parts[0], answer: parts.slice(1).join(" ") };
            return { type: "short", stem: l, answer: "" };
          }).filter((q) => q.stem.length > 1);
          if (!qs.length) throw new Error("文件里没有识别到题目（每行一题，可用 Tab 或 | 分隔题目与答案）");
          payload.questions = qs;
          payload.source = "上传文件 " + formFile.value.name;
        } else {
          payload.fromCatalog = formDirection.value;
          payload.limit = 120;
          payload.source = "平台面经题库 · " + formDirection.value;
        }
        await api("/study/subjects/" + dialogSubjectId.value + "/versions", "POST", payload, { timeoutMs: 60000 });
        dialog.value = ""; await loadSubjects(); flash("版本已导入");
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function renameVersion(v: any) {
      const name = window.prompt("新的版本名称", v.name);
      if (!name || name === v.name) return;
      try { await api("/study/versions/" + v.id, "PUT", { name }, { timeoutMs: 20000 }); await loadSubjects(); flash("已重命名"); }
      catch (e) { error.value = errorText(e); }
    }
    async function deleteVersion(v: any) {
      if (!window.confirm("删除版本「" + v.name + "」及其题目？")) return;
      try { await api("/study/versions/" + v.id, "DELETE", undefined, { timeoutMs: 20000 }); await loadSubjects(); flash("已删除"); }
      catch (e) { error.value = errorText(e); }
    }

    async function openVersion(v: any) {
      busy.value = true; error.value = "";
      try {
        const r = await api<any>("/study/versions/" + v.id + "/questions", "GET", undefined, { timeoutMs: 30000 });
        version.value = r.version;
        questions.value = r.questions || [];
        idx.value = 0; picked.value = ""; revealed.value = false; flipped.value = false;
        answered.value = 0; correctCount.value = 0;
        typeFilter.value = "";
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    function closeVersion() { version.value = null; questions.value = []; tutorOpen.value = false; closeDrawer(); }

    const filtered = computed(() => typeFilter.value ? questions.value.filter((q) => q.type === typeFilter.value) : questions.value);
    const current = computed(() => filtered.value[idx.value] || null);
    const isChoice = computed(() => current.value?.type === "single" || current.value?.type === "judge");
    const progress = computed(() => filtered.value.length ? Math.round(((idx.value + 1) / filtered.value.length) * 100) : 0);

    function choose(opt: string) {
      if (!current.value || revealed.value) return;
      picked.value = opt;
      revealed.value = true;
      answered.value += 1;
      const ok = opt === current.value.answer;
      if (ok) correctCount.value += 1;
      void api("/study/questions/" + current.value.id + "/attempt", "POST", { correct: ok }, { timeoutMs: 15000 }).catch(() => {});
    }
    function next() {
      if (idx.value + 1 < filtered.value.length) {
        idx.value += 1; picked.value = ""; revealed.value = false; flipped.value = false;
      }
    }
    function prev() {
      if (idx.value > 0) { idx.value -= 1; picked.value = ""; revealed.value = false; flipped.value = false; }
    }

    async function simplifyCurrent() {
      if (!current.value || busy.value) return;
      busy.value = true;
      try {
        const r = await api<any>("/study/questions/" + current.value.id + "/simplify", "POST", {}, { timeoutMs: 150000 });
        current.value.simpleAnswer = r.simpleAnswer;
        const q = questions.value.find((x) => x.id === current.value!.id);
        if (q) q.simpleAnswer = r.simpleAnswer;
        flash("已生成简化答案");
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function simplifyAll() {
      if (busy.value || !version.value) return;
      const todo = questions.value.filter((q) => !q.simpleAnswer).slice(0, 8);
      if (!todo.length) { flash("所有题目都已经有简化答案了"); return; }
      busy.value = true;
      try {
        for (const q of todo) {
          const r = await api<any>("/study/questions/" + q.id + "/simplify", "POST", {}, { timeoutMs: 150000 });
          q.simpleAnswer = r.simpleAnswer;
        }
        flash("已为 " + todo.length + " 道题生成简化答案（每次最多 8 道）");
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function generate(kind: "single" | "judge") {
      if (busy.value || !version.value) return;
      busy.value = true;
      try {
        const r = await api<any>("/study/versions/" + version.value.id + "/generate", "POST", { kind, count: 5 }, { timeoutMs: 180000 });
        await openVersion({ ...version.value });
        await loadSubjects();
        flash("已向当前版本追加 " + r.appended + " 道" + (kind === "single" ? "选择题" : "判断题"));
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }

    async function askTutor(message = "") {
      if (!current.value || tutorBusy.value) return;
      tutorBusy.value = true; tutorOpen.value = true;
      try {
        const r = await api<any>("/study/tutor", "POST", {
          questionId: current.value.id, message,
        }, { timeoutMs: 180000 });
        tutorText.value = r.reply || "";
        tutorAllSteps.value = r.steps || [];
        tutorStepIdx.value = 0;
        tutorSteps.value = tutorAllSteps.value.slice(0, 1);
        tutorWaiting.value = tutorAllSteps.value.length > 1;
        tutorNeedCanvas.value = !!r.needCanvas || tutorSteps.value.length > 0;
        tutorNeed3d.value = !!r.need3d;
        if (r.scene) threeSpec.value = r.scene;
        if (tutorNeedCanvas.value) openDrawer();
        else speak(tutorText.value);
      } catch (e) { error.value = errorText(e); }
      finally { tutorBusy.value = false; }
    }

    function nextTutorStep() {
      if (tutorStepIdx.value + 1 >= tutorAllSteps.value.length) {
        tutorWaiting.value = false;
        tutorSteps.value = tutorAllSteps.value;
        speak("这一步就讲完了，还有哪里不懂可以直接问我。");
        return;
      }
      tutorStepIdx.value += 1;
      tutorSteps.value = tutorAllSteps.value.slice(0, tutorStepIdx.value + 1);
      tutorWaiting.value = tutorStepIdx.value + 1 < tutorAllSteps.value.length;
      if (drawerOpen.value) openDrawer();
      speak(tutorAllSteps.value[tutorStepIdx.value]?.text || "");
    }

    function speak(text: string) {
      if (!speakOn.value || !text || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text.slice(0, 200));
        u.lang = "zh-CN"; u.rate = 1.02;
        window.speechSynthesis.speak(u);
      } catch {}
    }

    // 白板：按步骤把文字写到画布上，配上简单图形
    let raf = 0;
    function openDrawer() {
      drawerOpen.value = true;
      const run = () => {
        const cv = canvasRef.value;
        if (!cv) { raf = requestAnimationFrame(run); return; }
        cancelAnimationFrame(raf);
        drawSteps(cv, tutorSteps.value, tutorText.value);
      };
      raf = requestAnimationFrame(run);
      if (tutorText.value) speak(tutorText.value);
    }
    function closeDrawer() { drawerOpen.value = false; cancelAnimationFrame(raf); }
    function drawSteps(cv: HTMLCanvasElement, steps: any[], reply: string) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth, h2 = cv.clientHeight;
      cv.width = w * dpr; cv.height = h2 * dpr;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h2);
      ctx.fillStyle = "#fffdf8"; ctx.fillRect(0, 0, w, h2);
      let y = 34;
      const items = steps.length ? steps : [{ text: reply, draw: "text" }];
      let i = 0;
      const drawOne = () => {
        if (i >= items.length) {
          if (tutorNeed3d.value) draw3d(ctx, w, h2);
          return;
        }
        const st = items[i++];
        ctx.font = "500 15px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#3f3353";
        const maxW = w - 60;
        const words = String(st.text).split("");
        let line = "";
        for (const ch of words) {
          if (ctx.measureText(line + ch).width > maxW) {
            ctx.fillText(line, 30, y); y += 24; line = ch;
          } else line += ch;
        }
        if (line) { ctx.fillText(line, 30, y); y += 24; }
        if (st.draw !== "text" && y < h2 - 40) { drawShape(ctx, st.draw, 40, y, w, h2); y += 70; }
        if (y > h2 - 40) { y = 34; }
        if (autoPlay.value) setTimeout(drawOne, 320);
      };
      drawOne();
    }
    function drawShape(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, w: number, h2: number) {
      ctx.strokeStyle = "#7460c9"; ctx.lineWidth = 2;
      if (kind === "line" || kind === "arrow") {
        ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.lineTo(x + 180, y + 30); ctx.stroke();
        if (kind === "arrow") { ctx.beginPath(); ctx.moveTo(x + 180, y + 30); ctx.lineTo(x + 168, y + 24); ctx.lineTo(x + 168, y + 36); ctx.closePath(); ctx.fill(); }
      } else if (kind === "circle") {
        ctx.beginPath(); ctx.arc(x + 40, y + 24, 26, 0, Math.PI * 2); ctx.stroke();
      } else if (kind === "box") {
        ctx.strokeRect(x, y + 4, 90, 52);
      }
    }
    function draw3d(ctx: CanvasRenderingContext2D, w: number, h2: number) {
      const cx = w - 150, cy = h2 - 120, r = 60;
      let t = 0;
      const loop = () => {
        if (!drawerOpen.value) return;
        ctx.save();
        ctx.fillStyle = "rgba(255,253,248,.85)"; ctx.fillRect(cx - r - 20, cy - r - 20, r * 2 + 40, r * 2 + 40);
        ctx.strokeStyle = "#2f9e8f"; ctx.lineWidth = 1.5;
        const pts: [number, number][] = [];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t;
          pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.42]);
        }
        for (const [px, py] of pts) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + px, cy + py); ctx.stroke(); }
        ctx.beginPath();
        pts.forEach(([px, py], i2) => { const X = cx + px, Y = cy + py; if (!i2) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
        ctx.closePath(); ctx.stroke();
        ctx.restore();
        t += 0.02;
        requestAnimationFrame(loop);
      };
      loop();
    }

    // ---------- 渲染 ----------
    const subjectCard = (s: any) =>
      h("article", { class: "card study-subject" }, [
        h("header", { class: "study-subject-head" }, [
          h("h2", s.name),
          h("div", { class: "study-actions" }, [
            s.isSystem
              ? h("span", { class: "study-badge" }, "平台题库")
              : h("button", { class: "btn small", onClick: () => void renameSubject(s) }, "重命名"),
            s.isSystem ? null : h("button", { class: "btn small", onClick: () => void deleteSubject(s) }, "删除"),
            h("button", { class: "btn small primary", onClick: () => openVersionDialog(s.id) }, "＋ 版本"),
          ]),
        ]),
        s.versions.length
          ? h("div", { class: "study-versions" }, s.versions.map((v: any) =>
              h("div", { class: "study-version" }, [
                h("button", { class: "study-version-open", onClick: () => void openVersion(v) }, [
                  h("strong", v.name),
                  h("small", v.total + " 道题"),
                ]),
                v.isSystem
                  ? h("span", { class: "study-badge" }, "只读")
                  : h("div", { class: "study-actions" }, [
                      h("button", { class: "btn small", onClick: () => void renameVersion(v) }, "改名"),
                      h("button", { class: "btn small", onClick: () => void deleteVersion(v) }, "删除"),
                    ]),
              ])))
          : h("p", { class: "muted" }, "还没有版本，点右上角「＋ 版本」导入题库。"),
      ]);

    const dialogBox = () =>
      h("div", { class: "modal-backdrop", onClick: (e: Event) => { if (e.target === e.currentTarget) dialog.value = ""; } }, [
        h("div", { class: "modal card" }, dialog.value === "subject" ? [
          h("h2", "新建科目"),
          h("input", { class: "map-input", placeholder: "例如：Java 后端春招", value: formName.value, onInput: (e: Event) => (formName.value = (e.target as HTMLInputElement).value) }),
          h("div", { class: "modal-actions" }, [
            h("button", { class: "btn", onClick: () => (dialog.value = "") }, "取消"),
            h("button", { class: "btn primary", disabled: busy.value, onClick: () => void createSubject() }, "创建"),
          ]),
        ] : [
          h("h2", "导入题库版本"),
          h("input", { class: "map-input", placeholder: "版本名，例如：第一次模拟", value: formName.value, onInput: (e: Event) => (formName.value = (e.target as HTMLInputElement).value) }),
          h("p", { class: "muted" }, "① 从平台面经题库导入："),
          h("select", { class: "map-input", value: formDirection.value, onChange: (e: Event) => (formDirection.value = (e.target as HTMLSelectElement).value) },
            directions.value.map((d) => h("option", { value: d.name }, d.name + "（" + d.count + " 题）"))),
          h("p", { class: "muted" }, "② 或上传自己的题库（每行一题，题目与答案用 Tab 或 | 分隔）："),
          h("input", {
            type: "file", accept: ".txt,.csv,.md",
            onChange: (e: Event) => { formFile.value = (e.target as HTMLInputElement).files?.[0] || null; },
          }),
          h("div", { class: "modal-actions" }, [
            h("button", { class: "btn", onClick: () => (dialog.value = "") }, "取消"),
            h("button", { class: "btn primary", disabled: busy.value, onClick: () => void createVersion() }, "导入"),
          ]),
        ]),
      ]);

    const practiceView = () => {
      const q = current.value!;
      const body: any[] = [];
      body.push(h("header", { class: "study-practice-head" }, [
        h("button", { class: "btn small", onClick: closeVersion }, "← 返回科目"),
        h("div", [h("strong", version.value?.name || ""), h("small", " " + (idx.value + 1) + " / " + filtered.value.length + " · 正确 " + correctCount.value + "/" + answered.value)]),
        h("div", { class: "study-actions" }, [
          h("button", { class: "btn small", disabled: busy.value, onClick: () => void simplifyCurrent() }, "✦ 简化答案"),
          h("button", { class: "btn small", disabled: busy.value, onClick: () => void simplifyAll() }, "✦ 批量简化"),
          h("button", { class: "btn small", disabled: busy.value, onClick: () => void generate("single") }, "✦ 生成选择题"),
          h("button", { class: "btn small", disabled: busy.value, onClick: () => void generate("judge") }, "✦ 生成判断题"),
        ]),
      ]));
      body.push(h("div", { class: "study-filter" }, [["", "全部"], ["single", "选择题"], ["judge", "判断题"], ["short", "简答题"], ["blank", "完形填空"]]
        .map(([v, t]) => h("button", {
          class: "btn small" + (typeFilter.value === v ? " primary" : ""),
          onClick: () => { typeFilter.value = v as any; idx.value = 0; revealed.value = false; picked.value = ""; flipped.value = false; },
        }, t + "（" + (v ? questions.value.filter((x) => x.type === v).length : questions.value.length) + "）"))));

      if (!current.value) {
        body.push(h("p", { class: "muted" }, "这个分类下还没有题目。"));
        return h("div", { class: "study-practice" }, body);
      }

      body.push(h("div", { class: "study-progress" }, [h("div", { class: "study-progress-bar", style: { width: progress.value + "%" } })]));
      body.push(h("section", { class: "card study-question" }, [
        h("div", { class: "study-tags" }, [h("span", TYPE_LABEL[q.type] || q.type), ...(q.tags || []).slice(0, 3).map((t: string) => h("span", t))]),
        h("h2", q.stem),
        q.type === "short" || q.type === "blank"
          ? h("div", {
              class: "study-card" + (flipped.value ? " flipped" : ""),
              onClick: () => (flipped.value = !flipped.value),
            }, [
              h("small", { class: "study-card-hint" }, flipped.value ? "点击回到提示" : "先自己回答，点这张卡片看答案"),
              flipped.value
                ? h("div", { class: "study-card-body" }, [
                    h("small", q.simpleAnswer ? "简化答案（AI）" : "参考答案"),
                    h("p", { class: "study-card-answer" }, q.simpleAnswer || q.answer || "暂无答案"),
                    q.simpleAnswer && q.answer ? h("details", null, [h("summary", "展开完整答案"), h("p", q.answer)]) : null,
                  ])
                : h("div", { class: "study-card-body" }, [
                    h("p", { class: "study-card-prompt" }, q.type === "blank" ? "先想一下这个空该填什么，再翻面看答案。" : "先自己组织语言回答，再翻面比对要点。"),
                  ]),
            ])
          : h("div", { class: "study-options" }, (q.options || []).map((o: string) =>
              h("button", {
                class: "study-option" +
                  (revealed.value && o === q.answer ? " correct" : "") +
                  (revealed.value && o === picked.value && o !== q.answer ? " wrong" : ""),
                disabled: revealed.value,
                onClick: () => choose(o),
              }, o))),
        revealed.value && isChoice.value
          ? h("p", { class: "study-feedback" + (picked.value === q.answer ? " ok" : " bad") },
              (picked.value === q.answer ? "✓ 答对了" : "✗ 正确答案是：" + q.answer) + (q.analysis ? " · " + q.analysis : ""))
          : null,
        h("div", { class: "study-q-actions" }, [
          h("button", { class: "btn", onClick: prev, disabled: idx.value === 0 }, "上一题"),
          h("button", { class: "btn primary", onClick: next, disabled: idx.value + 1 >= filtered.value.length }, "下一题"),
          h("button", { class: "btn", onClick: () => void askTutor() }, "✦ 让看板娘讲题"),
          h("button", { class: "btn", onClick: () => void askTutor("请用 3D 模型演示这个知识点") }, "▣ 3D 演示"),
        ]),
      ]));
      return h("div", { class: "study-practice" }, body);
    };

    const tutorPanel = () =>
      tutorOpen.value
        ? h("aside", { class: "tutor-panel" }, [
            h("header", { class: "tutor-head" }, [
              h("span", "✦ 小光老师"),
              h("button", { class: "btn small", onClick: () => { tutorOpen.value = false; window.speechSynthesis?.cancel(); } }, "×"),
            ]),
            h("div", { class: "tutor-body" }, [
              h("p", { class: "tutor-bubble" }, tutorBusy.value ? "让我想想……" : tutorText.value || "点「让看板娘讲题」，我一步一步给你讲。"),
              tutorSteps.value.length
                ? h("ol", { class: "tutor-steps" }, tutorSteps.value.map((st: any, i: number) =>
                    h("li", { key: i }, st.text)))
                : null,
              tutorWaiting.value
                ? h("button", { class: "btn small primary", onClick: nextTutorStep }, "懂了，继续")
                : null,
              tutorNeedCanvas.value ? h("button", { class: "btn small", onClick: openDrawer }, "▣ 打开白板") : null,
            ]),
            h("div", { class: "tutor-input" }, [
              h("input", {
                placeholder: "追问点什么，比如：为什么不是 B？",
                value: tutorInput.value,
                onInput: (e: Event) => (tutorInput.value = (e.target as HTMLInputElement).value),
                onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter" && tutorInput.value.trim()) { const m = tutorInput.value; tutorInput.value = ""; void askTutor(m); } },
              }),
              h("button", { class: "btn primary small", onClick: () => { const m = tutorInput.value; tutorInput.value = ""; void askTutor(m); } }, "发送"),
            ]),
          ])
        : null;

    const drawer = () =>
      drawerOpen.value
        ? h("div", { class: "whiteboard" }, [
            h("header", { class: "whiteboard-head" }, [
              h("strong", "白板 · " + (current.value?.stem.slice(0, 30) || "")),
              h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [
                h("label", { class: "map-check" }, [
                  h("input", { type: "checkbox", checked: speakOn.value, onChange: (e: Event) => (speakOn.value = (e.target as HTMLInputElement).checked) }),
                  "语音",
                ]),
                h("button", { class: "btn small", onClick: () => { if (current.value) void askTutor("再讲一遍，换个说法"); } }, "重讲"),
                h("button", { class: "btn small", onClick: closeDrawer }, "×"),
              ]),
            ]),
            h("canvas", { ref: canvasRef, class: "whiteboard-canvas" }),
          ])
        : null;

    return () =>
      h("div", { class: "study-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "LEARN · PRACTICE · REPEAT"),
          h("h1", "学习与刷题"),
          h("p", "把面经变成你的题库：导入 → 刷题 → 卡片记忆 → 让 AI 讲明白"),
        ]),
        version.value ? null : h("div", { class: "toolbar" }, [
          h("button", { class: "btn primary", onClick: openSubjectDialog }, "＋ 新建科目"),
          h("a", { class: "btn", href: "#study-upload" }, "⬆ 上传题库"),
          h("button", { class: "btn", onClick: () => void loadSubjects() }, "刷新"),
        ]),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
        notice.value ? h("p", { class: "notice", role: "status" }, notice.value) : null,

        version.value
          ? practiceView()
          : loading.value
            ? h("p", { role: "status" }, "正在读取题库…")
            : subjects.value.length
              ? h("div", { class: "study-subjects" }, subjects.value.map(subjectCard))
              : h("section", { class: "card empty" }, [
                  h("h2", "还没有题库"),
                  h("p", "新建一个科目，然后从平台面经题库导入，或上传自己的题目文件。"),
                  h("button", { class: "btn primary", onClick: openSubjectDialog }, "开始创建"),
                ]),

        tutorPanel(),
        drawer(),
        threeSpec.value ? h(ThreeView, { spec: threeSpec.value, onClose: () => (threeSpec.value = null) }) : null,
        dialog.value ? dialogBox() : null,
      ]);
  },
});
