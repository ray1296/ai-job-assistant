import { chromium } from "playwright-core";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1400,height:900}});
await c.request.post(base+"/api/auth/register",{data:{email:"set-"+Date.now()+"@example.invalid",password:"Set-Test-12345!"}});
const p=await c.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,120)));
for (const [route,sel] of [["#settings",".settings-row"],["#practice",".study-page"],["#companies",".company-card"],["#housing",".housing-item"]]) {
  await p.goto(base+"/"+route);
  try { await p.locator(sel).first().waitFor({timeout:20000}); console.log(route, "OK"); }
  catch { console.log(route, "FAIL"); }
}
await p.screenshot({path:"/tmp/settings.png"});
console.log("errors:", errs.slice(0,4));
await b.close();
