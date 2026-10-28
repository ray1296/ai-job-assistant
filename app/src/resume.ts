import { defineComponent, h, ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { api, errorText } from "./api";
import InlineEdit from "./inline-edit";
import ResumeImport from "./resume-import";
import PhotoPicker from "./photo-picker";
import AiReview from "./ai-review";
import {
  blankDocument,
  fromLegacy,
  fromProfile,
  withoutPhotos,
  plainText,
  clone,
  entry,
  uid,
  type Resume,
  type ResumeDocument,
  type Decoration,
  type Section,
  type Entry,
} from "./resume-model";
export default defineComponent({
  props: { onDirty: { type: Function, required: true } },
  setup(props) {
    const versions = ref<Resume[]>([]),
      current = ref<Resume | null>(null),
      doc = ref(blankDocument()),
      title = ref(""),
      busy = ref(false),
      loading = ref(true),
      error = ref(""),
      notice = ref(""),
      dirty = ref(false),
      editing = ref(false),
      editDirty = ref(false),
      undoStack = ref<string[]>([]),
      redoStack = ref<string[]>([]),
      sectionName = ref(""),
      panel = ref(""),
      profilePhotos = ref<string[]>([]),
      decorStyle = ref<"auto" | "minimal" | "maximal" | "tech">("auto"),
      decorBusy = ref(false),
      decorError = ref(""),
      decorations = computed<Decoration[]>(() => doc.value?.decorations || []),
      decorCount = computed(() => (doc.value?.background ? 1 : decorations.value.length)),
      decoration = computed(() => !!doc.value?.background || !!doc.value?.decoration || !!doc.value?.decorationFooter || !!decorations.value.length),
      backgroundSrc = computed(() =>
        doc.value?.background
          ? "/api/decoration-assets/" + doc.value.background.image + ".png"
          : "",
      ),
      // 勾选框只表示"我想让简历带装饰"，真正生成发生在点击 AI 审阅优化时
      decorEnabled = ref(false),
      decorSrc = computed(() =>
        doc.value?.decoration
          ? "/api/decoration-assets/" + doc.value.decoration.image + ".png"
          : "",
      ),
      decorFooterSrc = computed(() =>
        doc.value?.decorationFooter
          ? "/api/decoration-assets/" + doc.value.decorationFooter.image + ".png"
          : "",
      ),
      aiPrompt = ref(""),
      sectionBusy = ref(false),
      sectionError = ref(""),
      layoutBusy = ref(false),
      layoutSuggestion = ref<any>(null),
      summaryOpen = ref(false),
      pagePlan = ref<{ section: Section; items: Entry[]; first: boolean; last: boolean }[][]>([]);
    const aiWorking = computed(() => layoutBusy.value || sectionBusy.value);
    const aiWorkingText = computed(() => layoutBusy.value
      ? "AI 正在阅读简历结构并优化排版，通常需要十几秒…"
      : sectionBusy.value
      ? "AI 正在撰写新板块…"
      : "");
    let paginationBusy = false;
    let saved = "";
    const snapshot = () =>
      JSON.stringify({ title: title.value, document: doc.value });
    function updateDirty() {
      dirty.value = snapshot() !== saved;
      props.onDirty(dirty.value || editDirty.value);
    }
    function change(action: () => void) {
      const old = snapshot();
      action();
      if (old === snapshot()) return;
      undoStack.value.push(old);
      if (undoStack.value.length > 60) undoStack.value.shift();
      redoStack.value = [];
      updateDirty();
    }
    function restore(s: string) {
      const x = JSON.parse(s);
      title.value = x.title;
      doc.value = x.document;
      updateDirty();
    }
    function undo() {
      if (editing.value || !undoStack.value.length) return;
      redoStack.value.push(snapshot());
      restore(undoStack.value.pop()!);
    }
    function redo() {
      if (editing.value || !redoStack.value.length) return;
      undoStack.value.push(snapshot());
      restore(redoStack.value.pop()!);
    }
    function flush() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.isContentEditable) el.blur();
      return !editing.value;
    }
    function canLeave() {
      return (
        (!dirty.value && !editDirty.value) ||
        confirm("当前文档有未保存修改，确认放弃？")
      );
    }
    function install(r: Resume | null) {
      current.value = r;
      title.value = r?.title || "";
      doc.value = r?.body.document
        ? clone(r.body.document)
        : fromLegacy(r?.body.text || "");
      // 已有装饰的版本，开关默认打开
      decorEnabled.value = !!(doc.value.background || doc.value.decoration || doc.value.decorationFooter || doc.value.decorations?.length);
      summaryOpen.value = !!doc.value.header.summary;
      saved = snapshot();
      dirty.value = false;
      editing.value = false;
      editDirty.value = false;
      props.onDirty(false);
      undoStack.value = [];
      redoStack.value = [];
      pagePlan.value = [];
      void recalcPagination();
    }
    async function refresh() {
      versions.value = (await api("/resumes")).resumes;
    }
    async function load(id: string) {
      if (busy.value || !flush() || !canLeave()) return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/resumes/" + id);
        install(r.resume);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    onMounted(async () => {
      try {
        await refresh();
        try {
          const pr = await api<any>("/profile", "GET", undefined, { timeoutMs: 10000 });
          profilePhotos.value = Array.isArray(pr.profile?.photos) ? pr.profile.photos.slice(0, 3) : [];
        } catch {}
        // 投递方案里"打开新标签页查看专属简历"会先写这个 key
        let wanted = "";
        try {
          wanted = localStorage.getItem("zg.resumeOpenId") || "";
          localStorage.removeItem("zg.resumeOpenId");
        } catch {}
        const target = wanted && versions.value.some((v: any) => v.id === wanted)
          ? wanted
          : versions.value[0]?.id;
        if (target) await load(target);
        await recalcPagination();
        // 投递方案生成的定制简历：首次打开时自动做一次 AI 排版 + 生图装饰
        let autoPolishId = "";
        try { autoPolishId = localStorage.getItem("zg.resumeAutoPolish") || ""; } catch {}
        if (target && autoPolishId === target) {
          try { localStorage.removeItem("zg.resumeAutoPolish"); } catch {}
          void autoPolish();
        }
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
        await nextTick();
        await recalcPagination();
      }
    });
    async function create(duplicate = false) {
      if (busy.value || !flush()) return;
      if (!duplicate && !canLeave()) return;
      busy.value = true;
      error.value = "";
      try {
        const document = duplicate ? clone(doc.value) : blankDocument();
        const r = await api("/resumes", "POST", {
          title: duplicate
            ? title.value + " · 副本"
            : "我的简历 · " + (versions.value.length + 1),
          body: { document },
        });
        install(r.resume);
        await refresh();
        notice.value = duplicate
          ? "已复制为独立版本"
          : "空白文档已创建，双击纸张中的文本开始填写";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    let layoutSource = "";
    async function recommendLayout() {
      if (!current.value || layoutBusy.value || !flush()) return;
      layoutBusy.value = true; error.value = ""; layoutSuggestion.value = null;
      const sent = JSON.stringify(doc.value);
      try {
        // 外观建议是独立任务；/ai/resume-layout 只负责"未匹配信息放哪"，输出结构不同。
        const r = await api("/ai/resume-appearance", "POST", { document: withoutPhotos(doc.value), prompt: aiPrompt.value }, { timeoutMs: 150000 });
        if (JSON.stringify(doc.value) !== sent) throw Error("文档已变更，请针对最新内容重新生成布局建议");
        layoutSource = sent; layoutSuggestion.value = r.layout;
        // 推荐结果直接应用，避免用户只看到建议却不知道还要点“应用”，
        // 导致页面继续按旧结构分页。
        applyLayout();
        notice.value = "AI 已自动应用布局并拆分超长条目；不满意可 Ctrl/Cmd+Z 撤销。";
      } catch (e) { error.value = errorText(e); }
      finally { layoutBusy.value = false; }
    }
    function applyLayout() {
      const x = layoutSuggestion.value;
      if (!x || JSON.stringify(doc.value) !== layoutSource) { error.value = "文档已变更，请重新生成布局建议"; return; }
      // 不信任AI输出的取值：越界一律回落到当前值，避免出现 template-undefined。
      const template = ["classic", "compact"].includes(x.template) ? x.template : doc.value.layout.template;
      const fontSize = [13, 14, 15, 16].includes(x.fontSize) ? x.fontSize : doc.value.layout.fontSize;
      const accent = ["purple", "navy", "charcoal"].includes(x.accent) ? x.accent : doc.value.layout.accent;
      change(() => {
        doc.value.layout = { template, fontSize, accent };
        const groups = x.structure?.groups;
        if (Array.isArray(groups) && groups.length) {
          const byId = new Map(doc.value.sections.map((s) => [s.id, s]));
          const next: Section[] = [];
          for (const g of groups) {
            const parts = (Array.isArray(g.ids) ? g.ids : [])
              .map((id: string) => byId.get(id))
              .filter(Boolean) as Section[];
            if (!parts.length) continue;
            if (parts.length === 1) {
              next.push({
                ...parts[0],
                title: g.title || parts[0].title,
                columns: g.columns === 2 ? 2 : undefined,
              });
            } else {
              next.push({
                id: uid(),
                title: g.title || parts.map((s) => s.title).join(" / ").slice(0, 80),
                items: parts.flatMap((s) => s.items),
                columns: g.columns === 2 ? 2 : 1,
              });
            }
          }
          if (next.length) {
            // 简历惯例：基本信息与求职意向应合并为一个短板块；即使 AI 分组保守，
            // 这里也做一次结构归一化，避免两个小板块各占半页。
            const info = next.filter((s) => /基本信息|求职意向|求职意愿/.test(s.title));
            if (info.length) {
              const firstIndex = next.findIndex((s) => info.includes(s));
              const merged = {
                ...next[firstIndex],
                title: info.length > 1 ? "基本信息与求职意向" : "基本信息",
                items: info.flatMap((s) => s.items),
                columns: 2 as const,
              };
              const rest = next.filter((s) => !info.includes(s));
              rest.splice(firstIndex, 0, merged);
              next.splice(0, next.length, ...rest);
            }
            doc.value.sections = next;
            const ids = new Set(next.map((s) => s.id));
            doc.value.pageBreaks = (doc.value.pageBreaks || []).filter((id) => ids.has(id));
          }
        }
      });
      layoutSuggestion.value = null; notice.value = "已应用 AI 布局与外观，请检查后保存";
    }
    async function collectOccupied() {
      await nextTick();
      const page = document.querySelector('.resume-document[data-page="1"]') as HTMLElement | null;
      if (!page) return [];
      const pr = page.getBoundingClientRect();
      if (!pr.width || !pr.height) return [];
      const nodes = page.querySelectorAll(".document-header, .document-header + .inline-field-wrap, .document-section");
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      const seen = new Set<string>();
      for (const node of Array.from(nodes)) {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const box = {
          x: Math.max(0, Math.round(((r.left - pr.left) / pr.width) * 1000) / 1000),
          y: Math.max(0, Math.round(((r.top - pr.top) / pr.height) * 1000) / 1000),
          w: Math.min(1, Math.round((r.width / pr.width) * 1000) / 1000),
          h: Math.min(1, Math.round((r.height / pr.height) * 1000) / 1000),
        };
        const key = [box.x, box.y, box.w, box.h].join(":");
        if (!seen.has(key)) { seen.add(key); boxes.push(box); }
        if (boxes.length >= 24) break;
      }
      return boxes;
    }
    // AI 生成一张整页背景，并根据文字/照片占用区域避开正文。
    async function generateDecoration() {
      if (!current.value || decorBusy.value) return;
      decorBusy.value = true;
      decorError.value = "";
      notice.value = "正在让 AI 读取简历版面并生成整页背景…";
      try {
        const occupied = await collectOccupied();
        const r = await api(
          "/ai/resume-decoration",
          "POST",
          {
            document: withoutPhotos(doc.value),
            style: decorStyle.value,
            slot: "background",
            size: "1024x1536",
            occupied,
            outputFormat: "png",
            accent: doc.value.layout.accent,
          },
          { timeoutMs: 180000 },
        );
        if (!r?.id) throw Error("生图未返回图片");
        change(() => {
          doc.value.background = { image: String(r.id), style: decorStyle.value };
          doc.value.decoration = null;
          doc.value.decorationFooter = null;
          doc.value.decorations = [];
        });
        decorEnabled.value = true;
        notice.value = "已生成整页背景装饰并并入当前草稿；保存后长期保留。";
      } catch (e) {
        decorError.value = errorText(e);
      } finally {
        decorBusy.value = false;
      }
    }
    function clearDecoration() {
      decorError.value = "";
      if (!doc.value.background && !doc.value.decoration && !doc.value.decorationFooter && !(doc.value.decorations || []).length) {
        notice.value = "已关闭生图装饰，简历为白板样式";
        return;
      }
      change(() => {
        doc.value.background = null;
        doc.value.decoration = null;
        doc.value.decorationFooter = null;
        doc.value.decorations = [];
      });
      decorEnabled.value = false;
      notice.value = "已移除生图装饰，简历恢复为白板样式";
    }
    async function autoPolish() {
      if (!current.value) return;
      notice.value = "AI 正在自动排版并生成装饰，请稍候…";
      error.value = "";
      try {
        await recommendLayout();
        if (layoutSuggestion.value) applyLayout();
        await nextTick();
        await generateDecoration();
        await save();
        notice.value = "AI 已自动完成排版优化并加入生图装饰。";
      } catch (e) {
        error.value = "自动排版/装饰失败：" + errorText(e) + "；你仍可手动调整后导出。";
      } finally {
        try { localStorage.removeItem("zg.resumeAutoPolish"); } catch {}
      }
    }
    async function save() {
      if (!current.value || busy.value || !flush()) return;
      busy.value = true;
      error.value = "";
      notice.value = "";
      const sent = snapshot(),
        id = current.value.id;
      try {
        const r = await api("/resumes/" + id, "PUT", {
          title: title.value,
          body: { document: doc.value },
          revision: current.value.revision,
        });
        current.value = r.resume;
        saved = sent;
        updateDirty();
        await refresh();
        notice.value = dirty.value
          ? "上一稿已保存，保存期间的新修改仍待保存"
          : "当前版本已保存";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function remove() {
      if (
        !current.value ||
        busy.value ||
        !flush() ||
        !confirm("删除当前版本？此操作不可撤销。未保存修改也会删除。")
      )
        return;
      busy.value = true;
      error.value = "";
      try {
        await api("/resumes/" + current.value.id, "DELETE", {
          revision: current.value.revision,
        });
        install(null);
        await refresh();
        if (versions.value.length)
          install((await api("/resumes/" + versions.value[0].id)).resume);
        notice.value = "该版本已删除";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function importProfile() {
      if (busy.value || !flush()) return;
      if (
        plainText(doc.value)
          .replace(/教育经历|掌握技能|项目经历|实习与工作经历|荣誉与证书/g, "")
          .trim() &&
        !confirm(
          "从已保存的个人信息重新整理，会替换本文档。可以通过撤销恢复。继续？",
        )
      )
        return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/profile");
        if (!r.profile) throw new Error("请先填写并保存个人信息");
        change(() => (doc.value = fromProfile(r.profile)));
        notice.value = "已整理你保存的真实信息，请检查后保存；未调用AI";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    function edit(
      value: string,
      label: string,
      onCommit: (v: string) => void,
      tag = "p",
      placeholder = "双击填写",
      multiline = false,
      max = 12000,
    ) {
      return h(InlineEdit, {
        key: label,
        value,
        label,
        tag,
        placeholder,
        multiline,
        max,
        disabled: busy.value,
        onCommit: (v: string) => change(() => onCommit(v)),
        onEditing: (active: boolean, changed: boolean) => {
          editing.value = active;
          editDirty.value = active && changed;
          props.onDirty(dirty.value || editDirty.value);
        },
      });
    }
    function addSection() {
      const name = sectionName.value.trim();
      if (!name || name.length > 160 || doc.value.sections.length >= 24) return;
      change(() =>
        doc.value.sections.push({ id: uid(), title: name, items: [entry()] }),
      );
      sectionName.value = "";
      panel.value = "";
    }
    // 描述新板块：把需求交给AI，只追加一个新板块，现有板块一律不动。
    async function generateSection() {
      if (sectionBusy.value || !current.value) return;
      const description = aiPrompt.value.trim();
      if (!description) {
        sectionError.value = "请先描述你想要的新板块";
        return;
      }
      if (doc.value.sections.length >= 24) {
        sectionError.value = "板块已达 24 个上限，请先合并或删除";
        return;
      }
      sectionBusy.value = true;
      sectionError.value = "";
      try {
        const r = await api<any>(
          "/ai/resume-section",
          "POST",
          { document: withoutPhotos(doc.value), description },
          { timeoutMs: 150000 },
        );
        const sec = r?.section;
        if (!sec || !sec.title || !Array.isArray(sec.items) || !sec.items.length)
          throw Error("AI未返回可用的板块");
        change(() =>
          doc.value.sections.push({
            id: uid(),
            title: String(sec.title).slice(0, 160),
            items: sec.items.slice(0, 40).map((it: any) => ({
              id: uid(),
              title: String(it.title || "").slice(0, 240),
              meta: String(it.meta || "").slice(0, 200),
              content: String(it.content || "").slice(0, 12000),
            })),
          }),
        );
        aiPrompt.value = "";
        panel.value = "";
        notice.value = "已新增板块“" + String(sec.title) + "”，可在文档里继续双击修改。";
      } catch (e) {
        sectionError.value = errorText(e);
      } finally {
        sectionBusy.value = false;
      }
    }
    function move(i: number, delta: number) {
      if (i + delta < 0 || i + delta >= doc.value.sections.length) return;
      change(() => {
        const s = doc.value.sections.splice(i, 1)[0];
        doc.value.sections.splice(i + delta, 0, s);
      });
    }
    type PageFragment = { section: Section; items: Entry[]; first: boolean; last: boolean };
    const pages = computed<PageFragment[][]>(() => {
      if (pagePlan.value.length) return pagePlan.value;
      const breaks = new Set(doc.value.pageBreaks || []);
      const groups: PageFragment[][] = [];
      for (const s of doc.value.sections) {
        if (breaks.has(s.id) && groups.length && groups[groups.length - 1].length)
          groups.push([]);
        if (!groups.length) groups.push([]);
        groups[groups.length - 1].push({ section: s, items: s.items, first: true, last: true });
      }
      if (!groups.length) groups.push([]);
      return groups;
    });
    let paginationQueued = false;
    async function recalcPagination() {
      if (paginationBusy) { paginationQueued = true; return; }
      paginationBusy = true;
      try {
        await nextTick();
        const desk = document.querySelector(".resume-desk");
        if (!desk) { pagePlan.value = []; return; }
        const first = desk.querySelector(".resume-document") as HTMLElement | null;
        if (!first) { pagePlan.value = []; return; }
        const header = first.querySelector(".document-header") as HTMLElement | null;
        const summary = first.querySelector(".document-summary") as HTMLElement | null;
        // 预留 30px 余量，避免条目 margin/续页标题把页面撑过 A4。
        const contentHeight = 1008;
        let used = (header?.getBoundingClientRect().height || 0) + (summary?.getBoundingClientRect().height || 0) + 10;
        const sectionsEl = Array.from(desk.querySelectorAll(".document-section")) as HTMLElement[];
        const headerH = new Map<string, number>();
        const entryH = new Map<string, number>();
        for (const el of sectionsEl) {
          const id = el.getAttribute("data-section-id") || "";
          if (id && !headerH.has(id)) headerH.set(id, (el.querySelector(".section-heading") as HTMLElement | null)?.getBoundingClientRect().height || 36);
          for (const entry of Array.from(el.querySelectorAll(".document-entry"))) {
            const eid = (entry as HTMLElement).getAttribute("data-entry-id") || "";
            if (eid && !entryH.has(eid)) entryH.set(eid, (entry as HTMLElement).getBoundingClientRect().height + 12);
          }
        }
        const plan: PageFragment[][] = [];
        let page: PageFragment[] = [];
        const finish = () => { if (page.length) plan.push(page); page = []; };
        const newPage = () => { finish(); used = 40; };
        const breaks = new Set(doc.value.pageBreaks || []);
        for (const s of doc.value.sections) {
          if (breaks.has(s.id) && page.length) newPage();
          const sh = headerH.get(s.id) || 36;
          const hs = s.items.map((i) => entryH.get(i.id) || 70);
          const totalH = sh + hs.reduce((a, b) => a + b, 0) + 18;
          if (s.items.length === 0) {
            if (page.length && used + totalH > contentHeight) newPage();
            page.push({ section: s, items: s.items, first: true, last: true });
            used += totalH;
            continue;
          }
          let first = true;
          let headerPriced = false;
          let part: Entry[] = [];
          for (let i = 0; i < s.items.length; i++) {
            const item = s.items[i];
            const eh = s.columns === 2 ? hs[i] / 2 : hs[i];
            const headerCost = headerPriced ? 28 : sh;
            // 短条目仍按整条排版，保留直接编辑。
            if (used + headerCost + eh <= contentHeight || String(item.content || "").split("\n").length <= 1) {
              if (part.length && used + headerCost + eh > contentHeight) {
                page.push({ section: s, items: part, first, last: false });
                finish(); used = 40; first = false; headerPriced = true; part = [];
              } else if (!part.length && used + headerCost + eh > contentHeight && page.length) {
                newPage();
              }
              used += (part.length || !headerPriced ? headerCost : 28) + eh;
              headerPriced = true;
              part.push(item);
              continue;
            }
            // 长条目按当前页剩余空间逐行切分，切不完的进入下一页。
            const lines = String(item.content || "").split("\n");
            const visualTotal = lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 54)), 0) || 1;
            // 长条目按实际正文行高切分，避免用整块 measured 高度把每行估得过大。
            const perVisual = doc.value.layout.template === "compact" ? 21 : 26;
            let lineIndex = 0;
            let chunkFirst = true;
            while (lineIndex < lines.length) {
              const hCost = headerPriced ? 28 : sh;
              if (hCost + 24 > contentHeight - used && part.length) {
                page.push({ section: s, items: part, first, last: false });
                finish(); used = 40; first = false; headerPriced = true; part = [];
                continue;
              }
              const avail = contentHeight - used - hCost - (chunkFirst ? 42 : 8);
              let take = 0;
              let chunkH = 0;
              for (let j = lineIndex; j < lines.length; j++) {
                const lh = Math.max(1, Math.ceil(lines[j].length / 54)) * perVisual;
                if (take > 0 && chunkH + lh > avail) break;
                chunkH += lh;
                take++;
                if (chunkH > avail) break;
              }
              if (take === 0) take = 1;
              const chunkLines = lines.slice(lineIndex, lineIndex + take);
              const chunkText = chunkLines.join("\n");
              let start = 0;
              for (let k = 0; k < lineIndex; k++) start += lines[k].length + 1;
              part.push({
                ...item,
                id: item.id + "__page" + lineIndex,
                title: chunkFirst ? item.title : "",
                meta: chunkFirst ? item.meta : "",
                content: chunkText,
                ...( { __source: item, __start: start, __continuation: !chunkFirst, __entryChunk: true } as any),
              } as Entry);
              used += hCost + chunkH + (chunkFirst ? 42 : 8);
              headerPriced = true;
              lineIndex += take;
              chunkFirst = false;
              if (lineIndex < lines.length) {
                page.push({ section: s, items: part, first, last: false });
                finish(); used = 40; first = false; headerPriced = true; part = [];
              }
            }
          }
          if (part.length) page.push({ section: s, items: part, first, last: true });
        }
        finish();
        pagePlan.value = plan.length ? plan : [];
      } finally {
        paginationBusy = false;
        if (paginationQueued) { paginationQueued = false; void recalcPagination(); }
      }
    }
    watch(doc, () => { void recalcPagination(); }, { deep: true });
    function togglePageBreak(id: string) {
      const cur = new Set(doc.value.pageBreaks || []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      change(() => {
        doc.value.pageBreaks = [...cur];
      });
    }
    async function word() {
      if (!flush() || busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const { exportWord } = await import("./resume-export");
        await exportWord(clone(doc.value), title.value || "我的简历");
        notice.value = "Word已生成，文档在本机浏览器内处理，未上传外部服务";
      } catch (e) {
        error.value = "Word导出失败：" + errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function print() {
      if (!current.value || !flush()) return;
      panel.value = "";
      if (dirty.value || editDirty.value) await save();
      if (!current.value) return;
      notice.value = "正在生成 PDF…";
      try {
        const r = await fetch("/api/resumes/" + current.value.id + "/pdf", { credentials: "same-origin" });
        if (!r.ok) {
          let detail = "";
          try { detail = String((await r.json()).error || ""); } catch {}
          throw new Error(detail || "PDF生成失败");
        }
        const { download } = await import("./resume-export");
        download(await r.blob(), (title.value || "我的简历") + ".pdf");
        notice.value = "PDF 已生成，只包含简历纸张，不包含网站界面或浏览器页眉页脚。";
      } catch (e) {
        error.value = "PDF生成失败：" + errorText(e);
        // 后端 PDF 服务不可用时仍保留浏览器打印作为兜底
        notice.value = "PDF 服务不可用，已打开浏览器打印；请关闭浏览器页眉页脚后另存。";
        document.body.classList.add("printing-resume");
        const cleanup = () => {
          document.body.classList.remove("printing-resume");
          window.removeEventListener("afterprint", cleanup);
        };
        window.addEventListener("afterprint", cleanup);
        nextTick(() => { window.print(); setTimeout(cleanup, 2500); });
      }
    }
    function keydown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !editing.value &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
    }
    onMounted(() => window.addEventListener("keydown", keydown));
    onUnmounted(() => window.removeEventListener("keydown", keydown));
    function section(s: Section, index: number, items = s.items, first = true, last = true) {
      return h(
        "section",
        { key: s.id + "-" + (items[0]?.id || "empty") + (first ? "-first" : "-cont"), class: "document-section" + (s.columns === 2 ? " columns-2" : "") + (first ? "" : " section-continuation"), "data-section-id": s.id },
        [
          first
            ? h("div", { class: "section-heading" }, [
            edit(
              s.title,
              "板块标题-" + s.id,
              (v) => (s.title = v),
              "h2",
              "双击填写板块名称",
              false,
              160,
            ),
            h("div", { class: "section-controls" }, [
              h(
                "button",
                {
                  title: "上移" + s.title,
                  "aria-label": "上移" + s.title,
                  disabled: index === 0,
                  onClick: () => move(index, -1),
                },
                "↑",
              ),
              h(
                "button",
                {
                  title: "下移" + s.title,
                  "aria-label": "下移" + s.title,
                  disabled: index === doc.value.sections.length - 1,
                  onClick: () => move(index, 1),
                },
                "↓",
              ),
              h(
                "button",
                {
                  title: (doc.value.pageBreaks || []).includes(s.id)
                    ? "取消在此板块前换页"
                    : "在此板块前换页（新增一页）",
                  "aria-label": "换页-" + s.title,
                  class: (doc.value.pageBreaks || []).includes(s.id)
                    ? "page-break-on"
                    : "",
                  disabled: index === 0,
                  onClick: () => togglePageBreak(s.id),
                },
                "换页",
              ),
              h(
                "button",
                {
                  title: "删除" + s.title,
                  "aria-label": "删除板块" + s.title,
                  onClick: () => {
                    if (
                      confirm("删除“" + s.title + "”及其内容？可通过撤销恢复。")
                    )
                      change(() => doc.value.sections.splice(index, 1));
                  },
                },
                "×",
              ),
            ]),
            ])
            : h("div", { class: "section-heading section-continued" }, [
                h("span", { class: "section-continued-title" }, s.title),
              ]),
          h("div", { class: "section-items" }, items.map((item, i) =>
            h("div", { key: item.id, class: "document-entry" + ((item as any).__continuation ? " entry-continuation" : ""), "data-entry-id": item.id }, [
              !(item as any).__continuation ? h("div", { class: "entry-line" }, [
                edit(
                  item.title,
                  "条目标题-" + item.id,
                  (v) => {
                    const source = (item as any).__source as Entry | undefined;
                    if (source) source.title = v; else item.title = v;
                  },
                  "h3",
                  s.title === "教育经历"
                    ? "双击填写学校 / 专业 / 学历"
                    : "双击填写名称 / 角色",
                  false,
                  240,
                ),
                edit(
                  item.meta,
                  "条目时间-" + item.id,
                  (v) => {
                    const source = (item as any).__source as Entry | undefined;
                    if (source) source.meta = v; else item.meta = v;
                  },
                  "p",
                  "双击填写时间",
                  false,
                  200,
                ),
              ]) : null,
              edit(
                item.content,
                "条目内容-" + item.id,
                (v) => {
                  const source = (item as any).__source as Entry | undefined;
                  if (source && typeof (item as any).__start === "number") {
                    const start = Number((item as any).__start) || 0;
                    source.content = source.content.slice(0, start) + v + source.content.slice(start + item.content.length);
                    item.content = v;
                  } else item.content = v;
                },
                "p",
                "双击写下你的经历与成果，支持多行",
                true,
              ),
              s.items.length > 1 && last && !(item as any).__source
                ? h(
                    "button",
                    {
                      class: "entry-remove",
                      "aria-label": "删除条目" + (i + 1) + "-" + s.title,
                      onClick: () => {
                        if (confirm("删除此条目？可以撤销。")) {
                          const at = s.items.indexOf(item);
                          if (at >= 0) change(() => s.items.splice(at, 1));
                        }
                      },
                    },
                    "删除此条",
                  )
                : null,
            ]),
          )),
          last
            ? h(
                "button",
                {
                  class: "add-document-entry",
                  disabled: s.items.length >= 40,
                  onClick: () => change(() => s.items.push(entry())),
                },
                "＋ 添加" + s.title + "条目",
              )
            : null,
        ],
      );
    }
    return () =>
      h("div", { class: "resume-studio" }, [
        h("header", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "RESUME STUDIO"),
          h("h1", "简历工作室"),
          h(
            "p",
            "一张文档，直接打磨。双击任意文本开始编辑，回车确认，Esc取消。",
          ),
        ]),
        h(AiReview, {
          document: doc.value,
          decorEnabled: decorEnabled.value,
          decorBusy: decorBusy.value,
          decorCount: decorCount.value,
          decorStyle: decorStyle.value,
          onDecorStyle: (style: string) => { decorStyle.value = style as typeof decorStyle.value; },
          decorError: decorError.value,
          onDecorChange: (enabled: boolean) => {
            decorEnabled.value = enabled;
            if (!enabled) clearDecoration();
            else if (!decoration.value) {
              notice.value = "已勾选；点“开始审阅”时会生成一张避开文字区域的整页背景";
            }
          },
          onClearDecor: () => clearDecoration(),
          // 勾选了装饰时，点"AI 审阅优化"顺带生成，未勾选就只做内容审阅
          onBefore: async () => {
            if (decorEnabled.value && !decoration.value) await generateDecoration();
          },
          disabled: busy.value || editing.value,
          onApply: (items: any[]) => {
            const targets: { object: any; key: string; suggestion: any }[] = [];
            for (const s of items) {
              if (!s.before?.trim() || !s.after?.trim()) throw Error("建议必须包含有效原文与修改内容");
              const matches: {object: any; key: string; path: string}[] = [];
              const scan = (object: any, key: string, path: string) => { if (object[key]?.includes(s.before)) matches.push({object, key, path}); };
              for (const key of ["name", "headline", "contact", "summary"]) scan(doc.value.header, key, "header." + key);
              doc.value.sections.forEach((section, si) => section.items.forEach((item, ii) => {
                for (const key of ["title", "meta", "content"]) scan(item, key, `sections.${si}.items.${ii}.${key}`);
              }));
              // AI 可能用 sections[0].items[1].content 这类方括号写法，统一成点号路径。
              const path = String(s.field)
                .replace(/^document\./, "")
                .replace(/\[(\d+)\]/g, ".$1")
                // AI 也常用 header/headline 这种斜杠写法
                .replace(/^(header|sections)\//, "$1.");
              const exact = matches.filter((m) => m.path === path);
              const explicit = /^(?:header\.|sections\.)/.test(path);
              // 明确路径但没命中时，只要原文唯一，仍允许按原文定位。
              const eligible =
                explicit && exact.length ? exact : matches;
              if (eligible.length !== 1) throw Error("原文已变化或出现多处相同文本，请明确定位后重新审阅");
              const target = eligible[0];
              if (targets.some(t => t.object === target.object && t.key === target.key)) throw Error("同一字段有多条建议，请逐条采纳");
              targets.push({...target, suggestion: s});
            }
            change(() => { for (const t of targets) t.object[t.key] = t.object[t.key].replace(t.suggestion.before, t.suggestion.after); });
          },
        }),
        h("details", { class: "studio-import-toggle" }, [
          h("summary", "＋ 导入已有简历 · PDF / DOCX / 图片"),
          h(ResumeImport, {
            disabled: busy.value,
            onCreated: async (r: Resume) => {
              await refresh();
              if (flush() && canLeave()) install(r);
            },
          }),
        ]),
        h("div", { class: "resume-toolbar" }, [
          h("div", { class: "version-switch" }, [
            ...versions.value.map((v) =>
              h(
                "button",
                {
                  class: v.id === current.value?.id ? "selected" : "",
                  disabled: busy.value,
                  onClick: () => load(v.id),
                },
                v.title,
              ),
            ),
            h(
              "button",
              {
                class: "primary",
                disabled: busy.value,
                onClick: () => create(),
              },
              "＋ 新增版本",
            ),
          ]),
          h("div", { class: "actions" }, [
            h(
              "button",
              {
                disabled: !current.value,
                onClick: () => (panel.value = "layout"),
              },
              "✧ 调整布局 / 外观",
            ),
            h(
              "button",
              { disabled: !current.value || busy.value, onClick: word },
              "下载 Word",
            ),
            h(
              "button",
              { disabled: !current.value || busy.value, onClick: () => void print() },
              "下载 PDF",
            ),
          ]),
        ]),
        current.value
          ? h("div", { class: "studio-photo-tools" }, [
              h("div", { class: "studio-photo-copy" }, [
                h("strong", "个人照片"),
                h("small", "最多 3 张；第一张作为简历主照片，随文档一起保存。"),
              ]),
              h(PhotoPicker, {
                photos: doc.value.header.photos || [],
                availablePhotos: profilePhotos.value,
                disabled: busy.value || editing.value,
                onChange: (photos: string[]) => { change(() => { doc.value.header.photos = photos; }); },
              }),
            ])
          : null,
        h("section", { class: "ai-help-strip" }, [
          h("div", { class: "ai-help-title" }, "✦ AI 助手能帮你"),
          h("div", { class: "ai-help-items" }, [
            h(
              "button",
              {
                disabled: !current.value,
                onClick: () => (panel.value = "ai-section"),
              },
              "＋ 描述新板块，AI 帮你添加",
            ),
          ]),
        ]),
        loading.value
          ? h("p", { role: "status" }, "正在读取你的文档…")
          : current.value
            ? h("div", [
                h("div", { class: "document-ribbon" }, [
                  h(
                    "div",
                    { class: "ribbon-menus" },
                    ["文件", "编辑", "排版", "模板"].map((label, i) =>
                      h(
                        "button",
                        {
                          "aria-expanded":
                            panel.value ===
                            ["file", "edit", "layout", "template"][i],
                          onClick: () =>
                            (panel.value =
                              panel.value ===
                              ["file", "edit", "layout", "template"][i]
                                ? ""
                                : ["file", "edit", "layout", "template"][i]),
                        },
                        label,
                      ),
                    ),
                  ),
                  h("span", "HTML 简历 · 双击原位编辑"),
                  h(
                    "span",
                    {
                      class:
                        dirty.value || editDirty.value ? "unsaved" : "saved",
                    },
                    dirty.value || editDirty.value
                      ? "● 有未保存修改"
                      : "✓ 版本已保存",
                  ),
                ]),
                panel.value
                  ? h("section", { class: "ribbon-panel" }, [
                      h(
                        "button",
                        {
                          class: "panel-close",
                          "aria-label": "关闭工具面板",
                          onClick: () => (panel.value = ""),
                        },
                        "×",
                      ),
                      panel.value === "ai-section"
                        ? h("div", [
                            h("h3", "描述新板块，AI 帮你添加"),
                            h(
                              "p",
                              "用一句话说清要加什么（例如“加一个开源贡献板块，放我维护的 Vue 组件库”），AI 会生成一个板块并追加到简历末尾；现有板块不会被改写。",
                            ),
                            h("textarea", {
                              value: aiPrompt.value,
                              placeholder:
                                "例如：增加开源贡献板块，写我维护的 Vue 组件库和 300+ star…",
                              "aria-label": "AI编辑需求",
                              maxlength: 2000,
                              rows: 4,
                              onInput: (e: Event) =>
                                (aiPrompt.value = (
                                  e.target as HTMLTextAreaElement
                                ).value),
                            }),
                            h("div", { class: "panel-actions" }, [
                              h(
                                "button",
                                {
                                  class: "primary",
                                  disabled:
                                    sectionBusy.value ||
                                    busy.value ||
                                    editing.value ||
                                    !aiPrompt.value.trim(),
                                  onClick: generateSection,
                                },
                                sectionBusy.value
                                  ? "AI正在撰写板块…"
                                  : "AI 生成并添加板块",
                              ),
                            ]),
                            sectionError.value
                              ? h(
                                  "p",
                                  { class: "error", role: "alert" },
                                  sectionError.value,
                                )
                              : null,
                            h(
                              "small",
                              "生成后仍可撤销（Ctrl/Cmd+Z）；事实请以你提供的描述为准。",
                            ),
                          ])
                        : panel.value === "file"
                          ? h("div", { class: "panel-actions" }, [
                              h(
                                "button",
                                { disabled: busy.value, onClick: save },
                                "保存当前版本",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: () => create(true),
                                },
                                "复制为新版本",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: importProfile,
                                },
                                "从个人信息整理",
                              ),
                              h(
                                "button",
                                {
                                  disabled: busy.value,
                                  onClick: () => load(current.value!.id),
                                },
                                "重新读取",
                              ),
                              h(
                                "button",
                                {
                                  class: "text-danger",
                                  disabled: busy.value,
                                  onClick: remove,
                                },
                                "删除当前版本",
                              ),
                              h("label", { class: "field" }, [
                                h("span", "版本名称"),
                                h("input", {
                                  "aria-label": "版本名称",
                                  value: title.value,
                                  maxlength: 120,
                                  onChange: (e: Event) =>
                                    change(
                                      () =>
                                        (title.value = (
                                          e.target as HTMLInputElement
                                        ).value),
                                    ),
                                }),
                              ]),
                            ])
                          : panel.value === "edit"
                            ? h("div", [
                                h("div", { class: "panel-actions" }, [
                                  h(
                                    "button",
                                    {
                                      disabled:
                                        !undoStack.value.length ||
                                        editing.value,
                                      onClick: undo,
                                    },
                                    "撤销",
                                  ),
                                  h(
                                    "button",
                                    {
                                      disabled:
                                        !redoStack.value.length ||
                                        editing.value,
                                      onClick: redo,
                                    },
                                    "重做",
                                  ),
                                ]),
                                h("div", { class: "inline add-section" }, [
                                  h("input", {
                                    value: sectionName.value,
                                    "aria-label": "新板块名称",
                                    placeholder: "例如：开源贡献",
                                    maxlength: 160,
                                    onInput: (e: Event) =>
                                      (sectionName.value = (
                                        e.target as HTMLInputElement
                                      ).value),
                                    onKeydown: (e: KeyboardEvent) => {
                                      if (e.key === "Enter") addSection();
                                    },
                                  }),
                                  h(
                                    "button",
                                    {
                                      onClick: addSection,
                                      disabled:
                                        !sectionName.value.trim() ||
                                        doc.value.sections.length >= 24,
                                    },
                                    "新增板块",
                                  ),
                                ]),
                                h(
                                  "small",
                                  "板块右侧可上下移动和删除；Ctrl/Cmd+S保存，文档编辑确认后可撤销。",
                                ),
                              ])
                            : panel.value === "layout"
                              ? h("div", { class: "panel-actions" }, [
                                  h("button", { disabled: layoutBusy.value || busy.value || editing.value, onClick: recommendLayout }, layoutBusy.value ? "AI正在分析布局…" : "AI推荐布局"),
                                  layoutSuggestion.value ? h("section", { class: "ai-layout-preview" }, [
                                    h("h3", "AI布局建议（尚未应用）"),
                                    h("p", `${layoutSuggestion.value.template === "compact" ? "紧凑" : "经典"}模板 · ${layoutSuggestion.value.fontSize}px · ${layoutSuggestion.value.accent}`),
                                    h("p", layoutSuggestion.value.reason),
                                    layoutSuggestion.value.structure?.groups?.length
                                      ? h("div", { class: "ai-layout-groups" },
                                          layoutSuggestion.value.structure.groups.map((g: any, i: number) =>
                                            h("span", { class: "ai-layout-group" }, [
                                              h("b", "#" + (i + 1)),
                                              " " + (g.title || "保留原板块") + (g.columns === 2 ? " · 两栏" : ""),
                                            ]),
                                          ))
                                      : null,
                                    ...(layoutSuggestion.value.changes || []).map((text: string) => h("p", text)),
                                    h("button", { onClick: applyLayout }, "应用此布局到草稿"),
                                    h("button", { onClick: () => layoutSuggestion.value = null }, "放弃建议"),
                                  ]) : null,
                                  h("label", [
                                    "字号 ",
                                    h(
                                      "select",
                                      {
                                        "aria-label": "文档字号",
                                        value: doc.value.layout.fontSize,
                                        onChange: (e: Event) =>
                                          change(
                                            () =>
                                              (doc.value.layout.fontSize =
                                                Number(
                                                  (
                                                    e.target as HTMLSelectElement
                                                  ).value,
                                                )),
                                          ),
                                      },
                                      [13, 14, 15, 16].map((n) =>
                                        h("option", { value: n }, String(n)),
                                      ),
                                    ),
                                  ]),
                                  h("label", [
                                    "强调色 ",
                                    h(
                                      "select",
                                      {
                                        "aria-label": "文档强调色",
                                        value: doc.value.layout.accent,
                                        onChange: (e: Event) =>
                                          change(
                                            () =>
                                              (doc.value.layout.accent = (
                                                e.target as HTMLSelectElement
                                              ).value as any),
                                          ),
                                      },
                                      [
                                        ["purple", "逐光紫"],
                                        ["navy", "深海蓝"],
                                        ["charcoal", "石墨黑"],
                                      ].map(([v, t]) =>
                                        h("option", { value: v }, t),
                                      ),
                                    ),
                                  ]),
                                ])
                              : h(
                                  "div",
                                  { class: "panel-actions" },
                                  [
                                    ["classic", "经典 · 留白舒展"],
                                    ["compact", "紧凑 · 信息集中"],
                                  ].map(([value, label]) =>
                                    h(
                                      "button",
                                      {
                                        class:
                                          doc.value.layout.template === value
                                            ? "selected"
                                            : "",
                                        onClick: () =>
                                          change(
                                            () =>
                                              (doc.value.layout.template =
                                                value as any),
                                          ),
                                      },
                                      label,
                                    ),
                                  ),
                                ),
                    ])
                  : null,
                h("div", { class: "document-statusbar" }, [
                  h(
                    "span",
                    "双击文本编辑 · 回车确认 · Shift+回车换行 · Esc取消",
                  ),
                  h(
                    "button",
                    { disabled: busy.value, onClick: importProfile },
                    "从个人信息整理",
                  ),
                  h(
                    "button",
                    {
                      disabled: editing.value || !undoStack.value.length,
                      onClick: undo,
                    },
                    "撤销",
                  ),
                  h(
                    "button",
                    {
                      disabled: editing.value || !redoStack.value.length,
                      onClick: redo,
                    },
                    "重做",
                  ),
                ]),
                h("div", { class: "resume-page-meta", "data-page-count": pages.value.length }, [
                  h("span", "A4 · 210 × 297mm"),
                  h("span", "共 " + pages.value.length + " 页"),
                  h("small", "页与页之间是实际打印边界；最后一页可直接查看"),
                ]),
                h(
                  "div",
                  { class: "resume-desk single-document-desk" },
                  pages.value.map((pageSections, pi) =>
                    h(
                      "article",
                      {
                        key: pi,
                        class: [
                          "resume-document",
                          "paper",
                          backgroundSrc.value ? "has-background" : "",
                          "template-" + doc.value.layout.template,
                          "accent-" + doc.value.layout.accent,
                        ],
                        style: {
                          "--resume-font": doc.value.layout.fontSize + "px",
                          ...(backgroundSrc.value ? { backgroundImage: "url(\"" + backgroundSrc.value + "\")" } : {}),
                        },
                        "data-page": pi + 1,
                        "aria-label": "简历文档 第" + (pi + 1) + "页",
                      },
                      [
                        decoration.value && decorSrc.value
                          ? h("div", { class: "decor-band", "aria-hidden": "true" }, [
                              h("img", { src: decorSrc.value, alt: "" }),
                            ])
                          : null,
                        pi === 0 && !backgroundSrc.value && decorations.value.length
                          ? h("div", { class: "decor-strip", "aria-hidden": "true" },
                              decorations.value.slice(0, Math.ceil(decorations.value.length / 2)).map((d) =>
                                h("img", { src: "/api/decoration-assets/" + d.image + ".png", alt: "" }),
                              ))
                          : null,
                        pi === 0
                          ? [
                              h("header", { class: "document-header" }, [
                                (doc.value.header.photos || []).length
                                  ? h("div", { class: "document-photo-strip" },
                                      (doc.value.header.photos || []).map((src, i) =>
                                        h("img", {
                                          src,
                                          class: i === 0 ? "document-photo-main" : "document-photo-extra",
                                          alt: "个人照片" + (i + 1),
                                        }),
                                      ))
                                  : null,
                                h("div", { class: "document-header-text" }, [
                                edit(
                                  doc.value.header.name,
                                  "简历姓名",
                                  (v) => (doc.value.header.name = v),
                                  "h1",
                                  "双击填写你的姓名",
                                  false,
                                  120,
                                ),
                                edit(
                                  doc.value.header.headline,
                                  "简历求职意向",
                                  (v) => (doc.value.header.headline = v),
                                  "p",
                                  "双击填写意向岗位 · 意向城市",
                                  false,
                                  400,
                                ),
                                edit(
                                  doc.value.header.contact,
                                  "简历联系方式",
                                  (v) => (doc.value.header.contact = v),
                                  "p",
                                  "双击填写电话 / 邮箱",
                                  false,
                                  600,
                                ),
                                ]),
                              ]),
                              doc.value.header.summary || summaryOpen.value
                                ? h("div", { class: "document-summary" }, [
                                    h(InlineEdit, {
                                      key: "summary",
                                      value: doc.value.header.summary,
                                      label: "简历个人简介",
                                      tag: "p",
                                      placeholder: "填写个人简介（可留空）",
                                      multiline: true,
                                      max: 8000,
                                      disabled: busy.value,
                                      autoFocus: summaryOpen.value && !doc.value.header.summary,
                                      onCommit: (v: string) => {
                                        change(() => { doc.value.header.summary = v; });
                                        summaryOpen.value = !!v.trim();
                                      },
                                      onEditing: (active: boolean, changed: boolean) => {
                                        editing.value = active;
                                        editDirty.value = active && changed;
                                        props.onDirty(dirty.value || editDirty.value);
                                        if (!active && !doc.value.header.summary) summaryOpen.value = false;
                                      },
                                    }),
                                    doc.value.header.summary
                                      ? h("button", {
                                          class: "summary-remove",
                                          type: "button",
                                          title: "删除个人简介",
                                          onClick: () => {
                                            change(() => { doc.value.header.summary = ""; });
                                            summaryOpen.value = false;
                                          },
                                        }, "删除个人简介")
                                      : null,
                                  ])
                                : h("button", {
                                    class: "add-summary",
                                    type: "button",
                                    onClick: () => { summaryOpen.value = true; },
                                  }, "＋ 添加个人简介"),
                            ]
                          : h("header", { class: "document-header page-runner" }, [
                              h(
                                "span",
                                { class: "page-runner-name" },
                                doc.value.header.name || "简历",
                              ),
                              h(
                                "span",
                                { class: "page-runner-num" },
                                "第 " +
                                  (pi + 1) +
                                  " 页 · 共 " +
                                  pages.value.length +
                                  " 页",
                              ),
                            ]),
                        ...pageSections.map((frag) =>
                          section(frag.section, doc.value.sections.indexOf(frag.section), frag.items, frag.first, frag.last),
                        ),
                        pi === pages.value.length - 1 && !backgroundSrc.value && decorations.value.length > 1
                          ? h("div", { class: "decor-strip decor-strip-footer", "aria-hidden": "true" },
                              decorations.value.slice(Math.ceil(decorations.value.length / 2)).map((d) =>
                                h("img", { src: "/api/decoration-assets/" + d.image + ".png", alt: "" }),
                              ))
                          : null,
                        pi === pages.value.length - 1 && decorFooterSrc.value
                          ? h("div", { class: "decor-band decor-band-footer", "aria-hidden": "true" }, [
                              h("img", { src: decorFooterSrc.value, alt: "" }),
                            ])
                          : null,
                      ],
                    ),
                  ),
                ),
                h("div", { class: "save-bar document-save" }, [
                  h(
                    "button",
                    { class: "primary", disabled: busy.value, onClick: save },
                    busy.value ? "处理中…" : "保存当前版本",
                  ),
                  h(
                    "span",
                    {
                      class:
                        dirty.value || editDirty.value ? "unsaved" : "saved",
                    },
                    dirty.value || editDirty.value
                      ? "有未保存修改"
                      : "版本已保存",
                  ),
                  h(
                    "button",
                    { disabled: busy.value, onClick: () => create(true) },
                    "复制为新版本",
                  ),
                  h(
                    "button",
                    {
                      class: "text-danger",
                      disabled: busy.value,
                      onClick: remove,
                    },
                    "删除当前版本",
                  ),
                ]),
              ])
            : h("section", { class: "card empty" }, [
                h("h2", "让你的故事落在纸上"),
                h("p", "从空白文档开始，或者从个人信息整理，再双击文本打磨。"),
                h(
                  "button",
                  {
                    class: "primary",
                    disabled: busy.value,
                    onClick: () => create(),
                  },
                  "创建第一份简历",
                ),
              ]),
        error.value
          ? h("p", { class: "error", role: "alert" }, error.value)
          : null,
        notice.value
          ? h("p", { class: "notice", role: "status" }, notice.value)
          : null,
        aiWorking.value
          ? h("div", { class: "ai-work-overlay", role: "dialog", "aria-modal": "true", "aria-live": "polite" },
              h("div", { class: "ai-work-card" }, [
                h("span", { class: "ai-work-spinner" }),
                h("strong", "AI 正在工作"),
                h("p", null, aiWorkingText.value),
                h("small", null, "请先不要关闭页面；完成后会自动保存到当前草稿。"),
              ]))
          : null,
        h(
          "p",
          { class: "privacy-note" },
          "文档按账号保存；Word在浏览器本地生成，PDF用浏览器打印另存。AI与生图只在你主动点击时调用，不会后台发送资料。",
        ),
      ]);
  },
});
