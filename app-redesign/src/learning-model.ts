import { ref, computed, onMounted, onBeforeUnmount, watch, h } from "vue";
import { api, ApiError, session, errorText } from "./api";
export type Status = "unseen" | "review" | "mastered";
export type Scope = "all" | "favorites" | "review" | "mastered";
export interface QuestionState { favorite: boolean; status: Status; attempts: number; revision: number }
export interface Question { id: string; direction: string; category: string; question: string; answer: string | null; answerSource?: string | null; importance?: string | number; source: string; sourceUrl: string; publishedAt?: string; state: QuestionState }
export const statusLabel = (s: Status) => ({ unseen: "未学习", review: "待复习", mastered: "已掌握" })[s];
type Entry = { account: string; id: string; q: string; direction: string; category: string; scope: Scope; page: number };
let entry: Entry | undefined;
export function useLearning(study = false) {
  const account = session.user?.id;
  const start = study && entry?.account === account ? entry : undefined;
  if (study) entry = undefined;
  const q = ref(start?.q || ""), direction = ref(start?.direction || ""), category = ref(start?.category || ""), scope = ref<Scope>(start?.scope || "all"), page = ref(start?.page || 1);
  const questions = ref<Question[]>([]), total = ref(0), index = ref(0), revealed = ref(false), loading = ref(false), saving = ref(false), error = ref(""), notice = ref("");
  const directions = ref<string[]>([]), categories = ref<string[]>([]), summary = ref<Record<string, number> | null>(null), metaError = ref("");
  const selected = computed(() => questions.value[index.value]);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / 12)));
  let alive = true, seq = 0, metaSeq = 0, active: AbortController | undefined;
  const controllers = new Set<AbortController>();
  const current = () => alive && !!account && session.user?.id === account;
  function controller() { const c = new AbortController(); controllers.add(c); return c; }
  function stop() { alive = false; seq++; metaSeq++; controllers.forEach(c => c.abort()); questions.value = []; summary.value = null; }
  watch(() => session.user?.id, id => { if (id !== account) stop(); });
  onBeforeUnmount(stop);
  async function load(preferId?: string, last = false) {
    if (!current() || saving.value) return;
    const version = ++seq; active?.abort(); const c = controller(); active = c;
    loading.value = true; error.value = ""; revealed.value = false; questions.value = [];
    try {
      const params = new URLSearchParams({ q: q.value.trim(), direction: direction.value, category: category.value, scope: scope.value, page: String(page.value), pageSize: "12" });
      const data = await api<{questions: Question[]; total: number; page: number; pageSize: number}>("/questions?" + params, "GET", undefined, { signal: c.signal });
      if (!current() || version !== seq) return;
      total.value = data.total; page.value = data.page;
      if (!data.questions.length && data.total && page.value > 1) { page.value = Math.max(1, Math.ceil(data.total / 12)); await load(); return; }
      questions.value = data.questions;
      index.value = last ? Math.max(0, data.questions.length - 1) : Math.max(0, data.questions.findIndex(v => v.id === preferId));
    } catch (e) { if (current() && version === seq && !c.signal.aborted) error.value = errorText(e); }
    finally { controllers.delete(c); if (current() && version === seq) loading.value = false; }
  }
  const values = (items: any[]) => (items || []).map(v => typeof v === "string" ? v : v.value ?? v.name).filter(Boolean) as string[];
  async function metadata() {
    if (!current()) return;
    const version = ++metaSeq, c = controller(); metaError.value = "";
    try {
      const [facets, counts] = await Promise.all([api("/questions/facets", "GET", undefined, {signal:c.signal}), api("/learning/summary", "GET", undefined, {signal:c.signal})]);
      if (!current() || version !== metaSeq) return;
      directions.value = values(facets.directions); categories.value = values(facets.categories); summary.value = counts;
    } catch(e) { if(current() && version === metaSeq && !c.signal.aborted) metaError.value = errorText(e); }
    finally { controllers.delete(c); }
  }
  async function save(question: Question, patch: {favorite?: boolean; status?: Status}) {
    if (!current() || saving.value || loading.value) return;
    saving.value = true; error.value = ""; notice.value = "";
    const c = controller(); const id = question.id; const wasRevealed = revealed.value;
    try {
      const result = await api<{question: Question}>("/questions/" + encodeURIComponent(id) + "/state", "PUT", {...patch, revision: question.state.revision}, {signal:c.signal});
      if (!current()) return;
      question.state = result.question.state;
      notice.value = "已保存到当前账号";
      saving.value = false;
      await Promise.all([load(id), metadata()]);
      if (current() && selected.value?.id === id && patch.status === undefined) revealed.value = wasRevealed;
    } catch(e) {
      if (!current() || c.signal.aborted) return;
      if(e instanceof ApiError && e.status === 409) {
        saving.value = false; await load(id);
        error.value = "这道题的学习状态已在其他页面更新，已重新载入。请核对后再操作。";
      } else error.value = errorText(e) + "；本次操作未确认保存，可重试。";
    } finally { controllers.delete(c); if(current()) saving.value = false; }
  }
  function filters() { page.value = 1; notice.value = ""; void load(); }
  function reset() { q.value = ""; direction.value = ""; category.value = ""; scope.value = "all"; filters(); }
  function move(delta: number) {
    if(loading.value || saving.value) return;
    const next = index.value + delta;
    if(next >= 0 && next < questions.value.length) { index.value = next; revealed.value = false; notice.value = ""; }
    else if(page.value + delta >= 1 && page.value + delta <= pages.value) { page.value += delta; void load(undefined, delta < 0); }
  }
  function shuffle() {
    if(saving.value || loading.value) return;
    const items = [...questions.value];
    for(let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j]!, items[i]!]; }
    questions.value = items; index.value = 0; revealed.value = false; notice.value = "已打乱当前页题序";
  }
  function studyQuestion(question: Question) {
    entry = { account: account!, id: question.id, q:q.value, direction:direction.value, category:category.value, scope:scope.value, page:page.value };
    location.hash = "practice";
  }
  onMounted(() => { void load(start?.id); void metadata(); });
  return {q,direction,category,scope,page,questions,total,index,revealed,loading,saving,error,notice,directions,categories,summary,metaError,selected,pages,load,metadata,save,filters,reset,move,shuffle,studyQuestion};
}
export function sourceInfo(q: Question) {
  let safe = false; try { const url = new URL(q.sourceUrl); safe = ["http:","https:"].includes(url.protocol) && !url.username && !url.password && !/[\u0000-\u0020\u007f]/.test(q.sourceUrl); } catch {}
  const ai = /AI/i.test(String(q.answerSource || ""));
  return h("div", {class:"learning-source"}, [h("span", "来源：" + (q.source || "未注明")), q.answerSource ? h("span", {class:"answer-source-badge" + (ai ? " ai" : "")}, ai ? "AI 生成答案" : "原文有答案") : null, q.publishedAt ? h("span", "发布时间：" + q.publishedAt) : null, safe ? h("a", {href:q.sourceUrl,target:"_blank",rel:"noopener noreferrer"}, "查看原始来源 ↗") : h("span", "未提供可访问的原始链接")]);
}
export function learningFilters(m: ReturnType<typeof useLearning>) {
  const select = (label: string, key: "direction" | "category", items: string[]) => h("label", [label, h("select", {"aria-label":label,value:m[key].value, disabled:m.saving.value, 'data-testid':'learning-'+key,onChange:(e:Event)=>{m[key].value=(e.target as HTMLSelectElement).value;m.filters();}}, [h("option",{value:""},"全部"),...items.map(v=>h("option",{value:v},v))])]);
  return h("form", {class:"learning-filters",onSubmit:(e:Event)=>{e.preventDefault();m.filters();}}, [h("label", {class:"learning-search"}, ["搜索题目",h("input",{type:"search",value:m.q.value,placeholder:"例如：事务、闭包、测试策略",maxlength:100,'data-testid':'learning-search',disabled:m.saving.value,onInput:(e:Event)=>m.q.value=(e.target as HTMLInputElement).value})]),select("题目方向","direction",m.directions.value),select("题目分类","category",m.categories.value),h("button",{type:"submit",class:"primary",disabled:m.saving.value},"搜索"),h("button",{type:"button",disabled:m.saving.value,onClick:m.reset},"重置")]);
}
export function learningScopes(m: ReturnType<typeof useLearning>) {
  return h("div",{class:"learning-scopes",role:"group","aria-label":"题库范围"},([["all","全部题目"],["review","待复习 / 错题"],["favorites","我的收藏"],["mastered","已掌握"]] as [Scope,string][]).map(([value,label])=>h("button",{type:"button",'data-testid':'scope-'+value,'aria-pressed':m.scope.value===value,disabled:m.saving.value,onClick:()=>{m.scope.value=value;m.filters();}},label)));
}
export function learningFeedback(m: ReturnType<typeof useLearning>) {
  return [m.error.value ? h("div",{class:"error",role:"alert",'data-testid':'learning-error'},[m.error.value,h("button",{disabled:m.saving.value,onClick:()=>m.load()},"重新加载")]) : null,m.notice.value ? h("p",{class:"notice",role:"status"},m.notice.value) : null,m.metaError.value ? h("div",{class:"notice",role:"alert"},["筛选项或学习统计加载失败："+m.metaError.value,h("button",{onClick:m.metadata},"重试统计")]) : null];
}
