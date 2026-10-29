import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1440,height:1100}});
const p=await c.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message));
let n=0; const pass=m=>{console.log("PASS",m);n++;};
try{
await p.goto(base);
await p.getByRole("button",{name:"旅程地图",exact:true}).click();
await p.getByRole("heading",{name:"你的旅程地图"}).waitFor();
await p.getByRole("button",{name:"收起星盘 ×"}).click();
await p.getByRole("button",{name:"登录 / 注册",exact:true}).click();
await p.getByRole("button",{name:"没有账号？注册一个"}).click();
await p.getByLabel("邮箱",{exact:true}).fill("layout-"+Date.now()+"@example.invalid");
await p.getByLabel("密码（10—128位）").fill("Layout-Test-123!");
await p.getByRole("button",{name:"创建账号",exact:true}).click();
await p.getByRole("button",{name:"退出登录"}).waitFor();
await p.getByRole("button",{name:"旅程地图",exact:true}).click();
await p.getByRole("button",{name:/简历工作室/}).click();
await p.getByRole("button",{name:"创建第一份简历"}).click();
await p.locator(".resume-document").first().waitFor();
// 打开"排版"面板
await p.getByRole("button",{name:"排版",exact:true}).click();
const btn=p.getByRole("button",{name:/AI推荐布局|AI正在分析布局/});
await btn.waitFor();
const before=await p.locator(".resume-document").first().evaluate(e=>getComputedStyle(e).fontSize);
console.log("before fontSize:", before);
await btn.click();
await p.locator(".ai-layout-preview").waitFor({timeout:180000});
pass("AI 布局建议已返回并在面板中预览");
const reason=await p.locator(".ai-layout-preview p").first().innerText();
console.log("预览:", reason.slice(0,80));
await p.getByRole("button",{name:"应用此布局到草稿"}).click();
await p.waitForTimeout(800);
const after=await p.locator(".resume-document").first().evaluate(e=>({fs:getComputedStyle(e).fontSize, cls:e.className}));
console.log("after:", JSON.stringify(after));
pass("应用布局后文档样式被改写: "+JSON.stringify(after));
assert.deepEqual(errs,[]);
pass("无浏览器错误");
console.log("TOTAL 调整外观布局 UI 链路通过 ("+n+")");
}catch(e){ console.log("FAILED:", e.message.slice(0,300)); process.exitCode=1; }
finally{ await b.close(); }
