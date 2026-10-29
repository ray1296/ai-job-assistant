import { chromium } from "playwright-core";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
try {
  await p.goto(base);
  await p.getByRole("button", { name: "旅程地图", exact: true }).click();
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByLabel("密码（10—128位）").fill("Decoration-Test-123!");
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p.getByLabel("邮箱", { exact: true }).fill("shot-" + Date.now() + "@example.invalid");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await p.getByRole("button", { name: "旅程地图", exact: true }).click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.locator(".resume-document").first().waitFor();
  await p.waitForTimeout(600);
  await p.screenshot({ path: "/tmp/view-blank.png", fullPage: false });
  console.log("已存白板截图");

  // 生成 minimal 风格
  await p.locator(".decor-toggle input").check();
  await p.locator(".resume-document .decor-band img").waitFor({ timeout: 150000 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: "/tmp/view-decorated.png", fullPage: false });
  console.log("已存装饰截图");

  // 切到 tech 风格：用「重新生成」按钮
  await p.locator(".decor-controls select").selectOption("tech");
  await p.getByRole("button", { name: /重新生成|生成中/ }).click();
  await p.waitForTimeout(1000);
  await p.getByRole("button", { name: "重新生成", exact: true }).waitFor({ timeout: 150000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/view-tech.png", fullPage: false });
  console.log("已存 tech 风格截图；错误:", errs.length ? errs.slice(0,3).join(" | ") : "无");
} catch (e) {
  console.log("FAILED:", e.message.slice(0, 300));
  console.log("装饰条数:", await p.locator(".resume-document .decor-band").count().catch(()=>-1));
  console.log("decor-error 文本:", await p.locator(".decor-error").first().textContent().catch(()=>"(无)"));
  console.log("notice 文本:", await p.locator(".notice, [role=status]").first().textContent().catch(()=>"(无)"));
  await p.screenshot({ path: "/tmp/view-fail.png" }).catch(()=>{});
  process.exitCode = 1;
} finally { await browser.close(); }
