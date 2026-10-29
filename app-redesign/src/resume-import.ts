import { defineComponent, h, ref, computed, onBeforeUnmount } from "vue";
import { api, session, errorText, type Profile } from "./api";
import { fromProfile, withoutPhotos, type Resume } from "./resume-model";
const labels: Partial<Record<keyof Profile, string>> = {
  name: "姓名",
  phone: "电话",
  email: "邮箱",
  summary: "个人简介",
  skills: "技能",
  honors: "荣誉与证书",
  education: "教育经历",
  projects: "项目经历",
  experience: "实习与工作经历",
};
interface Result {
  text: string;
  method: string;
  pages: { page: number; text: string; method: string }[];
  warnings: string[];
  ai?: { profile: Profile; extras?: { title: string; content: string }[]; evidence: { field: string; source: string }[]; provider: string; model: string; mode: string };
  photoCandidates?: { mime: string; data: string; source?: string; width?: number; height?: number }[];
  draftId?: string;
  draftRevision?: number;
}
export default defineComponent({
  props: { onProfile: Function, onCreated: Function, disabled: Boolean },
  setup(props) {
    const file = ref<File | null>(null),
      jobId = ref(""),
      processing = ref(false),
      saving = ref(false),
      result = ref<Result | null>(null),
      source = ref(""),
      groupedSource = ref(""),
      error = ref(""),
      notice = ref(""),
      selected = ref<string[]>([]),
      candidate = ref<Profile | null>(null),
      filename = ref(""),
      proposal = ref<{profile: Profile; extras: {title: string; content: string}[]; evidence: {field: string; source: string}[]; warnings: string[]} | null>(null),
      aiConsent = ref(false),
      pendingId = ref(""),
      pendingRevision = ref(0),
      pendingDrafts = ref<any[]>([]),
      destination = ref<"profile" | "resume" | "">(""),
      addToNotes = ref(false),
      photoCandidates = ref<{ url: string; source?: string }[]>([]),
      selectedPhotos = ref<string[]>([]),
      createdResume = ref<Resume | null>(null),
      extraInformation = computed(() => (candidate.value?.notes || "").trim());

    let generation = 0,
      disposed = false;
    let stopped = false,
      uploadAbort: AbortController | null = null,
      pollTimer: ReturnType<typeof setTimeout> | null = null,
      pollResolve: (() => void) | null = null;
    const hasField = (k: keyof Profile) => {
      const v = candidate.value?.[k];
      return Array.isArray(v)
        ? v.some((x) => (typeof x === "string" ? x : !!(x.title || x.detail)))
        : !!v;
    };
    const keys = computed(() => Object.keys(labels) as (keyof Profile)[]);
    const normalizeEvidence = (items:any[] = []) => items.map((e:any) => {
      const path = String(e.path || e.field || "").replace(/^profile\./, "");
      const field = (Object.keys(labels) as string[]).find((k) => path === k || path.startsWith(k + ".") || path.startsWith(k + "[")) || path;
      return { field, source: [e.quote, e.page != null ? "第" + e.page + "页" : ""].filter(Boolean).join(" · ") || String(e.source || "") };
    });
    const isAiMode = (m:string) => m === "vision" || m === "text" || m === "ai";
    const setPhotoCandidates = (items: any[] = []) => {
      photoCandidates.value = items.slice(0, 3).map((x: any) => ({
        url: typeof x?.url === "string" ? x.url : "data:" + (x?.mime || "image/jpeg") + ";base64," + (x?.data || ""),
        source: String(x?.source || "简历内嵌图片"),
      })).filter((x) => /^data:image\/(?:jpeg|png|webp);base64,/.test(x.url));
      selectedPhotos.value = [];
    };
    const syncPhotoSelection = () => {
      selectedPhotos.value = (candidate.value?.photos || []).filter((p) => photoCandidates.value.some((x) => x.url === p)).slice(0, 3);
    };
    async function restoreDrafts() {
      try {
        const list = await api<{ drafts: any[] }>("/resume-imports");
        pendingDrafts.value = list.drafts || [];
        if (pendingDrafts.value.length) {
          const d = await api<{ draft: any }>("/resume-imports/" + pendingDrafts.value[0].id);
          pendingId.value = d.draft.id; pendingRevision.value = d.draft.revision;
          source.value = d.draft.sourceText; groupedSource.value = source.value;
          candidate.value = d.draft.profile;
          setPhotoCandidates(d.draft.photoCandidates || []);
          syncPhotoSelection();
          proposal.value = { profile: d.draft.profile, extras: d.draft.extras || [], evidence: normalizeEvidence(d.draft.evidence || []), warnings: d.draft.warnings || [] };
          result.value = { text: source.value, method: d.draft.method || "服务器待确认草稿", pages: [], warnings: d.draft.warnings || [], ai: isAiMode(d.draft.mode) ? { profile: d.draft.profile, extras: d.draft.extras || [], evidence: normalizeEvidence(d.draft.evidence || []), provider: d.draft.provider || "", model: d.draft.model || "", mode: d.draft.mode } : undefined };
          notice.value = "已恢复服务器中的待确认草稿；尚未写入个人资料或简历。";
        }
      } catch (e) { error.value = errorText(e); }
    }
    void restoreDrafts();
    async function regroup() {
      if (saving.value || processing.value) return;
      if (!pendingId.value) { error.value = "缺少待确认草稿，无法请求AI重新识别"; return; }
      if (!aiConsent.value) { error.value = "请先确认将修正原文交给AI整理"; return; }
      saving.value = true;
      try {
        error.value = "";
        const r = await fetch("/api/resume-imports/" + encodeURIComponent(pendingId.value) + "/reprocess", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf || "", "X-AI-Consent": "true" },
          body: JSON.stringify({ sourceText: source.value, revision: pendingRevision.value }),
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "AI重新识别失败");
        const draft = data.draft || data;
        pendingRevision.value = draft.revision ?? pendingRevision.value;
        candidate.value = JSON.parse(JSON.stringify(draft.profile));
        setPhotoCandidates(draft.photoCandidates || []);
        syncPhotoSelection();
        proposal.value = { profile: draft.profile, extras: draft.extras || [], evidence: normalizeEvidence(draft.evidence || []), warnings: draft.warnings || [] };
        groupedSource.value = source.value; selected.value = []; addToNotes.value = false;
        notice.value = "已由AI重新归类；请核对并勾选需要导入的字段。";
      } catch (e) { error.value = errorText(e); } finally { saving.value = false; }
    }
    async function removeJob(id: string) {
      try {
        const r = await fetch("/api/resume-extractions/" + id, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
          headers: { "X-CSRF-Token": session.csrf || "" },
        });
        if (!r.ok && r.status !== 404) throw Error("delete failed");
      } catch {
        if (!disposed)
          notice.value =
            "本地结果已清除，服务器删除未确认；临时结果最迟约16分钟自动过期。";
      }
    }
    async function discard() {
      generation++;
      stopped = true;
      uploadAbort?.abort();
      if (pollTimer) clearTimeout(pollTimer);
      pollResolve?.();
      pollResolve = null;
      const id = jobId.value;
      jobId.value = "";
      processing.value = false;
      result.value = null;
      source.value = "";
      candidate.value = null;
      proposal.value = null;
      photoCandidates.value = []; selectedPhotos.value = []; createdResume.value = null;
      selected.value = []; addToNotes.value = false;
      // 服务端临时识别结果有名额上限（每账号4个），必须无条件释放；
      // 待确认草稿存在 resume_imports 里，与这个临时 job 无关，删掉不影响恢复。
      if (id) await removeJob(id);
    }
    async function start() {
      if (!file.value || processing.value || saving.value || props.disabled)
        return;
      const cleanup = discard();
      const mine = generation;
      processing.value = true;
      stopped = false;
      error.value = "";
      notice.value = "";
      const currentRun = () => mine === generation && !disposed;
      const f = file.value;
      filename.value = f.name;
      try {
        await cleanup;
        if (!currentRun()) return;
        const types: Record<string, string> = {
          pdf: "application/pdf",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
        };
        const type = types[f.name.split(".").pop()?.toLowerCase() || ""];
        if (!type) throw Error("请选择PDF、DOCX、PNG或JPEG文件");
        if (f.size < 1 || f.size > 5 * 1024 * 1024)
          throw Error("文件大小须不超过5MiB");
        const controller = new AbortController();
        uploadAbort = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        let r: Response;
        try {
          if (!aiConsent.value) throw Error("请先确认将简历发送给AI服务进行识别");
          r = await fetch("/api/resume-imports?filename=" + encodeURIComponent(f.name), {
            method: "POST",
            credentials: "same-origin",
            signal: controller.signal,
            headers: {
              "Content-Type": type,
              "X-CSRF-Token": session.csrf || "",
              "X-File-Name": encodeURIComponent(f.name),
              "X-AI-Consent": "true",
            },
            body: f,
          });
        } finally {
          clearTimeout(timer);
        }
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "上传失败");
        const myId = data.job.id;
        if (!currentRun()) {
          void removeJob(myId);
          return;
        }
        jobId.value = myId;
        const end = Date.now() + 130000;
        while (currentRun() && Date.now() < end) {
          const { job } = await api("/resume-extractions/" + myId);
          if (!currentRun() || jobId.value !== myId) return;
          if (job.state === "ready") {
            result.value = job.result;
            source.value = job.result.text;
            pendingId.value = job.result.draftId || "";
            pendingRevision.value = job.result.draftRevision || 0;
            if (job.result.ai) {
              candidate.value = JSON.parse(JSON.stringify(job.result.ai.profile));
              setPhotoCandidates(job.result.photoCandidates || []);
              proposal.value = { profile: job.result.ai.profile, extras: job.result.ai.extras || [], evidence: normalizeEvidence(job.result.ai.evidence || []), warnings: job.result.warnings || [] };
              groupedSource.value = source.value; selected.value = []; addToNotes.value = false;
            } else throw Error("AI未返回可用语义结果，请重试；不会使用本机规则替代AI");
            notice.value = "识别完成，尚未写入个人资料或简历。请先核对原文。";
            return;
          }
          if (job.state === "failed") throw Error(job.error);
          if (job.state === "cancelled") throw Error("识别已取消");
          await new Promise<void>((resolve) => {
            pollResolve = resolve;
            pollTimer = setTimeout(resolve, 1200);
          });
        }
        if (currentRun())
          throw Error("等待结果超时，请取消后使用更精简文件重试");
      } catch (e) {
        if (currentRun()) error.value = errorText(e);
      } finally {
        if (currentRun()) processing.value = false;
      }
    }
    async function savePending() {
      if (!pendingId.value || !proposal.value || !candidate.value) return;
      try {
        const r = await api<{draft:any}>("/resume-imports/" + pendingId.value, "PUT", { revision: pendingRevision.value, sourceText: source.value, profile: { ...candidate.value, photos: selectedPhotos.value.slice(0, 3) }, extras: proposal.value?.extras || [] });
        pendingRevision.value = r.draft.revision;
      } catch (e) { error.value = errorText(e); throw e; }
    }
    async function deletePending() {
      if (!pendingId.value || !confirm("删除这份待确认草稿？不会修改个人资料或简历。")) return;
      try { await api("/resume-imports/" + pendingId.value, "DELETE", { revision: pendingRevision.value }); pendingId.value = ""; pendingRevision.value = 0; result.value = null; proposal.value = null; candidate.value = null; source.value = ""; selected.value = []; photoCandidates.value = []; selectedPhotos.value = []; createdResume.value = null; addToNotes.value = false; await restoreDrafts(); } catch (e) { error.value = errorText(e); }
    }
    async function chooseDraft(id:string) {
      try { addToNotes.value=false; selected.value=[]; selectedPhotos.value=[]; const r=await api<{draft:any}>("/resume-imports/"+id); const d=r.draft; pendingId.value=d.id; pendingRevision.value=d.revision; source.value=d.sourceText; groupedSource.value=d.sourceText; candidate.value=d.profile; proposal.value={profile:d.profile,extras:d.extras||[],evidence:normalizeEvidence(d.evidence||[]),warnings:d.warnings||[]}; setPhotoCandidates(d.photoCandidates||[]); syncPhotoSelection(); result.value={text:d.sourceText,method:d.method||"待确认草稿",pages:[],warnings:d.warnings||[],ai:isAiMode(d.mode)?{profile:d.profile,extras:d.extras||[],evidence:normalizeEvidence(d.evidence||[]),provider:d.provider||"",model:d.model||"",mode:d.mode}:undefined}; } catch(e){error.value=errorText(e);}
    }
    function applyProfile() {
      if (
        !candidate.value ||
        !props.onProfile ||
        (!selected.value.length && !selectedPhotos.value.length && !(addToNotes.value && extraInformation.value)) ||
        source.value !== groupedSource.value
      )
        return;
      void savePending();
      const patch: Partial<Profile> = {};
      for (const key of selected.value as (keyof Profile)[]) {
        (patch as any)[key] = JSON.parse(JSON.stringify(candidate.value[key]));
      }
      if (selectedPhotos.value.length) patch.photos = selectedPhotos.value.slice(0, 3);
      props.onProfile(patch, addToNotes.value ? extraInformation.value : "");
      notice.value =
        "仅将已勾选字段写入当前草稿，未自动保存；请检查下方资料后点击保存。";
    }
    async function confirmDestination() {
      if (destination.value === "profile") {
        if (!candidate.value || (!selected.value.length && !selectedPhotos.value.length && !(addToNotes.value && extraInformation.value)) || source.value !== groupedSource.value) return;
        await savePending();
        const patch: Partial<Profile> = {};
        for (const key of selected.value as (keyof Profile)[]) (patch as any)[key] = JSON.parse(JSON.stringify(candidate.value[key]));
        if (selectedPhotos.value.length) patch.photos = selectedPhotos.value.slice(0, 3);
        if (props.onProfile) {
          props.onProfile(patch, addToNotes.value ? extraInformation.value : "");
          notice.value = "已放入当前个人资料草稿；尚未保存。请检查后单独点击个人资料保存。";
        } else {
          sessionStorage.setItem("resume-import-stage", JSON.stringify({ draftId: pendingId.value, fields: selected.value, photos: selectedPhotos.value.slice(0, 3), extraNotes: addToNotes.value ? extraInformation.value : "" }));
          window.location.hash = "#profile";
          notice.value = "待确认资料已暂存，正在打开个人信息页；请检查并点击保存。";
        }
        return;
      }
      await savePending();
      await createDocument();
    }
    async function createDocument() {
      if (
        !candidate.value ||
        !proposal.value ||
        saving.value ||
        props.disabled ||
        source.value !== groupedSource.value
      )
        return;
      const document = fromProfile({ ...candidate.value, photos: selectedPhotos.value.slice(0, 3) });
      createdResume.value = null;
      saving.value = true;
      error.value = "";
      try {
        let finalDocument = document;
        if (extraInformation.value) {
          const placed = await api<{layout:{document:{sections:any[]}}}>("/ai/resume-layout", "POST", { document: withoutPhotos(document), extras: proposal.value.extras || [], prompt: "以下内容是已识别并保留原文的未匹配分类信息，请按分类决定合适的简历位置：\n" + extraInformation.value }, { timeoutMs: 150000 });
          finalDocument = { ...document, sections: placed.layout.document.sections };
        }
        const title = (filename.value.replace(/\.[a-zA-Z0-9]+$/, "") || "识别导入").slice(0, 90) + " · 导入";
        const r = await api("/resumes", "POST", { title, body: { document: finalDocument } });
        createdResume.value = r.resume;
        await props.onCreated?.(r.resume);
        notice.value = "";
      } catch (e) {
        error.value = errorText(e);
      } finally {
        saving.value = false;
      }
    }
    onBeforeUnmount(() => {
      disposed = true;
      stopped = true;
      void discard();
    });
    return () =>
      h(
        "section",
        { class: "resume-import card", "aria-label": "简历上传识别" },
        [
          h("div", { class: "row-head" }, [
            h("div", [
              h("span", { class: "eyebrow" }, "RESUME INTAKE"),
              h("h2", "上传已有简历（可选）"),
            ]),
            h("span", { class: "local-badge" }, "AI视觉/文本识别"),
          ]),
          null,
          h("label", { class:"ai-consent", "data-testid":"import-ai-consent" }, [h("input", { type:"checkbox", checked:aiConsent.value, onChange:(e:Event)=>aiConsent.value=(e.target as HTMLInputElement).checked }), "同意使用AI识别简历，结果仅保存为私有草稿。"]),
          h("p", "PDF / DOCX / PNG / JPEG，≤5MiB。所有支持格式均提交AI进行语义识别与归类。"),
          h("div", { class: "import-upload" }, [
            h("input", {
              type: "file",
              accept: ".pdf,.docx,.png,.jpg,.jpeg",
              "aria-label": "选择简历文件",
              disabled: processing.value || saving.value || props.disabled,
              onChange: (e: Event) => {
                file.value = (e.target as HTMLInputElement).files?.[0] || null;
                error.value = "";
              },
            }),
            h(
              "button",
              {
                class: "primary",
                type: "button",
                disabled:
                  !file.value ||
                  processing.value ||
                  saving.value ||
                  props.disabled || !aiConsent.value,
                onClick: start,
              },
              processing.value ? "正在识别…" : "上传并识别",
            ),
            processing.value || result.value
              ? h(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      stopped = true;
                      void discard();
                      notice.value = "已清除临时识别结果，原有资料未改动";
                    },
                  },
                  processing.value ? "取消识别" : "清除识别结果",
                )
              : null,
          ]),
          processing.value
            ? h(
                "p",
                { role: "status" },
                "正在提交给AI服务识别，完成后可核对并编辑。",
              )
            : null,
          result.value && proposal.value
            ? h("div", { class: "import-review" }, [
                h("h3", "1 · 核对识别结果与原文"),
                h(
                  "p",
                  { class: "import-meta" },
                  filename.value +
                    " · " +
                    result.value.method +
                    " · 识别完成后核对确认不设倒计时",
                ),
                ...result.value.pages.map((page) =>
                  h("details", { class: "source-page" }, [
                    h("summary", "第" + page.page + "页 / " + page.method),
                    h("pre", page.text),
                  ]),
                ),
                h("label", { class: "field" }, [
                  h("span", "核对并修正原文（归类前可编辑）"),
                  h("textarea", {
                    "aria-label": "识别原文",
                    value: source.value,
                    maxlength: 40000,
                    rows: 8,
                    onInput: (e: Event) =>
                      (source.value = (e.target as HTMLTextAreaElement).value),
                  }),
                ]),
                h(
                  "button",
                  { type: "button", onClick: regroup },
                  source.value !== groupedSource.value
                    ? "原文已改变：提交AI重新识别并归类"
                    : "提交AI重新识别并归类",
                ),
                h(
                  "ul",
                  { class: "import-warnings" },
                  [
                    ...new Set([
                      ...result.value.warnings,
                      ...proposal.value.warnings,
                    ]),
                  ].map((w) => h("li", w)),
                ),
                h("fieldset", { class:"import-destination" }, [
                  h("legend", "2 · 选择导入目的地"),
                  h("label", [h("input", { type:"radio", name:"import-destination", "data-testid":"import-destination-profile", checked:destination.value==="profile", onChange:()=>destination.value="profile" }), "个人资料草稿"]),
                  h("label", [h("input", { type:"radio", name:"import-destination", "data-testid":"import-destination-resume", checked:destination.value==="resume", onChange:()=>destination.value="resume" }), "新建独立简历版本"]),
                ]),
                h("fieldset", { class: "import-photos", "data-testid": "import-photos" }, [
                  h("legend", "个人照片（可选）"),
                  photoCandidates.value.length
                    ? [
                        h("p", "从简历中检测到以下图片。勾选后保存到个人资料或新简历，最多 3 张，第一张作为主照片。"),
                        h("div", { class: "import-photo-grid" }, photoCandidates.value.map((photo, i) =>
                          h("label", { class: "import-photo-option" }, [
                            h("input", {
                              type: "checkbox",
                              checked: selectedPhotos.value.includes(photo.url),
                              onChange: (e: Event) => {
                                if ((e.target as HTMLInputElement).checked) {
                                  if (selectedPhotos.value.length >= 3) { error.value = "最多保存 3 张个人照片"; return; }
                                  selectedPhotos.value = [...selectedPhotos.value, photo.url];
                                } else selectedPhotos.value = selectedPhotos.value.filter((x) => x !== photo.url);
                              },
                            }),
                            h("img", { src: photo.url, alt: "候选个人照片" + (i + 1) }),
                            h("span", photo.source || "简历内嵌图片"),
                          ]),
                        )),
                      ]
                    : h("p", { class: "import-photo-empty" }, "未检测到可单独提取的个人照片；可以在保存后到个人信息页手动上传。"),
                ]),
                h("div", [
                      h("h3", "3 · 核对并编辑识别出的个人资料字段"),
                      h(
                        "p",
                        "默认不勾选。已勾选字段会替换当前同名字段；经历字段会替换该类全部条目，未勾选的一律保留。无法确认的姓名、城市、岗位不会猜测。",
                      ),
                      ...(keys.value.length
                        ? keys.value.map((k) =>
                            h("div", { class: "import-candidate" }, [
                              h("label", [
                                h("input", {
                                  type: "checkbox",
                                  "aria-label": "导入" + labels[k],
                                  checked: selected.value.includes(k),
                                  onChange: (e: Event) => {
                                    if ((e.target as HTMLInputElement).checked)
                                      selected.value.push(k);
                                    else
                                      selected.value = selected.value.filter(
                                        (x) => x !== k,
                                      );
                                  },
                                }),
                                labels[k],
                              ]),
                              typeof candidate.value?.[k] === "string"
                                ? h("div", [
                                    h("input", {
                                    "aria-label": "识别" + labels[k],
                                    value: candidate.value[k] as string,
                                    onInput: (e: Event) => {
                                      const value = (e.target as HTMLInputElement).value;
                                      (candidate.value as any)[k] = value;
                                      if (k === "name") { /* template is built when a destination is confirmed */ }
                                    },
                                  }),
                                  !candidate.value[k] ? h("small", { class: "missing-warning", role: "status" }, "未识别到" + labels[k] + "，请补充或确认留空") : null,
                                ])
                                : h(
                                    "div",
                                    (candidate.value![k] as any[]).map((x, i) =>
                                      h("div", [h("div", { class: "form-grid" }, [
                                        h("label", { class: "field" }, [h("span", "标题"), h("input", { value: x.title, "aria-label": "识别" + labels[k] + "标题" + (i + 1), onInput: (e: Event) => (x.title = (e.target as HTMLInputElement).value) })]),
                                        h("label", { class: "field" }, [h("span", "时间 / 阶段"), h("input", { value: x.period, "aria-label": "识别" + labels[k] + "时间" + (i + 1), onInput: (e: Event) => (x.period = (e.target as HTMLInputElement).value) })]),
                                      ]),
                                      h("label", { class: "field" }, [
                                        h("span", labels[k] + "内容"),
                                        h("textarea", { "aria-label": "识别" + labels[k] + (i + 1), value: x.detail, rows: 3, onInput: (e: Event) => (x.detail = (e.target as HTMLTextAreaElement).value) }),
                                      ])]),
                                    ),
                                  ),
                              h(
                                "small",
                                { class: "field-evidence" },
                                "来源：" +
                                  proposal
                                    .value!.evidence.filter(
                                      (e) =>
                                        e.field === k ||
                                        e.field.startsWith(k + "["),
                                    )
                                    .map((e) => e.source)
                                    .join(" · ")
                                    .slice(0, 500),
                              ),
                            ]),
                          )
                        : [
                            h(
                              "p",
                              "没有可安全映射的字段，完整原文仍可创建简历版本。",
                            ),
                          ]),

                    ]),
                extraInformation.value ? h("fieldset", { "data-testid":"import-other-information" }, [
                  h("legend", "其他信息（网站暂无对应分类）"),
                  h("textarea", { "aria-label":"未匹配信息", value:candidate.value?.notes || "", rows:5, onInput:(e:Event)=>{ if(candidate.value) { const value=(e.target as HTMLTextAreaElement).value; candidate.value.notes=value; if (proposal.value) proposal.value.extras=[{ title:"其他信息", content:value }].filter(x=>x.content.trim()); } } }),
                  h("label", [h("input", { type:"checkbox", checked:addToNotes.value, onChange:(e:Event)=>addToNotes.value=(e.target as HTMLInputElement).checked }), destination.value === "resume" ? "新建简历将自动使用全部其他信息" : "添加到个人信息备注（保留已有备注）"]),
                ]) : null,
                h("h3", "4 · 确认导入"),
                h("p", destination.value === "profile" ? "仅将勾选字段放入个人资料草稿；之后仍需在个人信息页单独保存。" : "将创建一个独立简历版本，现有版本保持不变。"),
                h("p", { class:"notice" }, destination.value === "resume" ? "已知分类将按网站现有简历模板放置；未匹配信息会在创建时由AI自动安排到合适板块。" : "个人资料方向只处理下方有限分类勾选。"),
                h("button", { type:"button", "data-testid":"import-save-review", disabled:saving.value || source.value!==groupedSource.value, onClick:savePending }, "保存识别结果与修改"),
                h("button", { class:"primary", type:"button", "data-testid":"import-confirm", disabled:saving.value || props.disabled || !destination.value || source.value!==groupedSource.value || (destination.value === "profile" && (!selected.value.length && !selectedPhotos.value.length && !(addToNotes.value && extraInformation.value))), onClick:confirmDestination }, saving.value ? "正在处理…" : destination.value==="profile" ? "确认放入个人资料草稿" : "确认并创建独立简历版本"),
                createdResume.value
                  ? h("div", { class: "import-success", role: "status", "data-testid": "import-success" }, [
                      h("strong", "已创建独立简历版本"),
                      h("p", "原有版本未改动。可以现在前往简历工作室继续编辑这份新简历。"),
                      h("button", {
                        class: "primary",
                        type: "button",
                        onClick: () => {
                          try { localStorage.setItem("zg.resumeOpenId", createdResume.value!.id); } catch {}
                          window.location.hash = "#resume";
                        },
                      }, "前往简历工作室"),
                    ])
                  : null,
              ])
            : null,
          error.value
            ? h("p", { class: "error", role: "alert" }, error.value)
            : null,
          notice.value
            ? h("p", { class: "notice", role: "status" }, notice.value)
            : null,
          h("div", { class:"pending-drafts" }, [
            pendingDrafts.value.map((d:any) => h("button", { type:"button", "data-testid":"import-draft-open", "data-draft-id":d.id, onClick:()=>chooseDraft(d.id) }, "恢复待确认草稿 " + d.id.slice(0,8))),
            pendingId.value ? h("button", { type:"button", "data-testid":"import-draft-delete", onClick:deletePending }, "删除待确认草稿") : null,
          ]),
          h("small", "待确认内容保存在账号私有的服务器草稿中，可刷新后恢复；草稿不会自动过期。只有确认放入个人资料草稿并另行点击资料保存，或确认创建独立版本后，才会写入对应资料/简历。"),
        ],
      );
  },
});
