import { defineComponent, h, ref, onMounted, onBeforeUnmount } from "vue";
import { api, session, errorText } from "./api";
import { ALIYUN_VOICES, speakAs, voiceOn, setVoiceOn } from "./voice";
import { resetPetPositions } from "./pet-store";

const STORE = "zg.companions.v2";

/** 顺序必须与 Live2DPet.vue 的 MODELS / MODEL_NAMES 完全一致，否则存进 localStorage 的索引会选错模型。 */
const PET_MODELS = [
  { key: "miku", file: "miku", label: "未来" },
  { key: "shizuku", file: "shizuku", label: "静流" },
  { key: "chitose", file: "chitose", label: "千岁" },
  { key: "koharu", file: "koharu", label: "小春" },
  { key: "haru", file: "haru", label: "春" },
  { key: "wanko", file: "wanko", label: "汪仔" },
  { key: "vert", file: "vert", label: "薇尔" },
  { key: "nepgear", file: "nepgear_extra", label: "涅普" },
  { key: "haruto", file: "haruto", label: "春人" },
  { key: "haru2", file: "haru2", label: "春·二" },
  { key: "histoire", file: "histoire", label: "史黛" },
  { key: "blanc", file: "blanc_normal", label: "布兰" },
];
const AGENTS = ["星野", "知微", "砚舟", "栖迟"];

export default defineComponent({
  setup() {
    const conf = ref<any>({ size: 1, voice: true, x: 18, y: 96 });
    const accent = ref("purple");
    const currentModel = ref(localStorage.getItem("live2d-pet-model") || "0");
    const hidden = ref(localStorage.getItem("zg.petsHidden") === "1");
    const saved = ref(false);
    const health = ref<any>(null);
    const voiceState = ref(0);
    const accountName = ref(session.user?.displayName || session.user?.email?.split("@")[0] || "");
    const accountBusy = ref(false);
    const accountNotice = ref("");
    const accountError = ref("");
    const currentPassword = ref("");
    const newPassword = ref("");
    const passwordBusy = ref(false);
    const passwordNotice = ref("");
    function accountInitial() {
      return Array.from(accountName.value || "我")[0] || "我";
    }
    async function saveAccount() {
      if (accountBusy.value) return;
      accountBusy.value = true;
      accountError.value = "";
      accountNotice.value = "";
      try {
        const r = await api<any>("/account", "PATCH", { displayName: accountName.value.trim() });
        if (session.user) session.user.displayName = r.user.displayName;
        accountName.value = r.user.displayName;
        accountNotice.value = "用户名已保存。";
      } catch (e) { accountError.value = errorText(e); }
      finally { accountBusy.value = false; }
    }
    async function changePassword() {
      if (passwordBusy.value) return;
      passwordBusy.value = true;
      accountError.value = "";
      passwordNotice.value = "";
      try {
        await api("/account/password", "POST", { currentPassword: currentPassword.value, newPassword: newPassword.value });
        currentPassword.value = "";
        newPassword.value = "";
        passwordNotice.value = "密码已更新。";
      } catch (e) { accountError.value = errorText(e); }
      finally { passwordBusy.value = false; }
    }

    function flash(_msg: string) {
      saved.value = true;
      window.setTimeout(() => (saved.value = false), 1600);
    }
    function setModel(i: number, key: string) {
      currentModel.value = String(i);
      try {
        localStorage.setItem("live2d-pet-model", String(i));
        localStorage.setItem("zg.petModel", key);
      } catch {}
      flash("默认形象已保存");
      window.dispatchEvent(new CustomEvent("zg:pet-model", { detail: { index: i, key } }));
    }
    function setHidden(v: boolean) {
      hidden.value = v;
      document.body.classList.toggle("zg-pets-hidden", v);
      try { localStorage.setItem("zg.petsHidden", v ? "1" : "0"); } catch {}
    }
    function voiceValue(name: string) {
      let raw = "";
      try { raw = localStorage.getItem("zg.voice." + name) || ""; } catch {}
      const hit =
        ALIYUN_VOICES.find((v) => v.id === raw) ||
        ALIYUN_VOICES.find((v) => v.voice === raw);
      return hit ? hit.id : ALIYUN_VOICES[0]?.id || "";
    }
    function setVoice(name: string, id: string) {
      try { localStorage.setItem("zg.voice." + name, id); } catch {}
      voiceState.value++;
      flash("已保存 " + name + " 的音色");
    }
    function previewVoice(name: string) {
      flash("正在用 " + name + " 的音色试听");
      void speakAs(name, "你好，我是" + name + "，这就是我的声音。", true);
    }
    function onMountedLoad() {
      try { conf.value = { ...conf.value, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch {}
      try { accent.value = localStorage.getItem("zg.accent") || "purple"; } catch {}
      api<any>("/health", "GET", undefined, { timeoutMs: 8000 })
        .then((v) => (health.value = v))
        .catch(() => {});
      applyAccent();
    }
    onMounted(() => {
      // 设置页暂时隐藏悬浮看板娘，避免盖住音色/形象等控件（本页就是用来看预览的）
      document.body.classList.add("zg-settings-page");
      onMountedLoad();
    });
    onBeforeUnmount(() => document.body.classList.remove("zg-settings-page"));
    function save() {
      try { localStorage.setItem(STORE, JSON.stringify(conf.value)); } catch {}
      try { localStorage.setItem("zg.accent", accent.value); } catch {}
      applyAccent();
      saved.value = true;
      window.setTimeout(() => (saved.value = false), 1800);
    }
    function applyAccent() {
      const map: Record<string, string> = { purple: "#7460c9", teal: "#2f9e8f", orange: "#e08a3c", navy: "#3b5bdb" };
      document.documentElement.style.setProperty("--accent", map[accent.value] || map.purple);
    }

    return () =>
      h("div", { class: "proto-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "MAKE IT YOURS"),
          h("h1", "个性化设置"),
          h("p", "四只看板娘的位置、声音与形象，以及站点配色"),
        ]),
        h("div", { class: "grid two settings-grid" }, [
          h("section", { class: "card settings-account-card" }, [
            h("h3", "账号资料"),
            h("div", { class: "settings-account-head" }, [
              h("span", { class: "settings-account-avatar" }, accountInitial()),
              h("div", [h("strong", accountName.value || "未设置用户名"), h("small", session.user?.email || "")]),
            ]),
            h("label", { class: "settings-row settings-account-name" }, [
              h("span", "用户名"),
              h("input", {
                value: accountName.value,
                maxlength: 24,
                placeholder: "显示在右上角头像旁",
                onInput: (e: Event) => (accountName.value = (e.target as HTMLInputElement).value),
              }),
              h("button", { class: "btn small", disabled: accountBusy.value, onClick: () => void saveAccount() }, accountBusy.value ? "保存中…" : "保存"),
            ]),
            h("p", { class: "muted" }, "邮箱是登录账号，暂不支持修改；右上角显示用户名首字作为头像。"),
            h("div", { class: "settings-password" }, [
              h("h4", "修改密码"),
              h("input", { type: "password", value: currentPassword.value, placeholder: "当前密码", autocomplete: "current-password", onInput: (e: Event) => (currentPassword.value = (e.target as HTMLInputElement).value) }),
              h("input", { type: "password", value: newPassword.value, placeholder: "新密码（10—128位）", autocomplete: "new-password", onInput: (e: Event) => (newPassword.value = (e.target as HTMLInputElement).value) }),
              h("button", { class: "btn small", disabled: passwordBusy.value || !currentPassword.value || newPassword.value.length < 10, onClick: () => void changePassword() }, passwordBusy.value ? "修改中…" : "修改密码"),
            ]),
            accountError.value ? h("p", { class: "error", role: "alert" }, accountError.value) : null,
            accountNotice.value ? h("p", { class: "settings-ok", role: "status" }, accountNotice.value) : null,
            passwordNotice.value ? h("p", { class: "settings-ok", role: "status" }, passwordNotice.value) : null,
          ]),
          h("section", { class: "card" }, [
            h("h3", "看板娘（四只）"),
            h("label", { class: "settings-row" }, [
              h("span", "显示看板娘"),
              h("input", {
                type: "checkbox",
                checked: !hidden.value,
                onChange: (e: Event) => setHidden(!(e.target as HTMLInputElement).checked),
              }),
              h("small", "关闭后四只立绘全部隐藏，只保留圆盘入口"),
            ]),
            h("div", { class: "settings-row" }, [
              h("span", "位置"),
              h("button", {
                class: "btn small",
                onClick: () => { resetPetPositions(); flash("四只已回到默认位置"); },
              }, "重置四只位置"),
            ]),
            h("div", { class: "settings-row" }, [
              h("span", "语音开关"),
              h("button", {
                class: "btn small" + (voiceOn.value ? " primary" : ""),
                onClick: () => { setVoiceOn(!voiceOn.value); flash(voiceOn.value ? "已恢复自动朗读" : "已静音"); },
              }, voiceOn.value ? "🔊 自动朗读" : "🔇 静音"),
              h("small", "默认自动；也可以在每个对话右上角单独切换"),
            ]),
            h("p", { class: "muted" }, "单击任一立绘打开它自己的对话框（再点一次收起），对话框跟随立绘位置；回复会自动用该 agent 的音色朗读。看板娘可以按住拖动，各自对话彼此独立。"),
            h("p", { class: "muted" }, "为了不挡住这里的控件，设置页会暂时隐藏悬浮看板娘；回到其他页面即可看到改动。"),
            h("h3", { class: "settings-subhead" }, "站点配色"),
            h("div", { class: "settings-accent" }, [["purple", "紫"], ["teal", "青"], ["orange", "橙"], ["navy", "藏蓝"]].map(([k, t]) =>
              h("button", {
                class: "btn small" + (accent.value === k ? " primary" : ""),
                onClick: () => { accent.value = k; save(); },
              }, t))),
            h("h3", { class: "settings-subhead" }, "服务状态"),
            health.value
              ? h("div", { class: "table" }, [
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "AI"), h("span", health.value.ai ? "已配置" : "未配置")]),
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "题库"), h("span", (health.value.questionCount || 0) + " 道")]),
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "版本"), h("span", String(health.value.batch || ""))]),
                ])
              : h("p", { class: "muted" }, "读取中…"),
          ]),
          h("section", { class: "card settings-voices-card" }, [
            h("h3", "音色库（每个 agent 默认音色）"),
            h("div", { class: "settings-voices" }, AGENTS.map((n) =>
              h("div", { class: "settings-voice-row", key: n + ":" + voiceState.value }, [
                h("strong", n),
                h("select", {
                  value: voiceValue(n),
                  title: "选择 " + n + " 的默认音色",
                  onChange: (e: Event) => setVoice(n, (e.target as HTMLSelectElement).value),
                }, ALIYUN_VOICES.map((v: any) =>
                  h("option", { value: v.id }, (v.emoji || "") + " " + (v.label || v.id) + (v.desc ? " · " + v.desc : ""))
                )),
                h("button", {
                  class: "btn small settings-try",
                  title: "用这个音色试听",
                  onClick: () => previewVoice(n),
                }, "试听"),
              ])
            )),
            h("p", { class: "muted" }, "共 " + ALIYUN_VOICES.length + " 档阿里云音色，每个 agent 独立记忆。试听走服务端 qwen3-tts-flash。"),
            h("h3", { class: "settings-subhead" }, "看板娘形象（默认）"),
            h("div", { class: "settings-models" }, PET_MODELS.map((m, i) =>
              h("button", {
                class: "settings-model" + (String(i) === currentModel.value ? " on" : ""),
                onClick: () => setModel(i, m.key),
                title: m.key,
              }, [
                h("img", {
                  src: "/assets/companions/model-" + m.file + ".png",
                  alt: m.label,
                  loading: "lazy",
                }),
                h("span", m.label),
              ])
            )),
            h("p", { class: "muted" }, "这是主看板娘（星野 Live2D 形态）的默认形象，点击即保存为默认。立绘形态下四只显示的是各自头像。"),
          ]),
        ]),
        h("div", { class: "toolbar" }, [
          h("button", { class: "btn primary", onClick: save }, saved.value ? "已保存 ✓" : "保存设置"),
        ]),
      ]);
  },
});
