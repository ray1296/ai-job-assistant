import { chromium } from "playwright-core";
const base="http://127.0.0.1:5173";
const b=await chromium.launch({executablePath:"/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",headless:true,args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:1500,height:1200}});
const p=await c.newPage();
await p.goto(base);
await p.getByRole("button",{name:"旅程地图",exact:true}).click();
await p.getByRole("heading",{name:"你的旅程地图"}).waitFor();
await p.getByRole("button",{name:"收起星盘 ×"}).click();
await p.getByRole("button",{name:"登录 / 注册",exact:true}).click();
await p.getByRole("button",{name:"没有账号？注册一个"}).click();
await p.getByLabel("邮箱",{exact:true}).fill("shot-"+Date.now()+"@example.invalid");
await p.getByLabel("密码（10—128位）").fill("Shot-Test-123!");
await p.getByRole("button",{name:"创建账号",exact:true}).click();
await p.getByRole("button",{name:"退出登录"}).waitFor();
await p.getByRole("button",{name:"旅程地图",exact:true}).click();
await p.getByRole("button",{name:/简历工作室/}).click();
await p.getByRole("button",{name:"创建第一份简历"}).click();
await p.locator(".resume-document").first().waitFor();
// 1) AI 助手条：只剩"描述新板块"
await p.locator(".ai-help-strip").screenshot({path:"/tmp/shot-ai-strip.png"});
// 2) 生成新板块面板
await p.getByRole("button",{name:/描述新板块/}).click();
await p.getByLabel("AI编辑需求").fill("加一个开源贡献板块：我维护一个 Vue 组件库，做过代码审查与发版");
await p.getByRole("button",{name:/AI 生成并添加板块/}).click();
await p.getByText(/已新增板块/).waitFor({timeout:180000});
await p.waitForTimeout(600);
// 3) 装饰面板（文档下方独立卡片）
await p.locator(".decor-panel").scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await p.locator(".decor-panel").screenshot({path:"/tmp/shot-decor-panel.png"});
// 4) 整页
await p.evaluate(()=>window.scrollTo(0,0));
await p.waitForTimeout(300);
await p.screenshot({path:"/tmp/shot-studio-full.png", fullPage:true});
console.log("shots ok");
await b.close();
