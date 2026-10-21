import { defineComponent, h } from "vue";
import { useLearning, learningFilters, learningScopes, learningFeedback, sourceInfo, statusLabel } from "./learning-model";
export default defineComponent({
  setup() {
    const m = useLearning(true);
    return () => {
      const question = m.selected.value;
      const locked = m.saving.value || m.loading.value;
      const counts = m.summary.value;
      return h("div",{class:"learning-page",'data-testid':'practice-page'},[
        h("header",{class:"learning-heading"},[h("span",{class:"eyebrow"},"A LITTLE PROGRESS, EVERY DAY"),h("h1","学习与刷题"),h("p","先想一想，再查看答题要点。用自己的判断记录掌握程度。"),h("a",{href:"#knowledge",class:"learning-link"},"返回面经题库 →")]),
        counts ? h("section",{class:"learning-summary","aria-label":"我的学习进度"},[["total","题库总数"],["mastered","已掌握"],["review","待复习"],["favorites","已收藏"],["attempts","自评次数"]].map(([key,label])=>h("div",[h("strong",String(counts[key!] ?? 0)),h("span",label)]))) : null,
        h("section",{class:"card"},[learningFilters(m),learningScopes(m)]),...learningFeedback(m),
        m.loading.value ? h("p",{role:"status"},"正在加载学习卡片…") : null,
        !m.loading.value && !m.error.value && !question ? h("section",{class:"card empty",'data-testid':'learning-empty'},[h("h2","当前范围暂无题目"),h("p","先从全部题目学习，并将不熟悉的内容自评为待复习。"),h("button",{onClick:m.reset},"查看全部题目")]) : null,
        question ? h("article",{class:"card study-card",'data-question-id':question.id,'aria-busy':m.saving.value},[
          h("div",{class:"learning-card-top"},[h("span",{role:"status"},"当前范围 "+m.total.value+" 题 · 第 "+((m.page.value-1)*12+m.index.value+1)+" 题"),h("button",{'aria-label':question.state.favorite ? "取消收藏" : "收藏",'aria-pressed':question.state.favorite,disabled:locked,onClick:()=>m.save(question,{favorite:!question.state.favorite})},question.state.favorite ? "★ 已收藏" : "☆ 收藏")]),
          h("div",{class:"learning-tags"},[h("span",question.direction),h("span",question.category),h("span",statusLabel(question.state.status))]),
          h("h2",{class:"learning-question",tabindex:-1},question.question),
          h("p",{class:"learning-self-note"},"先尝试口述思路，再展开参考要点。"),
          h("button",{class:"primary",'aria-expanded':m.revealed.value,'aria-controls':'study-answer',disabled:locked,onClick:()=>m.revealed.value=!m.revealed.value},m.revealed.value ? "收起答案" : "显示答案"),
          m.revealed.value ? h("section",{id:"study-answer",role:"region","aria-label":"答题要点",class:"study-answer"},[h("h3","答题要点"),h("div",{class:"learning-answer-text"},question.answer || "未提供答题要点"),sourceInfo(question)]) : sourceInfo(question),
          h("div",{class:"learning-self-assessment"},[h("p","自评记录，不自动判分。待复习 / 错题由你主动标记，查看答案不会增加自评次数。"),h("div",{class:"learning-actions"},[h("button",{disabled:locked || !m.revealed.value,'data-testid':'assess-review',onClick:()=>m.save(question,{status:"review"})},"自评待复习"),h("button",{disabled:locked || !m.revealed.value,'data-testid':'assess-mastered',onClick:()=>m.save(question,{status:"mastered"})},"自评已掌握"),h("button",{disabled:locked || question.state.status==="unseen",onClick:()=>m.save(question,{status:"unseen"})},"重置为未学习")]),h("small","已自评 "+question.state.attempts+" 次；服务端保存，刷新后保留学习状态。")]),
          h("nav",{class:"learning-study-nav","aria-label":"切换学习题目"},[h("button",{disabled:locked || (m.page.value===1 && m.index.value===0),onClick:()=>m.move(-1)},"上一题"),h("button",{disabled:locked || m.questions.value.length<2,onClick:m.shuffle},"打乱本页题序"),h("button",{disabled:locked || (m.page.value>=m.pages.value && m.index.value>=m.questions.value.length-1),onClick:()=>m.move(1)},"下一题")])
        ]) : null,
        h("p",{class:"learning-disclaimer"},"学习状态仅对当前账号可见。参考要点来自收录资料，请核对原始来源。")
      ]);
    };
  }
});
