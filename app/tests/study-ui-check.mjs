import { chromium } from "playwright-core";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1400,height:900}});
await c.request.post(base+"/api/auth/register",{data:{email:"ui-"+Date.now()+"@example.invalid",password:"Ui-Test-12345!"}});
const p=await c.newPage();
const errs=[]; p.on("pageerror",e=>errs.push(e.message.slice(0,140)));
await p.goto(base+"/#practice");
await p.locator(".study-page").waitFor({timeout:20000});
await p.waitForTimeout(1500);
console.log("初始空态:", await p.locator(".card.empty").count() > 0 ? "空" : "有内容");
// 新建科目
await p.getByRole("button",{name:"＋ 新建科目"}).click();
await p.locator(".modal input").fill("Java 后端春招");
await p.getByRole("button",{name:"创建",exact:true}).click();
await p.locator(".study-subject").first().waitFor({timeout:15000});
console.log("科目卡片:", await p.locator(".study-subject").count());
// 导入版本
await p.getByRole("button",{name:"＋ 版本"}).first().click();
await p.locator(".modal input").first().fill("面经导入");
await p.getByRole("button",{name:"导入",exact:true}).click();
await p.waitForTimeout(3000);
console.log("版本数:", await p.locator(".study-version").count());
// 进入刷题
await p.locator(".study-version-open").first().click();
await p.locator(".study-question").waitFor({timeout:15000});
console.log("题目:", (await p.locator(".study-question h2").innerText()).slice(0,30));
console.log("题型标签:", (await p.locator(".study-tags span").first().innerText()));
// 知识卡片翻面
await p.locator(".study-card").click();
await p.waitForTimeout(600);
console.log("卡片已翻面:", await p.locator(".study-card.flipped").count() > 0);
await p.getByRole("button",{name:"下一题"}).click();
console.log("进度文本:", (await p.locator(".study-practice-head small").innerText()).slice(0,40));
await p.screenshot({path:"/tmp/study.png", fullPage:true});
console.log("errors:", errs.slice(0,3));
await b.close();
