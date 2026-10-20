import {
  createApp,
  defineComponent,
  h,
  ref,
  computed,
  defineAsyncComponent,
  onMounted,
  onErrorCaptured,
} from "vue";
import { api, session, loadSession, errorText } from "./api";
import Companions from "./companions";
const Profile = defineAsyncComponent(() => import("./profile"));
const Resume = defineAsyncComponent(() => import("./resume"));
const pages = [
  ["home", "求职工作台", "✦"],
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
  ["community", "互助社区 · 心愿池", "☷"],
  ["settings", "个性化设置", "⚙"],
  ["admin", "管理中心", "⊞"],
];
const known = new Set(pages.map((p) => p[0]));
const initial = location.hash.slice(1);
const app = defineComponent({
  setup() {
    const active = ref(known.has(initial) ? initial : "home"),
      orbit = ref(false),
      fog = ref(false),
      auth = ref(false),
      authMode = ref<"login" | "register">("login"),
      email = ref(""),
      password = ref(""),
      showPassword = ref(false),
      busy = ref(false),
      error = ref(""),
      notice = ref(""),
      dirty = ref(false),
      crash = ref(false);
    let navigating = false,
      queued: string | null = null;
    const dashboardMode = ref<"city" | "career">("city");
    const title = computed(
      () => pages.find((p) => p[0] === active.value)?.[1] || "求职工作台",
    );
    onMounted(async () => {
      try {
        await loadSession();
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
        const id = location.hash.slice(1);
        if (!known.has(id) || id === active.value) return;
        go(id);
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
        return;
      }
      if (dirty.value && !confirm("当前页面有未保存修改，确认离开？")) {
        history.replaceState(null, "", "#" + active.value);
        return;
      }
      navigating = true;
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
      busy.value = true;
      error.value = "";
      try {
        const r = await api("/auth/" + authMode.value, "POST", {
          email: email.value,
          password: password.value,
        });
        Object.assign(session, r);
        auth.value = false;
        password.value = "";
        showPassword.value = false;
        notice.value =
          authMode.value === "register"
            ? "账号已创建，资料将只保存在你的账号下"
            : "登录成功";
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
        h("p", "登录后保存个人信息与简历版本，不用在公共演示账号里填写资料。"),
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
            "本批已接通 · 旅程地图、账号、资料、简历原位编辑",
          ]),
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
          "审核提示：账号、个人信息与文档式简历编辑/Word导出已接通；其他页面仍展示外观原型，AI功能尚未接通。",
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
          onLoad: (e: Event) => {
            if (
              active.value === "dashboard" &&
              dashboardMode.value === "career"
            ) {
              const f = e.target as HTMLIFrameElement;
              f.contentDocument
                ?.querySelector<HTMLButtonElement>(
                  "[data-action=dashfocus][data-mode=career]",
                )
                ?.click();
            }
          },
          sandbox:
            "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads",
        }),
      ]);
    }
    return () =>
      h("div", { class: "immersive-main" }, [
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
                onClick: () => (orbit.value = true),
              },
              "旅程地图",
            ),
            session.user
              ? h(
                  "span",
                  { class: "account-email", title: session.user.email },
                  session.user.email,
                )
              : null,
            h(
              "button",
              {
                onClick: () => (session.user ? logout() : (auth.value = true)),
              },
              session.user ? "退出登录" : "登录 / 注册",
            ),
            h(
              "button",
              { class: "admin-portal", onClick: () => go("admin") },
              "管理入口",
            ),
          ]),
        ]),
        h(
          "div",
          { class: "transport-warning" },
          "开发验收环境 · 当前为HTTP，仅使用测试邮箱与测试密码，不上传真实敏感资料；公网正式使用前启用HTTPS。",
        ),
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
        h(Companions),
        h("main", { class: "page-content" }, [
          content(),
          h(
            "footer",
            { class: "page-footer" },
            "逐光 · 不替你决定，陪你迈出下一步",
          ),
        ]),
        h(
          "button",
          {
            class: "orbit-trigger",
            "aria-expanded": orbit.value,
            onClick: () => (orbit.value = !orbit.value),
          },
          [h("i", "☯"), "展开星盘"],
        ),
        orbit.value
          ? h(
              "div",
              {
                class: "orbit-overlay",
                role: "dialog",
                "aria-modal": true,
                "aria-label": "星盘导航",
              },
              [
                h("div", { class: "orbit-head" }, [
                  h("h2", "你的旅程地图"),
                  h(
                    "button",
                    { onClick: () => (orbit.value = false) },
                    "收起星盘 ×",
                  ),
                ]),
                h(
                  "div",
                  { class: "orbit-links" },
                  pages.map(([id, name, icon]) =>
                    h(
                      "button",
                      {
                        class: [
                          "orbit-item",
                          active.value === id ? "selected" : "",
                        ],
                        onClick: () => go(id),
                      },
                      [
                        h("i", icon),
                        name,
                        h(
                          "small",
                          ["home", "profile", "resume"].includes(id)
                            ? "已接通"
                            : "外观原型",
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            )
          : null,
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
                    h("form", { onSubmit: submitAuth }, [
                      h("label", { class: "field" }, [
                        h("span", "邮箱"),
                        h("input", {
                          type: "email",
                          value: email.value,
                          required: true,
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
                          "密码（10—128位）",
                        ),
                        h("div", { class: "password-field" }, [
                          h("input", {
                            id: "auth-password",
                            type: showPassword.value ? "text" : "password",
                            value: password.value,
                            required: true,
                            minlength: 10,
                            maxlength: 128,
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
createApp(app).mount("#app");
