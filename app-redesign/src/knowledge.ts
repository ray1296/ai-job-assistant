import { defineComponent, h, onMounted, ref } from "vue";
import { api, errorText } from "./api";
import { useLearning, learningFilters, learningFeedback, sourceInfo } from "./learning-model";

type Uploaded = { id: string; stem: string; answer: string; analysis: string; source: string; subject: string; version: string; createdAt: number };

/**
 * 面经八股：
 * - 上半部分是平台策展题库（/questions，来自 data/learning-catalog.json）
 * - 下半部分是「我上传的题库」（/study/uploads），直接从 上传题库 上传的内容读取，
 *   所以上传之后不用切换页面，这里就能看到（修掉 uploaded → 面经 不同步的问题）。
 */
export default defineComponent({
  setup() {
    const m = useLearning();
    const up = ref<Uploaded[]>([]);
    const upTotal = ref(0);
    const upPage = ref(1);
    const upPages = ref(1);
    const upQ = ref("");
    const upLoading = ref(false);
    const upError = ref("");
    let upSeq = 0;

    async function loadUploaded(page = 1) {
      const seq = ++upSeq;
      upLoading.value = true;
      upError.value = "";
      try {
        const params = new URLSearchParams({ q: upQ.value.trim(), page: String(page), pageSize: "10" });
        const data = await api<{ questions: Uploaded[]; total: number; page: number; pages: number }>("/study/uploads?" + params, "GET");
        if (seq !== upSeq) return;
        up.value = data.questions;
        upTotal.value = data.total;
        upPage.value = data.page;
        upPages.value = data.pages;
      } catch (e) {
        if (seq === upSeq) upError.value = errorText(e);
      } finally {
        if (seq === upSeq) upLoading.value = false;
      }
    }
    const upSearch = (e: Event) => {
      e.preventDefault();
      void loadUploaded(1);
    };
    onMounted(() => void loadUploaded(1));

    return () =>
      h("div", { class: "learning-page", "data-testid": "knowledge-page" }, [
        h("header", { class: "learning-heading" }, [
          h("span", { class: "eyebrow" }, "BUILD YOUR FOUNDATION"),
          h("h1", "面经八股"),
          h("p", "按方向查找真实收录的题目、核对来源；上传题库里的内容也会出现在本页下方。"),
        ]),
        h("section", { class: "card" }, [learningFilters(m)]),
        ...learningFeedback(m),
        h("p", { role: "status", class: "learning-result-count" }, m.loading.value ? "正在查找题目…" : "平台题库共 " + m.total.value + " 道题 · 第 " + m.page.value + " / " + m.pages.value + " 页"),
        !m.loading.value && !m.error.value && !m.questions.value.length
          ? h("section", { class: "card empty", "data-testid": "learning-empty" }, [
              h("h2", "当前范围暂无题目"),
              h("p", "试试其他关键词或方向。学习与收藏请到「学习刷题」板块。"),
              h("button", { onClick: m.reset }, "查看全部题目"),
            ])
          : null,
        h(
          "div",
          { class: "learning-catalog", "aria-busy": m.loading.value },
          m.questions.value.map((question) =>
            h("article", { class: "card learning-row", key: question.id, "data-question-id": question.id }, [
              h("div", { class: "learning-tags" }, [
                h("span", question.direction),
                h("span", question.category),
                question.importance ? h("span", "重要度：" + question.importance) : null,
              ]),
              h("h2", { class: "learning-question" }, question.question),
              sourceInfo(question),
            ]),
          ),
        ),
        h("nav", { class: "learning-pagination", "aria-label": "题库分页" }, [
          h("button", { disabled: m.loading.value || m.saving.value || m.page.value <= 1, onClick: () => { m.page.value--; void m.load(); } }, "上一页"),
          h("span", m.page.value + " / " + m.pages.value),
          h("button", { disabled: m.loading.value || m.saving.value || m.page.value >= m.pages.value, onClick: () => { m.page.value++; void m.load(); } }, "下一页"),
        ]),
        h("p", { class: "learning-disclaimer" }, "题目与答题要点来自已收录资料，可能存在时效或准确性限制，请结合原始来源核对。"),

        h("section", { class: "card uploaded-bank", "data-testid": "uploaded-bank" }, [
          h("div", { class: "uploaded-bank-head" }, [
            h("div", null, [
              h("h2", "我上传的题库"),
              h("p", upTotal.value ? "共 " + upTotal.value + " 道，来自「上传题库」板块，上传后立即同步到这里。" : "还没有上传过题库。到「上传题库」上传后，题目会自动同步到本页。"),
            ]),
            h("form", { class: "uploaded-bank-search", onSubmit: upSearch }, [
              h("input", {
                type: "search",
                value: upQ.value,
                placeholder: "搜索我上传的题目",
                maxlength: 100,
                disabled: upLoading.value,
                onInput: (e: Event) => (upQ.value = (e.target as HTMLInputElement).value),
              }),
              h("button", { type: "submit", class: "primary", disabled: upLoading.value }, "搜索"),
            ]),
          ]),
          upError.value
            ? h("div", { class: "error", role: "alert" }, [upError.value, h("button", { onClick: () => void loadUploaded(upPage.value) }, "重新加载")])
            : null,
          upLoading.value ? h("p", { role: "status", class: "learning-result-count" }, "正在读取上传的题库…") : null,
          h(
            "div",
            { class: "learning-catalog" },
            up.value.map((item) =>
              h("article", { class: "card learning-row", key: item.id, "data-uploaded-id": item.id }, [
                h("div", { class: "learning-tags" }, [h("span", item.subject), h("span", item.version)]),
                h("h2", { class: "learning-question" }, item.stem),
                item.answer ? h("p", { class: "uploaded-answer" }, item.answer) : null,
                h("div", { class: "learning-source" }, [
                  h("span", "来源：" + (item.source || item.subject)),
                  h("span", "上传于 " + new Date(item.createdAt).toLocaleDateString()),
                ]),
              ]),
            ),
          ),
          upPages.value > 1
            ? h("nav", { class: "learning-pagination", "aria-label": "我上传的题库分页" }, [
                h("button", { disabled: upLoading.value || upPage.value <= 1, onClick: () => void loadUploaded(upPage.value - 1) }, "上一页"),
                h("span", upPage.value + " / " + upPages.value),
                h("button", { disabled: upLoading.value || upPage.value >= upPages.value, onClick: () => void loadUploaded(upPage.value + 1) }, "下一页"),
              ])
            : null,
        ]),
      ]);
  },
});
