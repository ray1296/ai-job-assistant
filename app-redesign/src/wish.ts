import { defineComponent, h, ref, computed, reactive, onMounted } from "vue";
import { api, errorText } from "./api";

type Wish = { id: string; text: string; done: boolean; status: "pending" | "approved" | "rejected"; reviewNote: string; sortOrder: number; createdAt: number; mine: boolean; canWithdraw: boolean };
export default defineComponent({
  setup() {
    const items = ref<Wish[]>([]);
    const text = ref("");
    const busy = ref(false);
    const loading = ref(true);
    const error = ref("");
    const notice = ref("");
    const expanded = reactive<Record<string, boolean>>({});
    const pending = computed(() => items.value.filter((x) => x.status === "pending").length);
    const approved = computed(() => items.value.filter((x) => x.status === "approved").length);

    async function load() {
      loading.value = true;
      error.value = "";
      try {
        const r = await api<any>("/wishes", "GET", undefined, { timeoutMs: 15000 });
        items.value = Array.isArray(r.items) ? r.items : [];
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
        notice.value = "已提交，等待管理员审核；审核前可以撤销。";
        await load();
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function withdraw(item: Wish) {
      if (!item.canWithdraw || busy.value) return;
      if (!confirm("撤销这条待审核心愿？")) return;
      busy.value = true;
      try {
        await api("/wishes/" + item.id, "DELETE");
        notice.value = "已撤销待审核心愿。";
        await load();
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    onMounted(load);

    function statusLabel(s: string) {
      return s === "approved" ? "已采纳" : s === "rejected" ? "已退回" : "审核中";
    }
    function body(item: Wish) {
      const long = item.text.length > 160;
      const show = !long || expanded[item.id];
      const value = show ? item.text : item.text.slice(0, 160) + "…";
      return h("div", { class: "wish-body" }, [
        h("strong", value),
        long ? h("button", { class: "wish-expand", onClick: () => (expanded[item.id] = !expanded[item.id]) }, show ? "收起" : "展开全文") : null,
        h("small", [
          "#" + String(items.value.indexOf(item) + 1).padStart(2, "0"),
          item.mine ? " · 我提交的" : "",
          " · " + statusLabel(item.status),
          item.reviewNote ? " · 管理员：" + item.reviewNote : "",
        ]),
      ]);
    }

    return () => h("div", { class: "wish-page" }, [
      h("div", { class: "scene-heading" }, [
        h("span", { class: "eyebrow" }, "WISH POOL"),
        h("h1", "心愿池"),
        h("p", "把希望网站增加的功能、想改的地方写下来。提交后先审核，采纳后才公开展示。"),
      ]),
      h("div", { class: "wish-stats" }, [
        h("span", "待审核 " + pending.value),
        h("span", "已采纳 " + approved.value),
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
          h("button", { class: "primary", disabled: busy.value || !text.value.trim(), onClick: () => void add() }, busy.value ? "提交中…" : "提交审核"),
        ]),
        h("p", { class: "wish-help" }, "审核通过前你可以撤销；通过后不能删除。不会公开展示你的邮箱。"),
      ]),
      loading.value ? h("p", { role: "status" }, "正在读取心愿池…") : null,
      !loading.value
        ? h("section", { class: "wish-list" }, [
            items.value.length
              ? items.value.map((item) => h("article", { key: item.id, class: "wish-item " + item.status }, [
                  h("span", { class: "wish-status " + item.status }, statusLabel(item.status)),
                  body(item),
                  item.canWithdraw ? h("button", { class: "wish-withdraw", onClick: () => void withdraw(item) }, "撤销") : null,
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
