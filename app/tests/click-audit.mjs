import fs from "node:fs";
import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const email = "qa-click-" + Date.now() + "@example.invalid";
const password = "QA-Click-12345!";
const initial = fs.readFileSync("private/admin-initial.txt", "utf8");
const ae = initial.match(/email:\s*(.+)/)[1].trim();
const ap = initial.match(/password:\s*(.+)/)[1].trim();
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(base + "/api/auth/register", { data: { email, password, displayName: "点击审计" } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => void d.dismiss().catch(() => {}));
page.on("filechooser", (f) => void f.cancel().catch(() => {}));
let clickErrors = 0;
const SKIP = /退出登录|删除|清空|重置密码|移除|撤销|采纳|退回|开始模拟|结束面试|发送|上传|选择文件|下载|打印|生成|AI|审阅|帮我在附近|规划路线|搜索|保存|提交|创建|复制|编辑|新增|添加|重置|刷新|换装|展开星盘|旅程地图|通告|功能说明|账号设置|全屏大屏/;
const pages = ["home", "profile", "resume", "data", "jobs", "plan", "dashboard", "map", "companies", "housing", "knowledge", "interview", "chat", "wish", "settings", "guide"];
let total = 0, clicked = 0, noops = 0, blocked = 0;
const findings = [];
async function reset(hash) {
  await page.goto(base + "/#" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(550);
}
for (const hash of pages) {
  await reset(hash);
  const controls = await page.locator("button:visible").evaluateAll((els) => els.map((e, i) => ({
    i, text: (e.innerText || "").trim().replace(/\s+/g, " "), title: e.getAttribute("title") || "",
    aria: e.getAttribute("aria-label") || "", disabled: !!e.disabled,
  })));
  const seen = new Set();
  for (const c of controls) {
    const label = c.text || c.title || c.aria;
    const key = label + "|" + c.title;
    if (!label || c.disabled || seen.has(key) || SKIP.test(label)) continue;
    seen.add(key);
    if (seen.size > 45) break;
    total++;
    await reset(hash);
    const btns = page.locator("button:visible");
    const loc = btns.nth(c.i);
    if (!(await loc.count())) { blocked++; findings.push({ hash, label, type: "locator-missing" }); continue; }
    const responsesBefore = [];
    const onResp = () => responsesBefore.push(1);
    page.on("response", onResp);
    await page.evaluate(() => {
      window.__auditMut = 0;
      window.__auditObserver?.disconnect?.();
      window.__auditObserver = new MutationObserver((m) => { window.__auditMut += m.length; });
      window.__auditObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const before = await page.evaluate(() => ({ url: location.href, len: document.body.innerText.length, dialogs: document.querySelectorAll('[role=dialog],.modal,.overlay,.show').length, store: JSON.stringify(localStorage).length }));
    let err = "";
    try { await loc.click({ timeout: 2500 }); await page.waitForTimeout(650); }
    catch (e) { blocked++; findings.push({ hash, label, type: "click-timeout", detail: String(e.message).slice(0, 100) }); page.off("response", onResp); continue; }
    const after = await page.evaluate(() => ({ url: location.href, len: document.body.innerText.length, mut: window.__auditMut || 0, dialogs: document.querySelectorAll('[role=dialog],.modal,.overlay,.show').length, store: JSON.stringify(localStorage).length, crash: /这个页面暂时出错|Cannot read|undefined is not/.test(document.body.innerText) }));
    page.off("response", onResp);
    clicked++;
    if (after.crash) { noops++; findings.push({ hash, label, type: "crash" }); continue; }
    if (after.mut === 0 && responsesBefore.length === 0 && after.url === before.url && after.dialogs === before.dialogs && after.store === before.store && after.len === before.len) {
      noops++; findings.push({ hash, label, type: "no-visible-effect" });
    }
  }
  console.log("PAGE", hash, "unique", seen.size);
}
console.log("SUMMARY", { total, clicked, noops, blocked, pageErrors: pageErrors.length });
for (const f of findings) console.log("FINDING", JSON.stringify(f));
try {
  const l = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ae, password: ap, role: "admin" }) });
  if (l.ok) { const c = (l.headers.get("set-cookie") || "").split(";")[0]; const s = await l.json(); const h = { Cookie: c, "X-CSRF-Token": s.csrf, "Content-Type": "application/json" }; const users = await (await fetch(base + "/api/admin/users", { headers: h })).json(); const me = users.users.find((u) => u.email === email); if (me) await fetch(base + "/api/admin/users/" + me.id, { method: "DELETE", headers: h }); }
} catch {}
await browser.close();
