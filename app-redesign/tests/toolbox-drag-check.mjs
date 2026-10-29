import { chromium } from "playwright-core";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1400,height:860}});
await c.request.post(base+"/api/auth/register",{data:{email:"tb-"+Date.now()+"@example.invalid",password:"Tb-Test-12345!"}});
const ses=await (await c.request.get(base+"/api/auth/session")).json();
const csrf=ses.csrf||ses.session?.csrf;
const jobs=await (await c.request.get(base+"/api/jobs?limit=6")).json();
for(const j of (jobs.jobs||jobs.items||[]).slice(0,2)) await c.request.put(base+"/api/job-intents/"+j.id,{headers:{"X-CSRF-Token":csrf}});
const p=await c.newPage();
await p.goto(base+"/#map");
await p.locator(".map-full").waitFor({timeout:20000});
await p.waitForTimeout(7000);
console.log("handle:", await p.locator(".map-toolbox-handle").count());
// 拖动工具箱
const h=await p.locator(".map-toolbox-handle").boundingBox();
await p.mouse.move(h.x+40,h.y+12); await p.mouse.down(); await p.mouse.move(h.x+340,h.y+180,{steps:8}); await p.mouse.up();
await p.waitForTimeout(400);
console.log("拖动后位置:", await p.locator(".map-toolbox").evaluate(e=>e.style.left+" / "+e.style.top));
// 点标记看信息窗宽度
await p.locator(".amap-dot").first().click({force:true});
await p.waitForTimeout(1200);
const infoCount=await p.locator(".amap-card").count();
console.log("info 数量:", infoCount, "| 弹窗文字:", infoCount? (await p.locator(".amap-card").first().innerText()).replace(/\n/g," | ").slice(0,60):"-");
const box=infoCount? await p.locator(".amap-card").first().boundingBox(): {width:0,height:0};
console.log("信息窗宽高:", Math.round(box.width)+"x"+Math.round(box.height));
await p.screenshot({path:"/tmp/map-tb.png"});
await b.close();
