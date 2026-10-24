import { defineComponent, h, ref, onMounted } from "vue";
import { api } from "./api";

const STORE = "zg.companions.v2";

export default defineComponent({
  setup() {
    const conf = ref<any>({ size: 1, voice: true, x: 18, y: 96 });
    const accent = ref("purple");
    const scale = ref(Number(localStorage.getItem("zg.petScale") || 0.45));
    const hidden = ref(localStorage.getItem("zg.petsHidden") === "1");
    function setScale(v: number) {
      scale.value = v;
      document.documentElement.style.setProperty("--pet-scale", String(v));
      try { localStorage.setItem("zg.petScale", String(v)); } catch {}
    }
    function setHidden(v: boolean) {
      hidden.value = v;
      document.body.classList.toggle("zg-pets-hidden", v);
      try { localStorage.setItem("zg.petsHidden", v ? "1" : "0"); } catch {}
    }
    const saved = ref(false);
    const health = ref<any>(null);

    onMounted(async () => {
      try { conf.value = { ...conf.value, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch {}
      try { accent.value = localStorage.getItem("zg.accent") || "purple"; } catch {}
      try { health.value = await api<any>("/health", "GET", undefined, { timeoutMs: 8000 }); } catch {}
      applyAccent();
    });
    function flash(msg: string) { saved.value = true; window.setTimeout(() => (saved.value = false), 1600); }
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
          h("p", "看板娘的大小、声音，以及站点配色"),
        ]),
        h("div", { class: "grid two" }, [
          h("section", { class: "card" }, [
            h("h3", "看板娘"),
            h("label", { class: "settings-row" }, [
              h("span", "显示大小"),
              h("input", { type: "range", min: "0.7", max: "1.6", step: "0.1", value: String(conf.value.size), onInput: (e: Event) => (conf.value = { ...conf.value, size: Number((e.target as HTMLInputElement).value) }) }),
              h("strong", conf.value.size.toFixed(1) + "×"),
            ]),
            h("label", { class: "settings-row" }, [
              h("span", "语音朗读"),
              h("input", { type: "checkbox", checked: conf.value.voice, onChange: (e: Event) => (conf.value = { ...conf.value, voice: (e.target as HTMLInputElement).checked }) }),
              h("small", "看板娘回复时用浏览器语音念出来"),
            ]),
            h("label", { class: "settings-row" }, [
              h("span", "位置"),
              h("button", { class: "btn small", onClick: () => (conf.value = { ...conf.value, x: 18, y: 96 }) }, "重置到左上"),
            ]),
            h("p", { class: "muted" }, "看板娘可以拖动，单个 Agent 的聊天记录在各自气泡里；语音用的是浏览器内置 TTS，不需要额外 key。"),
          ]),
          h("section", { class: "card" }, [
            h("h3", "看板娘（4 个 Agent）"),
            h("label", { class: "settings-row" }, [
              h("span", "整体缩放"),
              h("input", { type: "range", min: "0.25", max: "1", step: "0.05", value: String(scale.value), onInput: (e: Event) => setScale(Number((e.target as HTMLInputElement).value)) }),
              h("strong", scale.value.toFixed(2) + "×"),
            ]),
            h("label", { class: "settings-row" }, [
              h("span", "显示看板娘"),
              h("input", { type: "checkbox", checked: !hidden.value, onChange: (e: Event) => setHidden(!(e.target as HTMLInputElement).checked) }),
              h("small", "关闭后四只全部隐藏，只保留圆盘入口"),
            ]),
            h("div", { class: "settings-row" }, [
              h("span", "位置"),
              h("button", { class: "btn small", onClick: () => { localStorage.removeItem("zg.petFrames.v2"); location.reload(); } }, "重置四只位置"),
            ]),
            h("div", { class: "settings-row" }, [h("span", "看板娘形象")]),
            h("div", { class: "settings-pets" }, [
              { n: "星野", v: ["Cherry", "Serena", "Ethan"] },
              { n: "知微", v: ["Cherry", "Serena", "Ethan"] },
              { n: "砚舟", v: ["Cherry", "Serena", "Ethan"] },
              { n: "栖迟", v: ["Cherry", "Serena", "Ethan"] },
            ].map((p) =>
              h("div", { class: "settings-pet" }, [
                h("strong", p.n),
                h("label", null, [
                  h("span", "音色"),
                  h("select", {
                    value: localStorage.getItem("zg.voice." + p.n) || p.v[0],
                    onChange: (e: Event) => { localStorage.setItem("zg.voice." + p.n, (e.target as HTMLSelectElement).value); flash("已保存 " + p.n + " 的音色"); },
                  }, p.v.map((v) => h("option", { value: v }, v))),
                ]),
                h("label", null, [
                  h("span", "形象"),
                  h("select", {
                    value: localStorage.getItem("zg.petModel." + p.n) || "默认",
                    onChange: (e: Event) => { localStorage.setItem("zg.petModel." + p.n, (e.target as HTMLSelectElement).value); flash("已保存 " + p.n + " 的形象"); },
                  }, ["默认", "静态立绘", "Live2D"].map((v) => h("option", { value: v }, v))),
                ]),
              ]),
            )),
            h("button", { class: "btn small", onClick: () => { location.reload(); } }, "应用并刷新"),
            h("p", { class: "muted" }, "四只分别是：星野（主看板娘，功能完整）、知微、砚舟、栖迟（隔离运行时，各自可换装、可单独拖动，双击把手进入拖动模式）。"),
          ]),
          h("section", { class: "card" }, [
            h("h3", "站点配色"),
            h("div", { class: "settings-accent" }, [["purple", "紫"], ["teal", "青"], ["orange", "橙"], ["navy", "藏蓝"]].map(([k, t]) =>
              h("button", {
                class: "btn small" + (accent.value === k ? " primary" : ""),
                onClick: () => { accent.value = k; save(); },
              }, t))),
            h("h3", { style: "margin-top:18px" }, "服务状态"),
            health.value
              ? h("div", { class: "table" }, [
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "AI"), h("span", health.value.ai ? "已配置" : "未配置")]),
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "题库"), h("span", (health.value.questionCount || 0) + " 道")]),
                  h("div", { class: "tr c2", style: { gridTemplateColumns: "120px 1fr" } }, [h("span", "版本"), h("span", String(health.value.batch || ""))]),
                ])
              : h("p", { class: "muted" }, "读取中…"),
          ]),
        ]),
        h("div", { class: "toolbar" }, [
          h("button", { class: "btn primary", onClick: save }, saved.value ? "已保存 ✓" : "保存设置"),
        ]),
      ]);
  },
});
