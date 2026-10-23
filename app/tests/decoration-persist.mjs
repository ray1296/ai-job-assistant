import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({ executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args: ["--no-sandbox"], headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("dialog", (d) => d.accept());
const map = () => p.getByRole("button", { name: "旅程地图", exact: true });
try {
  await p.goto(base);
  await map().click();
  await p.getByRole("heading", { name: "你的旅程地图" }).waitFor();
  await p.getByRole("button", { name: "收起星盘 ×" }).click();
  await p.getByRole("button", { name: "登录 / 注册", exact: true }).click();
  await p.getByLabel("密码（10—128位）").fill("Decoration-Test-123!");
  await p.getByRole("button", { name: "没有账号？注册一个" }).click();
  await p.getByLabel("邮箱", { exact: true }).fill("decor-" + Date.now() + "@example.invalid");
  await p.getByRole("button", { name: "创建账号", exact: true }).click();
  await p.getByRole("button", { name: "退出登录" }).waitFor();
  await map().click();
  await p.getByRole("button", { name: /简历工作室/ }).click();
  await p.getByRole("button", { name: "创建第一份简历" }).click();
  await p.locator(".resume-document").first().waitFor();

  await p.locator(".decor-toggle input").check();
  console.log("  生成中…");
  await p.locator(".resume-document .decor-band img").waitFor({ timeout: 150000 });
  const src1 = await p.locator(".resume-document .decor-band img").getAttribute("src");
  console.log("PASS 生成，" + src1);
  assert.match(src1, /^\/api\/decoration-assets\/[a-f0-9]{24}\.png$/);

  // 图片可通过带会话的 GET 取回
  const code = await p.evaluate(async (u) => (await fetch(u)).status, src1);
  assert.equal(code, 200, "装饰图应能以会话取回");
  console.log("PASS 装饰图经 HTTP 200 可取回");

  // 撤销/重做（刷新后撤销栈会清空，故在刷新前验证）
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(500);
  assert.equal(await p.locator(".resume-document .decor-band").count(), 0, "撤销应移除装饰");
  console.log("PASS 装饰可被撤销");
  await p.keyboard.press("Control+Shift+z");
  await p.waitForTimeout(500);
  await p.locator(".resume-document .decor-band img").waitFor({ timeout: 15000 });
  console.log("PASS 装饰可被重做");

  // Word 导出（含装饰）应可下载
  const dl = p.waitForEvent("download", { timeout: 60000 });
  await p.getByRole("button", { name: "下载 Word", exact: true }).click();
  const file = await dl;
  const wp = "/tmp/decor-word.docx";
  await file.saveAs(wp);
  const st = await (await import("node:fs/promises")).stat(wp);
  assert.ok(st.size > 5000, "Word 文件应非空");
  console.log("PASS Word 导出 " + st.size + " 字节");

  await p.getByRole("button", { name: "保存当前版本", exact: true }).last().click();
  await p.getByText("当前版本已保存", { exact: true }).waitFor();
  console.log("PASS 已保存");
  await p.reload();
  await p.locator(".resume-document").first().waitFor();
  await p.waitForTimeout(1200);
  assert.equal(await p.locator(".decor-toggle input").isChecked(), true, "刷新后应仍为已启用");
  await p.locator(".resume-document .decor-band img").waitFor({ timeout: 15000 });
  console.log("PASS 刷新后装饰仍在（已持久化）");

  assert.deepEqual(errs, []);
  console.log("PASS 无浏览器错误");
  console.log("TOTAL 持久化验证通过");
} catch (e) {
  console.log("FAILED:", e.message.slice(0, 400));
  await p.screenshot({ path: "/tmp/decor-persist-fail.png" }).catch(() => {});
  console.log("浏览器错误:", errs.slice(0, 5).join(" | "));
  process.exitCode = 1;
} finally { await browser.close(); }
