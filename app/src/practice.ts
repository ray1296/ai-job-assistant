import { defineComponent, h, ref, watch, onBeforeUnmount } from "vue";
import { api, errorText } from "./api";
import { useLearning, learningFilters, learningScopes, learningFeedback, sourceInfo, statusLabel } from "./learning-model";
type Kind = "summary" | "choice" | "judgment" | "cloze" | "code";
interface Generated { kind: Kind; content: string; source: string; provider?: string; model?: string }
const kinds: { kind: Kind; label: string }[] = [{kind:"summary",label:"AI简化"},{kind:"choice",label:"生成选择题"},{kind:"judgment",label:"生成判断题"},{kind:"cloze",label:"生成填空题"},{kind:"code",label:"生成代码题"}];
export default defineComponent({
  setup() {
    const m = useLearning(true), face = ref<"question"|"ai"|"source">("question"), generated = ref<Generated|null>(null), generating = ref(false), generateError = ref(""), selectedId = ref<string|undefined>();
    const cache = new Map<string, Generated[]>();
    let request = 0;
    async function loadGenerated(id: string) {
      const token=request;
      if (cache.has(id)) { generated.value=cache.get(id)?.at(-1)||null; return; }
      try { const data=await api<{items:Generated[]}>(`/questions/${encodeURIComponent(id)}/generated`); cache.set(id,data.items||[]); if (selectedId.value===id && token===request) generated.value=cache.get(id)?.at(-1)||null; } catch { cache.set(id,[]); }
    }
    watch(()=>m.selected.value?.id, id=>{
      selectedId.value=id; face.value="question"; generated.value=null; generateError.value=""; request++;
      if (id) void loadGenerated(id);
    },{immediate:true});
    onBeforeUnmount(()=>{request++; selectedId.value=undefined;});
    async function generate(kind: Kind) {
      const question=m.selected.value; if (!question || generating.value) return;
      const id=question.id, cached=cache.get(id)?.find(item=>item.kind===kind);
      if (cached) { generated.value=cached; face.value="ai"; return; }
      const token=++request; generating.value=true; generateError.value="";
      try { const result=await api<Generated>(`/questions/${encodeURIComponent(id)}/generate`,"POST",{kind},{timeoutMs:120000});
        if (selectedId.value!==id || token!==request) return;
        if (!result || result.kind!==kind || typeof result.content!=="string" || typeof result.source!=="string") throw new Error("生成结果格式无效");
        const items=cache.get(id)||[]; cache.set(id,[...items.filter(item=>item.kind!==kind),result]); generated.value=result; face.value="ai";
      } catch(e) { if (selectedId.value===id && token===request) generateError.value=errorText(e); } finally { generating.value=false; }
    }
    return () => {
      const question=m.selected.value, locked=m.saving.value||m.loading.value||generating.value, counts=m.summary.value;
      return h("div",{class:"learning-page practice-page",'data-testid':'practice-page'},[
        h("header",{class:"learning-heading"},[h("span",{class:"eyebrow"},"A LITTLE PROGRESS, EVERY DAY"),h("h1","学习与刷题"),h("p","先想一想，再查看答题要点。用自己的判断记录掌握程度。"),h("a",{href:"#knowledge",class:"learning-link"},"返回面经题库 →")]),
        counts ? h("section",{class:"learning-summary","aria-label":"我的学习进度"},[["total","题库总数"],["mastered","已掌握"],["review","待复习"],["favorites","已收藏"],["attempts","自评次数"]].map(([key,label])=>h("div",[h("strong",String(counts[key!]??0)),h("span",label)]))) : null,
        h("section",{class:"card"},[learningFilters(m),learningScopes(m)]),...learningFeedback(m),
        m.loading.value ? h("p",{role:"status"},"正在加载学习卡片…") : null,
        !m.loading.value&&!m.error.value&&!question ? h("section",{class:"card empty"},[h("h2","当前范围暂无题目"),h("p","先从全部题目学习，并将不熟悉的内容自评为待复习。"),h("button",{onClick:m.reset},"查看全部题目")]) : null,
        question ? h("article",{class:"card practice-card",'data-question-id':question.id,'aria-busy':m.saving.value},[
          h("div",{class:"learning-card-top"},[h("span",{role:"status"},"当前范围 "+m.total.value+" 题 · 第 "+((m.page.value-1)*12+m.index.value+1)+" 题"),h("button",{'aria-label':question.state.favorite?"取消收藏":"收藏",'aria-pressed':question.state.favorite,disabled:locked,onClick:()=>m.save(question,{favorite:!question.state.favorite})},question.state.favorite?"★ 已收藏":"☆ 收藏")]),
          h("div",{class:"learning-tags"},[h("span",question.direction),h("span",question.category),h("span",statusLabel(question.state.status))]),
          h("div",{class:"practice-switch","role":"tablist","aria-label":"答题卡内容"},[["question","题目"],["ai","AI答案"],["source","原始答案"]].map(([id,label])=>h("button",{role:"tab",'aria-selected':face.value===id,class:face.value===id?"active":"",onClick:()=>face.value=id as typeof face.value},label))),
          h("nav",{class:"practice-arrows","aria-label":"翻转三面卡",onKeydown:(e:KeyboardEvent)=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"||e.key==="Home"){e.preventDefault();face.value=e.key==="Home"?"question":e.key==="ArrowLeft"?"ai":"source";}}},[h("button",{onClick:()=>face.value="ai","aria-label":"向左翻看AI参考答案"},"← AI参考答案"),h("button",{onClick:()=>face.value="question"},"正面 · 题目"),h("button",{onClick:()=>face.value="source","aria-label":"向右翻看来源完整答案"},"来源完整答案 →")]),
          h("div",{class:"practice-flip-stage",'data-face':face.value},[
            h("section",{class:"practice-face practice-front",'aria-hidden':face.value!=="question"},[h("span",{class:"practice-label"},"QUESTION / 正面"),h("h2",{class:"learning-question"},question.question),h("p",{class:"learning-self-note"},"先独立组织思路，再翻看答案。"),h("button",{class:"primary",onClick:()=>face.value="ai"},"翻看 AI 答案")]),
            h("section",{class:"practice-face practice-ai",'aria-hidden':face.value!=="ai"},[h("span",{class:"practice-label"},generated.value?"AI生成参考 · "+(kinds.find(k=>k.kind===generated.value?.kind)?.label||""):"AI简化参考"),generated.value?h("div",{class:"learning-answer-text"},generated.value.content):h("p",{class:"learning-answer-text"},"尚未生成简化内容。选择下方生成类型。"),h("p",{class:"practice-provenance"},"AI生成参考，来源："+(generated.value?.source||question.source)),h("div",{class:"practice-generators"},kinds.map(k=>h("button",{disabled:locked,onClick:()=>generate(k.kind)},k.label))),generateError.value?h("p",{class:"error",role:"alert"},generateError.value):null,h("button",{onClick:()=>face.value="source"},"查看来源完整答案 →")]),
            h("section",{class:"practice-face practice-source",'aria-hidden':face.value!=="source"},[h("span",{class:"practice-label"},"SOURCE / 收录原文"),h("h3","原始答案"),h("div",{class:"learning-answer-text"},question.answer||"本题未提供原始答案。"),sourceInfo(question),h("button",{onClick:()=>face.value="question"},"返回题目 ↶")])
          ]),
          h("div",{class:"learning-self-assessment"},[h("p","自评记录，不自动判分。查看答案不会增加自评次数。"),h("div",{class:"learning-actions"},[h("button",{disabled:locked||face.value==="question",'data-testid':'assess-review',onClick:()=>m.save(question,{status:"review"})},"自评待复习"),h("button",{disabled:locked||face.value==="question",'data-testid':'assess-mastered',onClick:()=>m.save(question,{status:"mastered"})},"自评已掌握"),h("button",{disabled:locked||question.state.status==="unseen",onClick:()=>m.save(question,{status:"unseen"})},"重置为未学习")]),h("small","已自评 "+question.state.attempts+" 次；服务端保存，刷新后保留学习状态。")]),
          h("nav",{class:"learning-study-nav","aria-label":"切换学习题目"},[h("button",{disabled:locked||(m.page.value===1&&m.index.value===0),onClick:()=>{m.move(-1);face.value="question";generated.value=null;}},"上一题"),h("button",{disabled:locked||m.questions.value.length<2,onClick:m.shuffle},"打乱本页题序"),h("button",{disabled:locked||(m.page.value>=m.pages.value&&m.index.value>=m.questions.value.length-1),onClick:()=>{m.move(1);face.value="question";generated.value=null;}},"下一题")])
        ]) : null,h("p",{class:"learning-disclaimer"},"学习状态仅对当前账号可见。原始答案来自收录资料；AI内容为生成结果，不替代来源。")]);
    };
  }
});
