import { defineComponent, h, ref, computed, onMounted } from "vue";
import { api, errorText } from "./api";

type Wish = { id: string; text: string; done: boolean; sortOrder: number; createdAt: number; mine: boolean };
export default defineComponent({
  setup() {
    const items = ref<Wish[]>([]);
    const text = ref("");
    const busy = ref(false);
    const loading = ref(true);
    const error = ref("");
    const notice = ref("");
    const canManage = ref(false);
    const pending = computed(() => items.value.filter((x) => !x.done).length);
    const done = computed(() => items.value.filter((x) => x.done).length);

    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await api<any>("/wishes", "GET", undefined, { timeoutMs: 15000 });
        items.value = Array.isArray(r.items) ? r.items : [];
        canManage.value = !!r.canManage;
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }
    async function add() {
      const value = text.value.trim();
      if (!value || busy.value) return;
      busy.value = true;
      error.value = "";
      notice.value = "";
      try {
        await api("/wishes", "POST", { text: value }, { timeoutMs: 15000 });
        text.value = "";
        notice.value = "已放进心愿池，管理员会看到。";
        await load();
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function toggle(item: Wish) {
      if (!canManage.value || busy.value) return;
      busy.value = true;
      try {
        await api("/wishes/" + item.id, "PATCH", { done: !item.done });
        await load();
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    onMounted(load);

    return () => h("div", { class: "wish-page" }, [
      h("div", { class: "scene-heading" }, [
        h("span", { class: "eyebrow" }, "WISH POOL"),
        h("h1", "心愿池"),
        h("p", "把希望网站增加的功能、想改的地方写下来。只收集建议，不做论坛和评论。"),
      ]),
      h("div", { class: "wish-stats" }, [
        h("span", "待处理 " + pending.value),
        h("span", "已完成 " + done.value),
        h("a", { href: "#home" }, "返回工作台"),
      ]),
      error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
      notice.value ? h("p", { class: "wish-notice", role: "status" }, notice.value) : null,
      h("section", { class: "card wish-add" }, [
        h("h2", "写下你的心愿"),
        h("div", { class: "wish-add-row" }, [
          h("input", {
            value: text.value,
            maxlength: 500,
            placeholder: "例如：希望岗位列表支持按远程筛选",
            onInput: (e: Event) => (text.value = (e.target as HTMLInputElement).value),
            onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void add(); } },
          }),
          h("button", { class: "primary", disabled: busy.value || !text.value.trim(), onClick: () => void add() }, busy.value ? "提交中…" : "放进心愿池"),
        ]),
        h("p", { class: "wish-help" }, "不需要登录别人的账号，也不会公开展示你的邮箱；管理员只能看到建议内容。"),
      ]),
      loading.value ? h("p", { role: "status" }, "正在读取心愿池…") : null,
      !loading.value
        ? h("section", { class: "wish-list" }, [
            items.value.length
              ? items.value.map((item, i) => h("article", { key: item.id, class: "wish-item" + (item.done ? " done" : "") }, [
                  h("button", {
                    class: "wish-check" + (item.done ? " on" : ""),
                    disabled: !canManage.value,
                    title: canManage.value ? "标记完成" : "管理员可标记完成",
                    onClick: () => void toggle(item),
                  }, item.done ? "✓" : ""),
                  h("div", { class: "wish-body" }, [
                    h("strong", item.text),
                    h("small", "#" + String(i + 1).padStart(2, "0") + (item.mine ? " · 我提交的" : "") + (item.done ? " · 已完成" : " · 待处理")),
                  ]),
                ]))
              : h("div", { class: "wish-empty" }, [
                  h("h2", "心愿池还是空的"),
                  h("p", "第一个心愿，可能就会变成下一个功能。"),
                ]),
          ])
        : null,
    ]);
  },
});
