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

const app = createApp(App);
app.use(createPinia());
app.use(Vant);
app.use(router);
app.mount("#app");
