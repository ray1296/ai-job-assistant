import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: "/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"], headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
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

  const chk = p.locator(".decor-toggle input");
  await chk.waitFor();
  assert.equal(await chk.isChecked(), false, "默认应关闭");
  assert.equal(await p.locator(".decor-controls").count(), 0, "未开启时不应显示风格控件");
  console.log("PASS 默认关闭、不显示控件（不会发起调用）");

  await chk.check();
  console.log("  已勾选，等待服务端生图（约 20–40 秒）…");
  const img = p.locator(".resume-document .decor-band img");
  await img.waitFor({ timeout: 150000 });
  const info = await p.evaluate(() => {
    const i = document.querySelector(".resume-document .decor-band img");
    const b = document.querySelector(".resume-document .decor-band");
    return { w: i.naturalWidth, h: i.naturalHeight, complete: i.complete, band: Math.round(b.getBoundingClientRect().height) };
  });
  assert.ok(info.w > 0 && info.h > 0, "装饰图应真实加载");
  assert.ok(info.band > 20 && info.band < 120, "装饰条应为窄幅，不遮挡正文: " + info.band);
  console.log("PASS 生图成功并渲染：" + info.w + "x" + info.h + "，装饰条高 " + info.band + "px");

  assert.equal(await p.locator(".decor-controls").count(), 1, "开启后应显示风格控件");
  assert.equal(await p.getByRole("button", { name: "移除装饰" }).count(), 1);
  console.log("PASS 生成后出现风格选择与移除按钮");

  await p.screenshot({ path: "/tmp/decor-applied.png" });

  await p.getByRole("button", { name: "移除装饰" }).click();
  await p.waitForTimeout(500);
  assert.equal(await p.locator(".resume-document .decor-band").count(), 0, "移除后不应有装饰条");
  assert.equal(await p.locator(".decor-toggle input").isChecked(), false, "移除后开关应回到关闭");
  console.log("PASS 可移除装饰并恢复白板");

  assert.deepEqual(errs, []);
  console.log("PASS 无浏览器渲染错误");
  console.log("TOTAL 生图装饰验证全部通过");
} catch (e) {
  console.log("FAILED:", e.message.slice(0, 400));
  await p.screenshot({ path: "/tmp/decor-fail.png" }).catch(() => {});
  console.log("浏览器错误:", errs.slice(0, 5).join(" | "));
  process.exitCode = 1;
} finally {
  await browser.close();
}
