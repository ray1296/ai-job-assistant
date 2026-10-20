import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:'/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const p=await b.newPage({viewport:{width:1440,height:1050}});
await p.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForSelector('.immersive-main').catch(()=>{});
await p.screenshot({path:'v3b-home.png',fullPage:true});
// dashboard
await p.locator('.orbit-trigger').click();await p.waitForTimeout(150);
await p.locator('.orbit-item[data-page="dashboard"]').click();await p.waitForTimeout(1500);
const df=p.frameLocator('.dashboard-frame');
await df.locator('.dashboard-selector .city-wheel').waitFor({timeout:6000}).catch(()=>{});
// close-up of word cloud canvas
const canv=df.locator('.panel-right canvas').first();
await canv.screenshot({path:'v3b-wordcloud.png'}).catch(()=>{});
await p.screenshot({path:'v3b-dashboard.png',fullPage:true});
await b.close();
console.log('captured');