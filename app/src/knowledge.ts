import { defineComponent, h } from "vue";
import { useLearning, learningFilters, learningScopes, learningFeedback, sourceInfo, statusLabel } from "./learning-model";
export default defineComponent({
  setup() {
    const m = useLearning();
    return () => h("div", {class:"learning-page",'data-testid':'knowledge-page'}, [
      h("header",{class:"learning-heading"},[h("span",{class:"eyebrow"},"BUILD YOUR FOUNDATION"),h("h1","面经与八股"),h("p","按方向查找真实收录的题目，核对来源，再加入自己的学习节奏。"),h("a",{href:"#practice",class:"learning-link"},"进入学习与刷题 →")]),
      h("section",{class:"card"},[learningFilters(m),learningScopes(m)]),
      ...learningFeedback(m),
      h("p",{role:"status",class:"learning-result-count"},m.loading.value ? "正在查找题目…" : "共 " + m.total.value + " 道题 · 第 " + m.page.value + " / " + m.pages.value + " 页"),
      !m.loading.value && !m.error.value && !m.questions.value.length ? h("section",{class:"card empty",'data-testid':'learning-empty'},[h("h2","当前范围暂无题目"),h("p","试试其他关键词或方向。收藏与待复习中只会显示你主动标记的题目。"),h("button",{onClick:m.reset},"查看全部题目")]) : null,
      h("div",{class:"learning-catalog",'aria-busy':m.loading.value},m.questions.value.map(question=>h("article",{class:"card learning-row",key:question.id,'data-question-id':question.id},[
        h("div",{class:"learning-tags"},[h("span",question.direction),h("span",question.category),h("span",statusLabel(question.state.status)),question.importance ? h("span","重要度："+question.importance) : null]),
        h("h2",{class:"learning-question"},question.question),sourceInfo(question),
        h("div",{class:"learning-actions"},[h("button",{class:"primary",disabled:m.saving.value,onClick:()=>m.studyQuestion(question)},"学习此题"),h("button",{'aria-label':question.state.favorite ? "取消收藏" : "收藏",'aria-pressed':question.state.favorite,disabled:m.saving.value,onClick:()=>m.save(question,{favorite:!question.state.favorite})},question.state.favorite ? "★ 已收藏" : "☆ 收藏")])
      ]))),
      h("nav",{class:"learning-pagination","aria-label":"题库分页"},[h("button",{disabled:m.loading.value || m.saving.value || m.page.value<=1,onClick:()=>{m.page.value--;void m.load();}},"上一页"),h("span",m.page.value+" / "+m.pages.value),h("button",{disabled:m.loading.value || m.saving.value || m.page.value>=m.pages.value,onClick:()=>{m.page.value++;void m.load();}},"下一页")]),
      h("p",{class:"learning-disclaimer"},"题目与答题要点来自已收录资料，可能存在时效或准确性限制，请结合原始来源核对。")
    ]);
  }
});
