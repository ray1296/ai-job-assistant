import { createApp } from "vue";
import { createPinia } from "pinia";
import Vant from "vant";
import "vant/lib/index.css";
import "../orig/reset.css";
import "../orig/themes.css";
import "../orig/common.css";
import App from "./App.vue";
import router from "./router";

// 把主站的 CSRF 同步进来（同源 cookie 会话）
async function bootstrap() {
  try {
    const r = await fetch("/api/auth/session", { credentials: "same-origin" });
    const j = await r.json();
    (window as any).__zgCsrf = j?.csrf || "";
  } catch {}
}
void bootstrap();

// 主站用 zg.theme=night；题库外壳没有夜间主题，映射到内置 midnight 暗色主题。
function syncTheme() {
  try {
    const night = localStorage.getItem("zg.theme") === "night";
    document.documentElement.dataset.theme = night ? "midnight" : "paper";
    document.documentElement.style.colorScheme = night ? "dark" : "light";
  } catch {}
}
syncTheme();
window.addEventListener("storage", (e) => { if (e.key === "zg.theme") syncTheme(); });

const app = createApp(App);
app.use(createPinia());
app.use(Vant);
app.use(router);
app.mount("#app");
