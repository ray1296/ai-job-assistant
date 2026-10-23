import { chromium } from "playwright-core";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1500,height:1150}});
await c.request.post(base+"/api/auth/register",{data:{email:"deco2-"+Date.now()+"@example.invalid",password:"Deco-Test-123!"}});
const p=await c.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,120)));
await p.goto(base+"/#resume");
await p.getByRole("button",{name:"创建第一份简历"}).click();
await p.locator(".resume-document").first().waitFor();
// 勾选装饰开关（此时不应产生任何请求/装饰）
await p.locator(".decor-toggle input").check();
await p.waitForTimeout(800);
console.log("勾选后装饰带数量(应为0):", await p.locator(".resume-document .decor-band").count());
// 点 AI 审阅优化 → 应先生成两张装饰
await p.getByRole("button",{name:/开始审阅并生成优化建议/}).click();
await p.locator(".resume-document .decor-band").first().waitFor({timeout:200000});
await p.locator(".resume-document .decor-band-footer").waitFor({timeout:180000}).catch(()=>{});
await p.waitForTimeout(1500);
console.log("装饰带数量:", await p.locator(".resume-document .decor-band").count());
console.log("页脚带:", await p.locator(".resume-document .decor-band-footer").count());
const srcs = await p.locator(".resume-document .decor-band img").evaluateAll(els=>els.map(e=>e.getAttribute("src")));
console.log("图片:", srcs.join(", "));
await p.screenshot({path:"/tmp/deco2.png", fullPage:false});
console.log("errors:", errs.slice(0,4));
await b.close();
