try {
  const sc = localStorage.getItem("zg.petScale");
  if (sc) document.documentElement.style.setProperty("--pet-scale", sc);
  if (localStorage.getItem("zg.petsHidden") === "1") document.body.classList.add("zg-pets-hidden");
} catch {}
try { if (!localStorage.getItem("kb-theme")) localStorage.setItem("kb-theme", "paper"); } catch {}
import "vant/lib/index.css";
import { createPinia } from "pinia";
import Vant from "vant";
import {
  createApp,
  defineComponent,
  h,
  ref,
  computed,
  defineAsyncComponent,
  onMounted,
  watch,
  onErrorCaptured,
} from "vue";
import { api, session, loadSession, errorText } from "./api";
import CompanionsV3 from "./companions";
import AgentPet from "./agent-pet";
import MainPet from "./orig/components/Live2DPet.vue";
import OrbitTrigger from "./draggable-orbit";
import ClassicStarMap, { preloadStarAssets as preloadClassicStarAssets } from "./star-map";
import RpgStarMap, { preloadStarAssets as preloadRpgStarAssets } from "./star-map-rpg";
import MouseTrail from "./mouse-trail";
const MAP_PRELOAD = [
  "/assets/star-map/rpg-cosmos.webp",
  "/assets/star-map/cosmos.webp",
  "/assets/star-map/astrolabe.webp",
  "/assets/star-map/astrolabe2.webp",
  ...["home","guide","profile","resume","data","jobs","dashboard","map","companies","housing","knowledge","practice","interview","chat","wish","plan","study-upload","settings"].map((id) => "/assets/star-map/" + id + ".webp"),
];
const Profile = defineAsyncComponent(() => import("./profile"));
const Resume = defineAsyncComponent(() => import("./resume"));
const Jobs = defineAsyncComponent(() => import("./jobs"));
const Plan = defineAsyncComponent(() => import("./plan"));
const Knowledge = defineAsyncComponent(() => import("./knowledge"));
const Practice = defineAsyncComponent(() => import("./practice"));
const Dashboard = defineAsyncComponent(() => import("./dashboard"));
const Datasets = defineAsyncComponent(() => import("./datasets"));
const CityMap = defineAsyncComponent(() => import("./map"));
const Companies = defineAsyncComponent(() => import("./companies"));
const Housing = defineAsyncComponent(() => import("./housing"));
const Study = defineAsyncComponent(() => import("./study"));
const Settings = defineAsyncComponent(() => import("./settings"));
const StudyUpload = defineAsyncComponent(() => import("./study-upload"));
const Interview = defineAsyncComponent(() => import("./interview"));
const Chat = defineAsyncComponent(() => import("./chat"));
const Wish = defineAsyncComponent(() => import("./wish"));
const Admin = defineAsyncComponent(() => import("./admin"));
const Guide = defineAsyncComponent(() => import("./guide"));
const pages = [
  ["home", "求职工作台", "✦"],
  ["guide", "项目介绍", "?"],
  ["profile", "个人信息", "◎"],
  ["resume", "简历工作室", "▤"],
  ["data", "我的数据空间", "▧"],
  ["jobs", "发现岗位", "▦"],
  ["dashboard", "就业数据大屏", "◴"],
  ["map", "城市与通勤地图", "◇"],
  ["companies", "企业观察", "▥"],
  ["housing", "租房与生活", "⌂"],
  ["knowledge", "面经与八股", "▣"],
  ["practice", "学习与刷题", "✎"],
  ["interview", "模拟面试", "◉"],
  ["plan", "投递意向与方案", "↗"],
  ["chat", "AI协作空间", "✧"],
  ["wish", "心愿池", "☷"],
  ["study-upload", "上传题库", "⬆"],
  ["settings", "个性化设置", "⚙"],
];
const known = new Set([...pages.map((p) => p[0]), "admin"]);
const initialRaw0 = location.hash.slice(1);
const initialRaw = initialRaw0 === "community" ? "wish" : initialRaw0;
const initialReview = initialRaw.startsWith("review/") ? initialRaw.slice(7).split("?")[0] : "";
const initial = initialReview ? "practice" : initialRaw;
let bootPracticeRoute = "/orig/#/review";
if (initial === "practice" && !initialReview) {
  try {
    const saved = localStorage.getItem("zg.practiceRoute") || "";
    if (/^\/orig\/#\/review(?:\/[a-z0-9]+)?(?:\?[^#]*)?$/.test(saved)) bootPracticeRoute = saved;
  } catch (e) { /* ignore */ }
}
const app = defineComponent({
  setup() {
    const reviewId = ref(initialReview);
    const petSkin = ref((() => { try { return localStorage.getItem("zg.petSkin") || "live2d"; } catch { return "live2d"; } })());
    window.addEventListener("zg:pet-skin", (ev: any) => { petSkin.value = ev?.detail?.skin === "avatar" ? "avatar" : "live2d"; });
    const active = ref(known.has(initial) ? initial : "home"),
      orbit = ref(false),
      starMapMode = ref<"rpg" | "classic">("rpg"),
      fog = ref(false),
      auth = ref(false),
      authMode = ref<"login" | "register">("login"),
      loginRole = ref<"user" | "admin">("user"),
      email = ref(""),
      displayName = ref(""),
      password = ref(""),
      showPassword = ref(false),
      busy = ref(false),
      error = ref(""),
      notice = ref(""),
      dirty = ref(false),
      crash = ref(false),
      announcements = ref<Array<{ id: string; title: string; body: string; createdAt: number }>>([]),
      noticeOpen = ref(false),
      readNoticeIds = ref<string[]>([]),
      theme = ref<"light" | "night">((() => {
        try { return localStorage.getItem("zg.theme") === "night" ? "night" : "light"; } catch { return "light"; }
      })());
    let navigating = false,
      queued: string | null = null;
    const dashboardMode = ref<"city" | "career">("city");
    const unreadNotices = computed(() => announcements.value.filter((n) => !readNoticeIds.value.includes(n.id)));
    async function loadAnnouncements() {
      try {
        const r = await api<{ items: any[] }>("/announcements", "GET", undefined, { timeoutMs: 10000 });
        announcements.value = Array.isArray(r.items) ? r.items : [];
      } catch { announcements.value = []; }
    }
    function applyTheme(t: "light" | "night") {
      theme.value = t;
      try { localStorage.setItem("zg.theme", t); } catch {}
      document.documentElement.dataset.theme = t;
      document.documentElement.style.colorScheme = t === "night" ? "dark" : "light";
    }
    function toggleTheme() { applyTheme(theme.value === "night" ? "light" : "night"); }
    function markNoticeRead(id: string) {
      if (!readNoticeIds.value.includes(id)) {
        readNoticeIds.value = [...readNoticeIds.value, id];
        try { localStorage.setItem("zg.readNotices", JSON.stringify(readNoticeIds.value)); } catch {}
      }
    }
    const title = computed(
      () => pages.find((p) => p[0] === active.value)?.[1] || "求职工作台",
    );
    const accountName = computed(() => {
      const u = session.user;
      return u?.displayName || u?.email?.split("@")[0] || "我";
    });
    const accountInitial = computed(() => Array.from(accountName.value)[0] || "我");
    const hidePets = computed(() => active.value === "chat" || active.value === "wish");
    watch(orbit, (v) => { try { document.body.classList.toggle("star-map-open", !!v); } catch {} }, { immediate: true });
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    watch(notice, (v) => {
      if (noticeTimer) clearTimeout(noticeTimer);
      if (!v) return;
      noticeTimer = setTimeout(() => { if (notice.value === v) notice.value = ""; }, 6000);
    });
    onMounted(async () => {
      preloadRpgStarAssets();
      preloadClassicStarAssets();
      // 四只 agent 头像很小，首屏空闲时预取，后续页面/刷新直接命中缓存。
      requestIdleCallback?.(() => {
        ["a-1.jpg", "a-2.png", "b-1.png", "b-3.png"].forEach((name) => {
          const img = new Image();
          img.src = "/assets/companions/" + name;
        });
      }, { timeout: 2000 });
      applyTheme(theme.value);
      try {
        await loadSession();
        try { readNoticeIds.value = JSON.parse(localStorage.getItem("zg.readNotices") || "[]") || []; } catch { readNoticeIds.value = []; }
        void loadAnnouncements();
        try { (window as any).__zgCsrf = session.csrf || ""; } catch {}
      } catch (e) {
        notice.value = errorText(e);
      }
      window.addEventListener("beforeunload", (e) => {
        if (dirty.value) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
      window.addEventListener("hashchange", () => {
        const raw = location.hash.slice(1);
        if (raw.startsWith("review/")) {
          reviewId.value = raw.slice(7).split("?")[0];
          active.value = "practice";
          return;
        }
        const id = raw;
        crash.value = false;
        notice.value = "";
        if (!known.has(id)) return;
        if (id === active.value) return;
        reviewId.value = "";
        void go(id);
      });
      // 学习页 iframe 里的工具箱通过 postMessage 把「Agent 模式 / 工作状态」交给主页面看板娘。
      window.addEventListener("message", (ev: MessageEvent) => {
        if (ev.origin !== location.origin) return;
        const d: any = ev.data || {};
        if (d.type === "zg:study-mode") {
          if (petSkin.value === "avatar") {
            window.dispatchEvent(new CustomEvent("zg:toggle-chat", { detail: { agentId: "xingye", open: true } }));
          } else {
            window.dispatchEvent(new CustomEvent("kaoshibang:set-mode", { detail: { mode: d.mode || "agent" } }));
          }
        } else if (d.type === "zg:ai-busy") {
          window.dispatchEvent(new CustomEvent("kaoshibang:ai-busy", { detail: { active: !!d.active, tool: d.tool || "" } }));
        } else if (d.type === "zg:ask-learning-pet") {
          const content = String(d.content || "").slice(0, 4000);
          if (!content) return;
          window.dispatchEvent(new CustomEvent("zg:open-persona", { detail: { personaId: "zhiwei" } }));
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent("zg:agent-message", { detail: { agentId: "zhiwei", draft: { label: String(d.label || "题目").slice(0, 20), content } } }));
          }, 120);
        }
      });
    });
    onErrorCaptured(() => {
      crash.value = true;
      notice.value =
        "这个页面暂时出错，其他页面仍可使用。请保留当前草稿并重新打开。";
      return false;
    });
    async function go(id: string) {
      if (!known.has(id)) return;
      if (navigating) {
        queued = id;
        return;
      }
      if (id === active.value) {
        orbit.value = false;
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        return;
      }
      if (dirty.value && !confirm("当前页面有未保存修改，确认离开？")) {
        history.replaceState(null, "", "#" + active.value);
        return;
      }
      navigating = true;
      crash.value = false;
      notice.value = "";
      orbit.value = false;
      fog.value = true;
      await new Promise((r) => setTimeout(r, 170));
      active.value = id;
      dirty.value = false;
      crash.value = false;
      history.replaceState(null, "", "#" + id);
      window.scrollTo({ top: 0 });
      await new Promise((r) => setTimeout(r, 100));
      fog.value = false;
      navigating = false;
      if (queued) {
        const next = queued;
        queued = null;
        go(next);
      }
    }
    async function submitAuth(e: Event) {
      e.preventDefault();
      if (busy.value) return;
      const em = email.value.trim();
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(em)) {
        error.value = "请输入有效邮箱，例如 name@example.com";
        return;
      }
      if (authMode.value === "register" && (!/[A-Za-z]/.test(password.value) || !/\d/.test(password.value))) {
        error.value = "密码需同时包含字母和数字";
        return;
      }
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/auth/" + authMode.value, "POST", {
          email: email.value,
          password: password.value,
          role: authMode.value === "register" ? "user" : loginRole.value,
          displayName: authMode.value === "register" ? displayName.value : undefined,
        });
        Object.assign(session, r);
        void loadAnnouncements();
        auth.value = false;
        password.value = "";
        displayName.value = "";
        showPassword.value = false;
        if (r.user?.role === "admin") {
          notice.value = "管理员登录成功";
          go("admin");
        } else {
          notice.value =
            authMode.value === "register"
              ? "账号已创建，资料将只保存在你的账号下"
              : "登录成功";
        }
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }
    async function logout() {
      if (dirty.value && !confirm("当前有未保存修改，确认退出？")) return;
      try {
        await api("/auth/logout", "POST", {});
        session.user = null;
        session.csrf = null;
        dirty.value = false;
        authMode.value = "login";
        loginRole.value = "user";
        active.value = "home";
        history.replaceState(null, "", "#home");
        notice.value = "已退出，私人资料不会展示给下一个账号";
      } catch (e) {
        notice.value = errorText(e);
      }
    }
    const loginPrompt = () =>
      h("section", { class: "card empty" }, [
        h("h2", "让经历只属于你"),
        h(
          "p",
          "登录后查看岗位与题库、保存学习进度、收藏和投递方案，也能管理个人信息与简历版本。私人数据按账号隔离。",
        ),
        h(
          "button",
          {
            class: "primary",
            onClick: () => {
              authMode.value = "login";
              auth.value = true;
            },
          },
          "登录 / 注册",
        ),
      ]);
    function home() {
      return h("div", [
        h("section", { class: "journey-hero" }, [
          h("span", { class: "eyebrow" }, "YOUR NEXT CHAPTER"),
          h("h1", ["每一步，", h("em", "都离理想更近。")]),
          h(
            "p",
            "从城市、职业方向或你自己的经历开始。属于你的求职旅程，不必只有一种顺序。",
          ),
          h("div", { class: "hero-status" }, [
            h("span", { class: "live-dot" }),
            "已接通 · 真实岗位、投递方案、题库与学习进度",
          ]),
        ]),
        h("div", { class: "guide-prompt" }, [
          h("span", "第一次使用？"),
          h("button", { onClick: () => go("guide") }, "看项目介绍"),
          h("span", "不知道某个按钮做什么，就点“功能说明”，或直接问看板娘。"),
        ]),
        h("div", { class: "journey-choices" }, [
          h(
            "button",
            {
              onClick: () => {
                dashboardMode.value = "city";
                go("dashboard");
              },
            },
            [
              h("span", "01 · DISCOVER"),
              h("h2", "先看看城市"),
              h("p", "从你向往的地方，寻找下一站机会。"),
              h("b", "探索城市 ↗"),
            ],
          ),
          h(
            "button",
            {
              onClick: () => {
                dashboardMode.value = "career";
                go("dashboard");
              },
            },
            [
              h("span", "02 · EXPLORE"),
              h("h2", "先选职业方向"),
              h("p", "从你想做的事，发现适合自己的路径。"),
              h("b", "探索方向 ↗"),
            ],
          ),
          h("button", { onClick: () => go("profile") }, [
            h("span", "03 · YOUR STORY"),
            h("h2", "填写个人信息"),
            h("p", "不需要先有简历，从你的经历开始。"),
            h("b", "开始整理 ↗"),
          ]),
        ]),
        h("section", { class: "journey-path" }, [
          h("h2", "你的求职旅程"),
          h(
            "div",
            { class: "path-items" },
            [
              ["profile", "认识自己"],
              ["resume", "打磨简历"],
              ["jobs", "探索岗位"],
              ["practice", "针对准备"],
              ["interview", "面试练习"],
              ["plan", "从容投递"],
            ].map(([id, label], i) =>
              h("button", { onClick: () => go(id) }, [
                h("span", String(i + 1).padStart(2, "0")),
                label,
              ]),
            ),
          ),
        ]),
        h(
          "div",
          { class: "notice" },
          "账号、资料、简历编辑、岗位与投递方案已接通；面经题库支持来源核对、收藏和自评复习。AI审阅与话术质量需以实际调用验证为准，题库暂不提供AI讲题或自动生成。",
        ),
      ]);
    }
    function content() {
      if (crash.value)
        return h("div", { class: "error" }, [
          notice.value,
          h(
            "button",
            {
              onClick: () => {
                crash.value = false;
              },
            },
            "重新打开本页",
          ),
        ]);
      if (active.value === "home") return home();
      if (active.value === "guide") return h(Guide, { key: "guide" });
      if (active.value === "knowledge") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Knowledge, { key: session.user.id + active.value });
      }
      if (active.value === "jobs" || active.value === "plan") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(active.value === "jobs" ? Jobs : Plan, {
          key: session.user.id + active.value,
          onDirty: (v: boolean) => (dirty.value = v),
        });
      }
      if (active.value === "study-upload") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h("iframe", { class: "orig-frame", src: "/orig/#/upload", title: "上传题库" });
      }
      // 模拟面试：真实页面（不再用原型 iframe）
      if (active.value === "interview") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Interview, { key: session.user.id + "interview" });
      }
      // 学习与刷题：原项目 review 页面（科目列表 / 版本 / 复习）
      if (active.value === "practice") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h("iframe", {
          class: "orig-frame",
          title: "学习与刷题",
          src: reviewId.value ? "/orig/#/review/" + reviewId.value : bootPracticeRoute,
        });
      }
      // 个性化设置：真实设置页
      if (active.value === "settings") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Settings, { key: session.user.id + "settings" });
      }
      // 企业观察：真实数据页面，不再用 iframe 包原型（也避免重复出现第二套看板娘）
      if (active.value === "companies") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Companies, { key: session.user.id + "companies" });
      }
      // 租房与生活：真实数据页面
      if (active.value === "housing") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Housing, { key: session.user.id + "housing" });
      }
      // 城市与通勤地图：真实高德地图，不再用 iframe 包原型
      if (active.value === "map") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(CityMap, { key: session.user.id + "map" });
      }
      // 我的数据空间：真实页面，不再用 iframe 包原型
      if (active.value === "data") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Datasets, { key: session.user.id + "data" });
      }
      // 就业数据大屏：真实聚合页面，不再用 iframe 包原型
      if (active.value === "dashboard") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Dashboard, { key: session.user.id + "dashboard" });
      }
      if (active.value === "chat") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Chat, { key: session.user.id + "chat" });
      }
      if (active.value === "wish") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(Wish, { key: session.user.id + "wish" });
      }
      if (active.value === "profile" || active.value === "resume") {
        if (!session.ready) return h("p", { role: "status" }, "正在恢复会话…");
        if (!session.user) return loginPrompt();
        return h(active.value === "profile" ? Profile : Resume, {
          key: session.user.id + active.value,
          onDirty: (v: boolean) => (dirty.value = v),
        });
      }
      return h("div", [
        h(
          "div",
          { class: "preview-note" },
          "此页为已确认的外观原型，真实业务待后续批次接通。",
        ),
        h("iframe", {
          class: "prototype-frame",
          src: "/preview/index.html#" + active.value,
          title: title.value + "外观参考",
          sandbox:
            "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads",
        }),
      ]);
    }
    return () =>
      active.value === "admin"
        ? h(Admin, { key: "admin" })
        : h("div", { class: "immersive-main" }, [
        h(MouseTrail),
        h("div", { class: "map-preload-images", "aria-hidden": "true" },
          MAP_PRELOAD.map((src) => h("img", { key: src, src, alt: "", draggable: false }))),
        h("header", { class: "sky-header" }, [
          h(
            "a",
            {
              class: "sky-brand",
              href: "#home",
              onClick: (e: Event) => {
                e.preventDefault();
                go("home");
              },
            },
            [
              h("span", "✦"),
              h("div", ["逐光", h("small", "CAREER COMPANION")]),
            ],
          ),
          h("span", { class: "sky-now" }, title.value),
          h("div", { class: "sky-actions" }, [
            h(
              "button",
              {
                class: "journey-map-entry",
                onClick: () => { starMapMode.value = "classic"; orbit.value = true; },
              },
              "旅程地图",
            ),
            h("button", { class: "notice-entry", title: "站内通告", onClick: () => (noticeOpen.value = true) }, [
              "通告",
              unreadNotices.value.length ? h("b", unreadNotices.value.length > 9 ? "9+" : String(unreadNotices.value.length)) : null,
            ]),
            h("button", { class: "guide-link", title: "查看项目功能说明", onClick: () => go("guide") }, "功能说明"),
            h("button", { class: "theme-toggle", title: theme.value === "night" ? "切换到日间主题" : "切换到夜间主题", "aria-label": theme.value === "night" ? "切换到日间主题" : "切换到夜间主题", onClick: toggleTheme }, theme.value === "night" ? "☀️" : "🌙"),
            session.user
              ? h(
                  "button",
                  { class: "account-chip", title: "账号设置", onClick: () => go("settings") },
                  [
                    h("span", { class: "account-avatar" }, accountInitial.value),
                    h("span", { class: "account-name" }, accountName.value),
                  ],
                )
              : null,
            h(
              "button",
              {
                onClick: () => {
                if (session.user) return void logout();
                authMode.value = "login";
                loginRole.value = "user";
                error.value = "";
                auth.value = true;
              },
              },
              session.user ? "退出登录" : "登录 / 注册",
            ),

          ]),
        ]),
        noticeOpen.value
          ? h("div", { class: "notice-mask", onClick: () => (noticeOpen.value = false) }, h("div", { class: "notice-modal", onClick: (e: Event) => e.stopPropagation() }, [
              h("div", { class: "notice-modal-head" }, [h("h2", "站内通告"), h("button", { "aria-label": "关闭通告", onClick: () => (noticeOpen.value = false) }, "×")]),
              announcements.value.length
                ? announcements.value.map((n) => h("article", { class: "notice-item" + (readNoticeIds.value.includes(n.id) ? " read" : "") }, [
                    h("strong", n.title),
                    h("p", n.body),
                    h("div", { class: "notice-item-foot" }, [
                      h("small", new Date(n.createdAt).toLocaleString()),
                      readNoticeIds.value.includes(n.id)
                        ? h("span", "已阅")
                        : h("button", { onClick: () => markNoticeRead(n.id) }, "已阅"),
                    ]),
                  ]))
                : h("p", { class: "muted" }, "暂无通告。"),
              h("button", { class: "notice-all-read", onClick: () => { for (const n of announcements.value) markNoticeRead(n.id); } }, "全部已阅"),
            ]))
          : null,
        notice.value
          ? h("div", { class: "toast", role: "status" }, [
              notice.value,
              h(
                "button",
                {
                  "aria-label": "关闭提示",
                  onClick: () => (notice.value = ""),
                },
                "×",
              ),
            ])
          : null,
        hidePets.value || orbit.value ? null : petSkin.value === "live2d" ? h(MainPet) : null,
        hidePets.value || orbit.value ? null : petSkin.value === "avatar"
          ? h(AgentPet, { key: "xingye", agentId: "xingye", name: "星野", role: "主理人", avatar: "/assets/companions/b-1.png", slot: 0, page: active.value })
          : null,
        ...(hidePets.value || orbit.value ? [] : [
          { id: "zhiwei", name: "知微", role: "学习助教", avatar: "/assets/companions/b-3.png", slot: 1 },
          { id: "yanzhou", name: "砚舟", role: "求职顾问", avatar: "/assets/companions/a-2.png", slot: 2 },
          { id: "qichi", name: "栖迟", role: "生活管家", avatar: "/assets/companions/a-1.jpg", slot: 3 },
        ].map((a) => h(AgentPet, { key: a.id, agentId: a.id, name: a.name, role: a.role, avatar: a.avatar, slot: a.slot, page: active.value }))),
        hidePets.value || orbit.value ? null : h(CompanionsV3),
        h("main", { class: "page-content" }, [
          content(),
          h(
            "footer",
            { class: "page-footer" },
            "逐光 · 不替你决定，陪你迈出下一步",
          ),
        ]),
        h(OrbitTrigger, {
          expanded: orbit.value,
          onToggle: () => {
            if (!orbit.value) starMapMode.value = "rpg";
            orbit.value = !orbit.value;
          },
        }),
        h("div", { class: "star-map-slot", style: { display: orbit.value && starMapMode.value === "rpg" ? "block" : "none" } },
          h(RpgStarMap, {
            pages,
            active: active.value,
            onGo: (id: string) => { orbit.value = false; go(id); },
            onClose: () => (orbit.value = false),
          })),
        h("div", { class: "star-map-slot", style: { display: orbit.value && starMapMode.value === "classic" ? "block" : "none" } },
          h(ClassicStarMap, {
            pages,
            active: active.value,
            onGo: (id: string) => { orbit.value = false; go(id); },
            onClose: () => (orbit.value = false),
          })),
        fog.value ? h("div", { class: "fog-veil" }) : null,
        auth.value
          ? h(
              "div",
              {
                class: "modal-backdrop",
                onClick: (e: MouseEvent) => {
                  if (e.target === e.currentTarget && !busy.value)
                    auth.value = false;
                },
              },
              [
                h(
                  "section",
                  {
                    class: "auth-modal",
                    role: "dialog",
                    "aria-modal": true,
                    "aria-label": authMode.value === "login" ? "登录" : "注册",
                  },
                  [
                    h(
                      "button",
                      {
                        class: "modal-close",
                        "aria-label": "关闭登录",
                        disabled: busy.value,
                        onClick: () => (auth.value = false),
                      },
                      "×",
                    ),
                    h("span", { class: "eyebrow" }, "WELCOME TO YOUR JOURNEY"),
                    h(
                      "h2",
                      authMode.value === "login"
                        ? "欢迎回来"
                        : "开启你的求职旅程",
                    ),
                    h("p", "以独立账号保存经历，不使用共享演示资料。"),
                    authMode.value === "login"
                      ? h("div", { class: "auth-role" }, [
                          h("button", {
                            type: "button",
                            class: loginRole.value === "user" ? "on" : "",
                            onClick: () => (loginRole.value = "user"),
                          }, "用户登录"),
                          h("button", {
                            type: "button",
                            class: loginRole.value === "admin" ? "on" : "",
                            onClick: () => (loginRole.value = "admin"),
                          }, "管理员登录"),
                        ])
                      : null,
                    h("form", { onSubmit: submitAuth }, [
                      authMode.value === "register"
                        ? h("label", { class: "field" }, [
                            h("span", "用户名（可选）"),
                            h("input", {
                              type: "text",
                              value: displayName.value,
                              maxlength: 24,
                              placeholder: "不填就用邮箱前缀",
                              autocomplete: "nickname",
                              onInput: (e: Event) => (displayName.value = (e.target as HTMLInputElement).value),
                            }),
                          ])
                        : null,
                      h("label", { class: "field" }, [
                        h("span", "邮箱"),
                        h("input", {
                          type: "email",
                          value: email.value,
                          required: true,
                          pattern: "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}",
                          title: "请输入有效邮箱，例如 name@example.com",
                          autocomplete: "username",
                          maxlength: 254,
                          onInput: (e: Event) =>
                            (email.value = (
                              e.target as HTMLInputElement
                            ).value),
                        }),
                      ]),
                      h("div", { class: "field" }, [
                        h(
                          "label",
                          { for: "auth-password" },
                          authMode.value === "register" ? "密码（10—128位，至少含字母和数字）" : "密码（10—128位）",
                        ),
                        h("div", { class: "password-field" }, [
                          h("input", {
                            id: "auth-password",
                            type: showPassword.value ? "text" : "password",
                            value: password.value,
                            required: true,
                            minlength: 10,
                            maxlength: 128,
                            pattern: authMode.value === "register" ? "(?=.*[A-Za-z])(?=.*\\d).{10,128}" : undefined,
                            title: authMode.value === "register" ? "密码需 10—128 位，且同时包含字母和数字" : undefined,
                            autocomplete:
                              authMode.value === "login"
                                ? "current-password"
                                : "new-password",
                            onInput: (e: Event) =>
                              (password.value = (
                                e.target as HTMLInputElement
                              ).value),
                          }),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "password-eye",
                              "aria-label": showPassword.value
                                ? "隐藏密码"
                                : "显示密码",
                              "aria-pressed": showPassword.value,
                              "aria-controls": "auth-password",
                              onClick: () =>
                                (showPassword.value = !showPassword.value),
                            },
                            [
                              h(
                                "svg",
                                {
                                  viewBox: "0 0 24 24",
                                  width: 21,
                                  height: 21,
                                  fill: "none",
                                  stroke: "currentColor",
                                  "stroke-width": 1.6,
                                  "aria-hidden": true,
                                },
                                [
                                  h("path", {
                                    d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z",
                                  }),
                                  h("circle", { cx: 12, cy: 12, r: 3 }),
                                  showPassword.value
                                    ? h("path", { d: "M3 3l18 18" })
                                    : null,
                                ],
                              ),
                            ],
                          ),
                        ]),
                      ]),
                      error.value
                        ? h("p", { class: "error", role: "alert" }, error.value)
                        : null,
                      h(
                        "button",
                        {
                          type: "submit",
                          class: "primary",
                          disabled: busy.value,
                        },
                        busy.value
                          ? "正在处理…"
                          : authMode.value === "login"
                            ? "登录"
                            : "创建账号",
                      ),
                    ]),
                    h(
                      "button",
                      {
                        class: "text-button",
                        disabled: busy.value,
                        onClick: () => {
                          authMode.value =
                            authMode.value === "login" ? "register" : "login";
                          loginRole.value = "user";
                          error.value = "";
                        },
                      },
                      authMode.value === "login"
                        ? "没有账号？注册一个"
                        : "已有账号，返回登录",
                    ),
                    h(
                      "small",
                      "尚未接通邮件验证或密码找回，请勿使用常用真实密码。",
                    ),
                  ],
                ),
              ],
            )
          : null,
      ]);
  },
});
const app0 = createApp(app);
app0.use(createPinia());
app0.use(Vant);
app0.mount("#app");
