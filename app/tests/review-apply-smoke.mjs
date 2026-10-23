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
await p.getByLabel("邮箱",{exact:true}).fill("review-"+Date.now()+"@example.invalid");
await p.getByLabel("密码（10—128位）").fill("Review-Test-123!");
await p.getByRole("button",{name:"创建账号",exact:true}).click();
await p.getByRole("button",{name:"退出登录"}).waitFor();
// 用页面内 fetch 建一份有真实内容的简历版本
const made = await p.evaluate(async ()=>{
  const s = await (await fetch("/api/auth/session")).json();
  const csrf = s.csrf || s.session?.csrf;
  const doc = { schemaVersion:2,
    header:{name:"李雷", headline:"前端工程师", contact:"lee@example.invalid",
      summary:"负责企业后台前端开发，参与多个项目。"},
    sections:[{id:"s1",title:"教育经历",items:[{id:"i1",title:"某大学 软件工程 本科",meta:"2019-2023",content:"主修课程包括数据结构与操作系统。"}]}],
    pageBreaks:[], layout:{template:"classic",accent:"purple",fontSize:14} };
  const r = await fetch("/api/resumes",{method:"POST",credentials:"same-origin",
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf||""},
    body:JSON.stringify({title:"审阅测试",body:{document:doc}})});
  return {status:r.status, text:(await r.text()).slice(0,200)};
});
console.log("create resume:", made.status, made.text.slice(0,120));
await p.reload();
await p.getByRole("button",{name:"旅程地图",exact:true}).click().catch(()=>{});
await p.getByRole("button",{name:/简历工作室/}).click();
await p.locator(".resume-document").first().waitFor();
await p.getByText("李雷").first().waitFor();
pass("加载到有内容的简历版本");
await p.getByRole("button",{name:/开始审阅并生成优化建议/}).click();
await p.locator(".ai-suggestion").first().waitFor({timeout:180000});
const cnt = await p.locator(".ai-suggestion").count();
pass("AI 返回 "+cnt+" 条可核对建议");
const first = p.locator(".ai-suggestion").first();
const beforeTxt = (await first.locator(".ai-before").innerText()).replace("原文：","").trim();
await first.getByLabel("采纳此项").check();
await p.getByRole("button",{name:/采纳选中建议/}).click();
await p.waitForTimeout(800);
const body = await p.locator(".resume-document").first().innerText();
assert.ok(!body.includes(beforeTxt), "采纳后原文应被替换，仍看到: "+beforeTxt.slice(0,40));
pass("采纳建议后文档被就地改写");
assert.deepEqual(errs,[]);
pass("无浏览器错误");
console.log("TOTAL AI审阅采纳链路通过 ("+n+")");
}catch(e){ console.log("FAILED:", e.message.slice(0,300)); process.exitCode=1; }
finally{ await b.close(); }
