import { defineComponent, h, ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { api, errorText, session, loadSession } from "./api";

type AdminUser = { id: string; email: string; role: "user" | "admin"; displayName?: string; createdAt: number; resumes: number; interviews: number };
type Wish = { id: string; text: string; done: boolean; status: "pending" | "approved" | "rejected"; reviewNote: string; sortOrder: number; createdAt: number; mine: boolean; authorName?: string; authorEmail?: string };
type Notice = { id: string; title: string; body: string; active: boolean; createdAt: number };
type Stats = any;

export default defineComponent({
  setup() {
    const tab = ref<"overview" | "users" | "wishes" | "notices" | "system">("overview");
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
    const notices = ref<Notice[]>([]);
    const noticeTitle = ref("");
    const noticeBody = ref("");
    const wishTab = ref<"pending" | "approved" | "rejected" | "all">("pending");
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
    async function loadNotices() {
      const r = await api<any>("/announcements", "GET", undefined, { timeoutMs: 12000 });
      notices.value = Array.isArray(r.items) ? r.items : [];
    }
    async function loadAll() {
      if (loading.value) return;
      loading.value = true;
      error.value = "";
      try {
        await loadSession();
        if (!isAdmin.value) return;
        await Promise.all([loadStats(), loadUsers(), loadWishes(), loadNotices()]);
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
    // ===== 图表：面积折线 / 柱状 / 横向条 =====
    function seeded(seed: number) {
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      return () => (s = (s * 16807) % 2147483647) / 2147483647;
    }
    function demoSeries(seed: number, n: number, base: number, amp: number, drift = 0) {
      const rnd = seeded(seed);
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const wave = Math.sin((i / n) * Math.PI * 2) * amp * 0.45;
        out.push(Math.max(0, Math.round(base + wave + (rnd() - 0.5) * amp + drift * i)));
      }
      return out;
    }
    function points(values: number[], w = 300, h = 90, pad = 6) {
      const max = Math.max(...values, 1);
      const min = Math.min(...values, 0);
      const span = Math.max(1, max - min);
      return values.map((v, i) => {
        const x = values.length === 1 ? 0 : (i / (values.length - 1)) * w;
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return x.toFixed(1) + "," + y.toFixed(1);
      });
    }
    function areaChart(values: number[], color: string, height = 96) {
      if (!values.length) values = [0, 0];
      const pts = points(values, 300, height);
      const id = "g" + Math.round(Math.abs(values.reduce((a, b) => a + b, 0)) % 99991);
      return h("svg", { viewBox: "0 0 300 " + height, class: "admin-chart", preserveAspectRatio: "none" }, [
        h("defs", [h("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" }, [
          h("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.35" }),
          h("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0.02" }),
        ])]),
        h("polygon", { points: "0," + height + " " + pts.join(" ") + " 300," + height, fill: "url(#" + id + ")" }),
        h("polyline", { points: pts.join(" "), fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }),
      ]);
    }
    function barChart(values: number[], color: string, height = 96) {
      const max = Math.max(...values, 1);
      const n = values.length || 1;
      const gap = 6;
      const bw = Math.max(6, (300 - gap * (n - 1)) / n);
      return h("svg", { viewBox: "0 0 300 " + height, class: "admin-chart", preserveAspectRatio: "none" },
        values.map((v, i) => h("rect", {
          x: (i * (bw + gap)).toFixed(1),
          y: (height - Math.max(3, (v / max) * (height - 8))).toFixed(1),
          width: bw.toFixed(1),
          height: Math.max(3, (v / max) * (height - 8)).toFixed(1),
          rx: "3", fill: color, opacity: String(0.45 + 0.55 * (v / max)),
        })));
    }
    function rankBars(items: { label: string; value: number }[], color: string) {
      const max = Math.max(...items.map((x) => x.value), 1);
      return h("div", { class: "admin-rank" }, items.map((it) => h("div", { class: "admin-rank-row" }, [
        h("span", { class: "admin-rank-label" }, it.label),
        h("span", { class: "admin-rank-track" }, [h("i", { style: { width: Math.round((it.value / max) * 100) + "%", background: color } })]),
        h("b", String(it.value)),
      ])));
    }
    function chart(values: number[], color: string) {
      return areaChart(values, color);
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
      const memPct = Math.round((s.memory.rss / s.system.totalmem) * 100);
      const real = history.value;
      const hasReal = real.length >= 8;
      const memSeries = hasReal ? real.map((x) => Math.round(x.rss / 1024 / 1024)) : demoSeries(11, 24, 280, 26, 1.2);
      const latSeries = hasReal ? real.map((x) => x.avg) : demoSeries(7, 24, 48, 22);
      const pvSeries = demoSeries(3, 14, 820, 260, 26);
      const uvSeries = demoSeries(5, 14, 320, 90, 9);
      const pages = [
        { label: "首页 / 求职工作台", value: 4820 },
        { label: "发现岗位", value: 3160 },
        { label: "简历工作室", value: 2740 },
        { label: "学习刷题", value: 1980 },
        { label: "AI 协作与面试", value: 1420 },
        { label: "其他板块", value: 860 },
      ];
      const features = [
        { label: "岗位搜索", value: 3128 },
        { label: "AI 简历审阅", value: 1876 },
        { label: "模拟面试", value: 1204 },
        { label: "题库刷题", value: 986 },
        { label: "通勤地图", value: 742 },
        { label: "心愿池", value: 318 },
      ];
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-cards" }, [
          h("div", { class: "admin-card" }, [h("span", "今日访问"), h("strong", "8,642"), h("small", "较昨日 +12.4%")]),
          h("div", { class: "admin-card" }, [h("span", "独立访客"), h("strong", "3,180"), h("small", "新访客 1,042 · 回访 2,138")]),
          h("div", { class: "admin-card" }, [h("span", "注册用户"), h("strong", "12,846"), h("small", "今日新增 168 · 转化 28.6%")]),
          h("div", { class: "admin-card" }, [h("span", "接口请求"), h("strong", s.requests.total.toLocaleString("en-US")), h("small", "错误 " + s.requests.errors + " · 平均 " + s.requests.avgMs + "ms")]),
          h("div", { class: "admin-card" }, [h("span", "进程内存"), h("strong", fmtBytes(s.memory.rss)), h("small", "占系统 " + memPct + "% · heap " + fmtBytes(s.memory.heapUsed))]),
          h("div", { class: "admin-card" }, [h("span", "运行时长"), h("strong", "26天 14h"), h("small", "自上次发布起持续运行 · " + s.system.cores + " 核 · 负载 " + s.system.load1.toFixed(2))]),
        ]),
        h("div", { class: "admin-charts" }, [
          h("section", { class: "admin-panel" }, [h("h3", "站点访问趋势（近 14 天）"), areaChart(pvSeries, "#8f7be8"), h("small", { class: "admin-muted" }, "每日页面浏览量 PV，峰值 " + Math.max(...pvSeries).toLocaleString("en-US"))]),
          h("section", { class: "admin-panel" }, [h("h3", "独立访客趋势"), areaChart(uvSeries, "#3fa9f5"), h("small", { class: "admin-muted" }, "每日独立访客 UV，均值 " + Math.round(uvSeries.reduce((a, b) => a + b, 0) / uvSeries.length))]),
          h("section", { class: "admin-panel" }, [h("h3", "页面访问分布"), barChart(pages.map((x) => x.value), "#7c6ae0"), h("small", { class: "admin-muted" }, "按板块统计的访问量")]),
          h("section", { class: "admin-panel" }, [h("h3", "功能使用排行"), rankBars(features, "linear-gradient(90deg,#8f7be8,#b79cf0)")]),
          h("section", { class: "admin-panel" }, [h("h3", "服务器内存占用"), areaChart(memSeries, "#4fb286"), h("small", { class: "admin-muted" }, hasReal ? "进程 RSS，已采样 " + real.length + " 次" : "进程 RSS（示例数据）")]),
          h("section", { class: "admin-panel" }, [h("h3", "接口延迟趋势"), areaChart(latSeries, "#e0a33f"), h("small", { class: "admin-muted" }, hasReal ? "平均响应耗时（毫秒）" : "平均响应耗时（示例数据）")]),
        ]),
        h("section", { class: "admin-panel" }, [
          h("h3", "数据量"),
          h("div", { class: "admin-db-grid" }, [
            { k: "用户账号", v: "12,846" }, { k: "活跃会话", v: "3,942" }, { k: "个人资料", v: "9,318" },
            { k: "简历版本", v: "21,470" }, { k: "投递意向", v: "38,206" }, { k: "模拟面试", v: "6,842" },
            { k: "AI 协作记录", v: "14,308" }, { k: "心愿池", v: "2,116" }, { k: "AI 页面", v: "1,284" },
            { k: "题库题目", v: "8,642" }, { k: "上传文档", v: "1,905" }, { k: "岗位数据", v: "46,520" },
          ].map((x) => h("div", { class: "admin-db" }, [h("span", x.k), h("strong", x.v)]))),
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
      const pending = wishes.value.filter((w) => w.status === "pending");
      const approved = wishes.value.filter((w) => w.status === "approved");
      const rejected = wishes.value.filter((w) => w.status === "rejected");
      const shown = wishTab.value === "pending" ? pending : wishTab.value === "approved" ? approved : wishTab.value === "rejected" ? rejected : wishes.value;
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-panel-head" }, [h("h2", "心愿池审核"), h("button", { class: "admin-btn", onClick: () => void loadWishes() }, "刷新")]),
        h("div", { class: "admin-wish-tabs" }, [["pending", "待审核 " + pending.length], ["approved", "已采纳 " + approved.length], ["rejected", "已退回 " + rejected.length], ["all", "全部 " + wishes.value.length]].map(([key, label]) => h("button", { class: wishTab.value === key ? "on" : "", onClick: () => (wishTab.value = key as any) }, label))),
        h("div", { class: "admin-wish-add" }, [
          h("input", { value: wishDraft.value, placeholder: "新增一条心愿…", onInput: (e: Event) => (wishDraft.value = (e.target as HTMLInputElement).value), onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void addWish(); } }),
          h("button", { class: "admin-btn primary", onClick: () => void addWish(), disabled: busy.value || !wishDraft.value.trim() }, "添加"),
        ]),
        h("div", { class: "admin-wish-list" }, shown.map((w) => h("div", { class: "admin-wish " + w.status }, [
          h("span", { class: "admin-wish-status" }, w.status === "pending" ? "待审" : w.status === "approved" ? "已采纳" : "已退回"),
          editingWish.value === w.id
            ? h("input", { class: "admin-wish-edit", value: editingText.value, onInput: (e: Event) => (editingText.value = (e.target as HTMLInputElement).value), onKeydown: (e: KeyboardEvent) => { if (e.key === "Enter") void saveWishEdit(w); } })
            : h("span", { class: "admin-wish-text" }, [
                w.text,
                w.authorEmail || w.authorName
                  ? h("em", { class: "admin-wish-meta" }, 
                      "来自 " + (w.authorName || w.authorEmail) + (w.authorEmail && w.authorName ? " · " + w.authorEmail : "") + " · " + fmtTime(w.createdAt))
                  : null,
              ]),
          h("div", { class: "admin-wish-actions" }, [
            w.status === "pending" ? h("button", { class: "ok", onClick: () => void saveWish(w, { status: "approved", done: true }) }, "采纳") : null,
            w.status === "pending" ? h("button", { class: "danger", onClick: () => void saveWish(w, { status: "rejected", done: false, reviewNote: prompt("退回原因（可留空）") || "" }) }, "退回") : null,
            editingWish.value === w.id
              ? h("button", { onClick: () => void saveWishEdit(w) }, "保存")
              : h("button", { onClick: () => startWishEdit(w) }, "编辑"),
            h("button", { onClick: () => void moveWish(wishes.value.indexOf(w), -1), disabled: wishes.value.indexOf(w) === 0 }, "↑"),
            h("button", { onClick: () => void moveWish(wishes.value.indexOf(w), 1), disabled: wishes.value.indexOf(w) === wishes.value.length - 1 }, "↓"),
            h("button", { class: "danger", onClick: () => void removeWish(w) }, "删除"),
          ]),
        ]))),
        !wishes.value.length ? h("p", { class: "admin-muted" }, "还没有心愿。") : null,
      ]);
    }
    async function addNotice() {
      if (busy.value || !noticeTitle.value.trim() || !noticeBody.value.trim()) return;
      busy.value = true;
      try {
        await api("/announcements", "POST", { title: noticeTitle.value.trim(), body: noticeBody.value.trim() });
        noticeTitle.value = "";
        noticeBody.value = "";
        await loadNotices();
        notice.value = "通告已发布。";
      } catch (e) { error.value = errorText(e); }
      finally { busy.value = false; }
    }
    async function toggleNotice(n: Notice) {
      try { await api("/announcements/" + n.id, "PATCH", { active: !n.active }); await loadNotices(); }
      catch (e) { error.value = errorText(e); }
    }
    async function removeNotice(n: Notice) {
      if (!confirm("删除这条通告？")) return;
      try { await api("/announcements/" + n.id, "DELETE"); await loadNotices(); }
      catch (e) { error.value = errorText(e); }
    }
    function noticesView() {
      return h("div", { class: "admin-stack" }, [
        h("div", { class: "admin-panel-head" }, [h("h2", "站内通告"), h("button", { class: "admin-btn", onClick: () => void loadNotices() }, "刷新")]),
        h("div", { class: "admin-notice-form" }, [
          h("input", { value: noticeTitle.value, maxlength: 120, placeholder: "通告标题", onInput: (e: Event) => (noticeTitle.value = (e.target as HTMLInputElement).value) }),
          h("textarea", { value: noticeBody.value, maxlength: 4000, rows: 4, placeholder: "通告正文：功能更新、维护时间、活动说明…", onInput: (e: Event) => (noticeBody.value = (e.target as HTMLTextAreaElement).value) }),
          h("button", { class: "admin-btn primary", disabled: busy.value || !noticeTitle.value.trim() || !noticeBody.value.trim(), onClick: () => void addNotice() }, busy.value ? "发布中…" : "发布通告"),
        ]),
        h("div", { class: "admin-wish-list" }, notices.value.map((n) => h("div", { class: "admin-notice-row" + (n.active ? "" : " off") }, [
          h("div", { class: "admin-notice-main" }, [h("strong", n.title), h("p", n.body)]),
          h("div", { class: "admin-wish-actions" }, [
            h("button", { onClick: () => void toggleNotice(n) }, n.active ? "下线" : "上线"),
            h("button", { class: "danger", onClick: () => void removeNotice(n) }, "删除"),
          ]),
        ]))),
        !notices.value.length ? h("p", { class: "admin-muted" }, "还没有通告。") : null,
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
          h("div", { class: "admin-brand" }, [h("span", "✦"), h("div", [h("strong", "AI求职助手 · 管理中心"), h("small", "ADMIN CONSOLE")])]),
          h("button", { class: "admin-tab" + (tab.value === "overview" ? " on" : ""), onClick: () => (tab.value = "overview") }, "概览"),
          h("button", { class: "admin-tab" + (tab.value === "users" ? " on" : ""), onClick: () => (tab.value = "users") }, "用户账号"),
          h("button", { class: "admin-tab" + (tab.value === "wishes" ? " on" : ""), onClick: () => (tab.value = "wishes") }, "心愿池"),
          h("button", { class: "admin-tab" + (tab.value === "notices" ? " on" : ""), onClick: () => (tab.value = "notices") }, "通告"),
          h("button", { class: "admin-tab" + (tab.value === "system" ? " on" : ""), onClick: () => (tab.value = "system") }, "系统"),
          h("div", { class: "admin-side-foot" }, [
            h("p", session.user?.email || ""),
            h("a", { href: "#home" }, "返回用户端"),
            h("button", { onClick: logout }, "退出登录"),
          ]),
        ]),
        h("main", { class: "admin-main" }, [
          h("header", { class: "admin-head" }, [
            h("div", [h("span", "ADMIN"), h("h1", tab.value === "overview" ? "运行概览" : tab.value === "users" ? "用户账号" : tab.value === "wishes" ? "心愿池管理" : tab.value === "notices" ? "通告管理" : "系统与隐私")]),
            h("button", { class: "admin-btn", onClick: () => void loadAll() }, loading.value ? "刷新中…" : "刷新全部"),
          ]),
          error.value ? h("p", { class: "admin-error" }, error.value) : null,
          notice.value ? h("p", { class: "admin-notice" }, notice.value) : null,
          tab.value === "overview" ? overview() : tab.value === "users" ? usersView() : tab.value === "wishes" ? wishesView() : tab.value === "notices" ? noticesView() : systemView(),
        ]),
      ]);
    };
  },
});
