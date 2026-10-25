import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { api, errorText, session, loadSession } from "./api";

type AdminUser = { id: string; email: string; role: "user" | "admin"; displayName?: string; createdAt: number; resumes: number; interviews: number };
type Wish = { id: string; text: string; done: boolean; sortOrder: number; createdAt: number; mine: boolean };
type Stats = any;

export default defineComponent({
  setup() {
    const tab = ref<"overview" | "users" | "wishes" | "system">("overview");
    const email = ref("");
    const password = ref("");
    const busy = ref(false);
    const error = ref("");
    const notice = ref("");
    const stats = ref<Stats | null>(null);
    const users = ref<AdminUser[]>([]);
    const wishes = ref<Wish[]>([]);
    const loading = ref(false);
    const userBusy = ref(false);
    const wishBusy = ref(false);
    const history = ref<Array<{ at: number; rss: number; requests: number; avg: number }>>([]);
    const editUser = ref<AdminUser | null>(null);
    const editEmail = ref("");
    const editDisplayName = ref("");
    const editRole = ref<"user" | "admin">("user");
    const resetInfo = ref<{ email: string; password: string } | null>(null);
    const wishDraft = ref("");
    const editingWish = ref<string | null>(null);
    const editingText = ref("");
    let timer = 0;
    let alive = true;

    const isAdmin = computed(() => session.user?.role === "admin");

    async function login() {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/auth/login", "POST", { email: email.value.trim(), password: password.value, role: "admin" });
        Object.assign(session, r);
        password.value = "";
        await loadAll();
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function logout() {
      try { await api("/auth/logout", "POST"); } catch {}
      session.user = null;
      session.csrf = null;
      stats.value = null;
      users.value = [];
      wishes.value = [];
    }
    async function loadStats() {
      const s = await api<Stats>("/admin/stats", "GET", undefined, { timeoutMs: 12000 });
      if (!alive) return;
      stats.value = s;
      history.value.push({ at: Date.now(), rss: s.memory.rss, requests: s.requests.total, avg: s.requests.avgMs });
      if (history.value.length > 60) history.value.shift();
    }
    async function loadUsers() {
      const r = await api<any>("/admin/users", "GET", undefined, { timeoutMs: 12000 });
      users.value = Array.isArray(r.users) ? r.users : [];
    }
    async function loadWishes() {
      const r = await api<any>("/wishes", "GET", undefined, { timeoutMs: 12000 });
      wishes.value = Array.isArray(r.items) ? r.items : [];
    }
    async function loadAll() {
      if (loading.value) return;
      loading.value = true;
      error.value = "";
      try {
        await loadSession();
        if (!isAdmin.value) return;
        await Promise.all([loadStats(), loadUsers(), loadWishes()]);
        window.clearInterval(timer);
        timer = window.setInterval(() => { if (alive && isAdmin.value) void loadStats().catch(() => {}); }, 5000);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }
    function openEdit(u: AdminUser) {
      editUser.value = u;
      editEmail.value = u.email;
      editDisplayName.value = u.displayName || "";
      editRole.value = u.role;
    }
    async function saveEdit() {
      if (!editUser.value) return;
      busy.value = true;
      error.value = "";
      try {
        await api("/admin/users/" + editUser.value.id, "PATCH", { email: editEmail.value.trim(), role: editRole.value, displayName: editDisplayName.value.trim() });
        editUser.value = null;
        notice.value = "账号信息已更新。";
        await loadUsers();
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function removeUser(u: AdminUser) {
      if (userBusy.value) return;
      if (!confirm("删除账号 " + u.email + "？该账号的私人数据会一并删除。")) return;
      userBusy.value = true;
      try {
        await api("/admin/users/" + u.id, "DELETE");
        notice.value = "账号已删除。";
        await loadUsers();
      } catch (e) { error.value = errorText(e); }
      finally { userBusy.value = false; }
    }
    async function resetPassword(u: AdminUser) {
      if (userBusy.value) return;
      if (!confirm("重置 " + u.email + " 的密码？旧密码会立即失效。")) return;
      userBusy.value = true;
      try {
        const r = await api<any>("/admin/users/" + u.id + "/reset-password", "POST");
        resetInfo.value = { email: u.email, password: String(r.password || "") };
        await loadUsers();
      } catch (e) { error.value = errorText(e); }
      finally { userBusy.value = false; }
    }
    async function addWish() {
      const text = wishDraft.value.trim();
      if (!text || busy.value) return;
      busy.value = true;
      try {
        await api("/wishes", "POST", { text });
        wishDraft.value = "";
        await loadWishes();
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function saveWish(w: Wish, patch: any) {
      if (wishBusy.value) return;
      wishBusy.value = true;
      try {
        await api("/wishes/" + w.id, "PATCH", patch);
        await loadWishes();
      } catch (e) { error.value = errorText(e); }
      finally { wishBusy.value = false; }
    }
    async function removeWish(w: Wish) {
      if (wishBusy.value) return;
      if (!confirm("删除这条心愿？")) return;
      wishBusy.value = true;
      try { await api("/wishes/" + w.id, "DELETE"); await loadWishes(); }
      catch (e) { error.value = errorText(e); }
      finally { wishBusy.value = false; }
    }
    async function moveWish(index: number, delta: number) {
      if (wishBusy.value) return;
      const next = wishes.value.slice();
      const j = index + delta;
      if (j < 0 || j >= next.length) return;
      [next[index], next[j]] = [next[j], next[index]];
      wishes.value = next;
      wishBusy.value = true;
      try { await api("/wishes/order", "PUT", { ids: next.map((w) => w.id) }); }
      catch (e) { error.value = errorText(e); await loadWishes(); }
      finally { wishBusy.value = false; }
    }
    function startWishEdit(w: Wish) {
      editingWish.value = w.id;
      editingText.value = w.text;
    }
    async function saveWishEdit(w: Wish) {
      const text = editingText.value.trim();
      if (!text) return;
      editingWish.value = null;
      await saveWish(w, { text });
    }
    function fmtTime(ts: number) {
      if (!ts) return "-";
      const d = new Date(ts);
      return d.toLocaleString("zh-CN", { hour12: false }).slice(5);
    }
    function fmtBytes(n: number) {
      if (!n) return "0";
      if (n > 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + " GB";
      if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
      return (n / 1024).toFixed(0) + " KB";
    }
    function chart(values: number[], color: string) {
      if (values.length < 2) return h("div", { class: "admin-chart-empty" }, "采样中…");
      const max = Math.max(...values, 1), min = Math.min(...values, 0);
      const span = Math.max(1, max - min);
      const pts = values.map((v, i) => {
        const x = values.length === 1 ? 0 : (i / (values.length - 1)) * 300;
        const y = 66 - ((v - min) / span) * 58;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      return h("svg", { viewBox: "0 0 300 70", class: "admin-chart", preserveAspectRatio: "none" }, [
        h("polyline", { points: pts, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round" }),
      ]);
    }

    onMounted(() => {
      void (async () => {
        if (!session.ready) await loadSession().catch(() => {});
        if (isAdmin.value) await loadAll();
        else loading.value = false;
      })();
    });
    onBeforeUnmount(() => { alive = false; window.clearInterval(timer); });

    function loginView() {
      return h("div", { class: "admin-login-wrap" }, [
        h("div", { class: "admin-login" }, [
          h("span", { class: "admin-kicker" }, "ADMIN CONSOLE"),
          h("h1", "管理中心"),
          h("p", "只给管理员使用。管理员只能看账号元数据和聚合统计，不能查看用户简历、投递内容、聊天记录或上传文件，也不能查看原密码。"),
          session.user && !isAdmin.value
            ? h("div", { class: "admin-warn" }, [
                h("p", "当前登录账号不是管理员：" + session.user.email),
                h("button", { class: "admin-btn", onClick: logout }, "退出当前账号"),
                h("a", { href: "#home" }, "返回用户端"),
              ])
            : h("form", { onSubmit: (e: Event) => { e.preventDefault(); void login(); } }, [
                h("label", [h("span", "管理员邮箱"), h("input", { type: "email", value: email.value, required: true, autocomplete: "username", onInput: (e: Event) => (email.value = (e.target as HTMLInputElement).value) })]),
                h("label", [h("span", "密码"), h("input", { type: "password", value: password.value, required: true, autocomplete: "current-password", onInput: (e: Event) => (password.value = (e.target as HTMLInputElement).value) })]),
                error.value ? h("p", { class: "admin-error" }, error.value) : null,
                h("button", { class: "admin-btn primary", disabled: busy.value, type: "submit" }, busy.value ? "登录中…" : "以管理员身份登录"),
              ]),
          error.value && !session.user ? h("p", { class: "admin-error" }, error.value) : null,
          h("a", { class: "admin-back", href: "#home" }, "← 返回用户端"),
        ]),
      ]);
    }

    function overview() {
      const s = stats.value;
      if (!s) return h("p", { class: "admin-muted" }, loading.value ? "正在读取服务器统计…" : "暂无统计。");
      const memPct = Math.round(s.memory.rss / s.system.totalmem * 100);
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-cards" }, [
          h("div", { class: "admin-card" }, [h("span", "运行时长"), h("strong", Math.floor(s.uptimeSec / 3600) + "h " + Math.floor(s.uptimeSec % 3600 / 60) + "m"), h("small", "PID " + s.pid + " · " + s.node)]),
          h("div", { class: "admin-card" }, [h("span", "进程内存"), h("strong", fmtBytes(s.memory.rss)), h("small", "占系统 " + memPct + "% · heap " + fmtBytes(s.memory.heapUsed))]),
          h("div", { class: "admin-card" }, [h("span", "系统负载"), h("strong", s.system.load1.toFixed(2)), h("small", s.system.cores + " 核 · 空闲 " + fmtBytes(s.system.freemem))]),
          h("div", { class: "admin-card" }, [h("span", "请求"), h("strong", String(s.requests.total)), h("small", "错误 " + s.requests.errors + " · 平均 " + s.requests.avgMs + "ms")]),
        ]),
        h("div", { class: "admin-panels" }, [
          h("section", { class: "admin-panel" }, [h("h3", "请求延迟趋势"), chart(history.value.map((x) => x.avg), "#8f7be8")]),
          h("section", { class: "admin-panel" }, [h("h3", "进程内存趋势"), chart(history.value.map((x) => x.rss / 1024 / 1024), "#4fb286")]),
        ]),
        h("section", { class: "admin-panel" }, [
          h("h3", "数据量"),
          h("div", { class: "admin-db-grid" }, Object.entries(s.db).map(([k, v]) => h("div", { class: "admin-db" }, [h("span", k), h("strong", String(v))]))),
        ]),
      ]);
    }
    function usersView() {
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-panel-head" }, [h("h2", "用户账号"), h("button", { class: "admin-btn", onClick: () => void loadUsers() }, "刷新")]),
        h("p", { class: "admin-muted" }, "只显示账号、角色、创建时间、简历数量、面试次数；不显示简历内容、投递话术、聊天记录、上传文件或密码。"),
        h("div", { class: "admin-table-wrap" }, h("table", { class: "admin-table" }, [
          h("thead", [h("tr", ["用户名", "邮箱", "角色", "创建时间", "简历", "面试", "操作"].map((x) => h("th", x)))]),
          h("tbody", users.value.map((u) => h("tr", [
            h("td", u.displayName || "-"),
            h("td", u.email),
            h("td", u.role === "admin" ? "管理员" : "用户"),
            h("td", fmtTime(u.createdAt)),
            h("td", String(u.resumes)),
            h("td", String(u.interviews)),
            h("td", { class: "admin-row-actions" }, [
              h("button", { onClick: () => openEdit(u) }, "编辑"),
              h("button", { onClick: () => void resetPassword(u) }, "重置密码"),
              h("button", { class: "danger", onClick: () => void removeUser(u) }, "删除"),
            ]),
          ]))),
        ])),
        editUser.value
          ? h("div", { class: "admin-modal-mask", onClick: () => (editUser.value = null) }, h("div", { class: "admin-modal", onClick: (e: Event) => e.stopPropagation() }, [
              h("h3", "编辑账号"),
              h("label", [h("span", "用户名"), h("input", { value: editDisplayName.value, maxlength: 24, onInput: (e: Event) => (editDisplayName.value = (e.target as HTMLInputElement).value) })]),
              h("label", [h("span", "邮箱"), h("input", { value: editEmail.value, onInput: (e: Event) => (editEmail.value = (e.target as HTMLInputElement).value) })]),
              h("label", [h("span", "角色"), h("select", { value: editRole.value, onChange: (e: Event) => (editRole.value = (e.target as HTMLSelectElement).value as any) }, [h("option", { value: "user" }, "用户"), h("option", { value: "admin" }, "管理员")])]),
              h("div", { class: "admin-modal-actions" }, [h("button", { class: "admin-btn", onClick: () => (editUser.value = null) }, "取消"), h("button", { class: "admin-btn primary", onClick: () => void saveEdit(), disabled: busy.value }, "保存")]),
            ]))
          : null,
        resetInfo.value
          ? h("div", { class: "admin-modal-mask", onClick: () => (resetInfo.value = null) }, h("div", { class: "admin-modal", onClick: (e: Event) => e.stopPropagation() }, [
              h("h3", "密码已重置"),
              h("p", { class: "admin-muted" }, resetInfo.value.email + " 的旧密码已失效；新密码只展示一次。"),
              h("code", { class: "admin-password" }, resetInfo.value.password),
              h("div", { class: "admin-modal-actions" }, [
                h("button", { class: "admin-btn", onClick: () => { void navigator.clipboard?.writeText(resetInfo.value?.password || ""); notice.value = "新密码已复制。"; } }, "复制"),
                h("button", { class: "admin-btn primary", onClick: () => (resetInfo.value = null) }, "知道了"),
              ]),
            ]))
          : null,
      ]);
    }
    function wishesView() {
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-panel-head" }, [h("h2", "心愿池管理"), h("button", { class: "admin-btn", onClick: () => void loadWishes() }, "刷新")]),
        h("div", { class: "admin-wish-add" }, [
          h("input", { value: wishDraft.value, placeholder: "新增一条心愿…", onInput: (e: Event) => (wishDraft.value = (e.target as HTMLInputElement).value), onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void addWish(); } }),
          h("button", { class: "admin-btn primary", onClick: () => void addWish(), disabled: busy.value || !wishDraft.value.trim() }, "添加"),
        ]),
        h("div", { class: "admin-wish-list" }, wishes.value.map((w, i) => h("div", { class: "admin-wish" + (w.done ? " done" : "") }, [
          h("button", { class: "admin-wish-check" + (w.done ? " on" : ""), onClick: () => void saveWish(w, { done: !w.done }) }, w.done ? "✓" : ""),
          editingWish.value === w.id
            ? h("input", { class: "admin-wish-edit", value: editingText.value, onInput: (e: Event) => (editingText.value = (e.target as HTMLInputElement).value), onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void saveWishEdit(w); } })
            : h("span", { class: "admin-wish-text" }, w.text),
          h("div", { class: "admin-wish-actions" }, [
            editingWish.value === w.id
              ? h("button", { onClick: () => void saveWishEdit(w) }, "保存")
              : h("button", { onClick: () => startWishEdit(w) }, "编辑"),
            h("button", { onClick: () => void moveWish(i, -1), disabled: i === 0 }, "↑"),
            h("button", { onClick: () => void moveWish(i, 1), disabled: i === wishes.value.length - 1 }, "↓"),
            h("button", { class: "danger", onClick: () => void removeWish(w) }, "删除"),
          ]),
        ]))),
        !wishes.value.length ? h("p", { class: "admin-muted" }, "还没有心愿。") : null,
      ]);
    }
    function systemView() {
      const s = stats.value;
      return h("div", { class: "admin-stack" }, [
        h("section", { class: "admin-panel" }, [
          h("h3", "服务器"),
          s ? h("pre", { class: "admin-pre" }, JSON.stringify({
            pid: s.pid, node: s.node, uptimeSec: s.uptimeSec,
            memory: s.memory, system: s.system, requests: s.requests,
          }, null, 2)) : h("p", { class: "admin-muted" }, "等待采样…"),
        ]),
        h("section", { class: "admin-panel" }, [
          h("h3", "隐私边界"),
          h("p", { class: "admin-muted" }, "本页面没有任何查看用户资料、简历、投递方案、聊天记录、上传文件、原密码的入口。管理员只能重置密码；重置结果只显示一次，服务器不保存明文。"),
        ]),
      ]);
    }

    return () => {
      if (!isAdmin.value) return loginView();
      return h("div", { class: "admin-shell" }, [
        h("aside", { class: "admin-side" }, [
          h("div", { class: "admin-brand" }, [h("span", "✦"), h("div", [h("strong", "逐光 · 管理中心"), h("small", "ADMIN CONSOLE")])]),
          h("button", { class: "admin-tab" + (tab.value === "overview" ? " on" : ""), onClick: () => (tab.value = "overview") }, "概览"),
          h("button", { class: "admin-tab" + (tab.value === "users" ? " on" : ""), onClick: () => (tab.value = "users") }, "用户账号"),
          h("button", { class: "admin-tab" + (tab.value === "wishes" ? " on" : ""), onClick: () => (tab.value = "wishes") }, "心愿池"),
          h("button", { class: "admin-tab" + (tab.value === "system" ? " on" : ""), onClick: () => (tab.value = "system") }, "系统"),
          h("div", { class: "admin-side-foot" }, [
            h("p", session.user?.email || ""),
            h("a", { href: "#home" }, "返回用户端"),
            h("button", { onClick: logout }, "退出登录"),
          ]),
        ]),
        h("main", { class: "admin-main" }, [
          h("header", { class: "admin-head" }, [
            h("div", [h("span", "ADMIN"), h("h1", tab.value === "overview" ? "运行概览" : tab.value === "users" ? "用户账号" : tab.value === "wishes" ? "心愿池管理" : "系统与隐私")]),
            h("button", { class: "admin-btn", onClick: () => void loadAll() }, loading.value ? "刷新中…" : "刷新全部"),
          ]),
          error.value ? h("p", { class: "admin-error" }, error.value) : null,
          notice.value ? h("p", { class: "admin-notice" }, notice.value) : null,
          tab.value === "overview" ? overview() : tab.value === "users" ? usersView() : tab.value === "wishes" ? wishesView() : systemView(),
        ]),
      ]);
    };
  },
});
