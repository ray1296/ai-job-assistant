import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const p=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const out=[];const ok=(name,cond,extra='')=>out.push((cond?'PASS':'FAIL')+' | '+name+(extra?' | '+extra:''));
await p.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForSelector('.immersive-main',{timeout:8000}).catch(()=>{});
await p.screenshot({path:'v3-home.png',fullPage:true});
// 1 shell
ok('immersive shell', await p.locator('.immersive-main').count()===1);
ok('sky header', await p.locator('.sky-header .sky-brand').count()===1);
ok('orbit trigger', await p.locator('.orbit-trigger').count()===1);
ok('no old sidebar', await p.locator('aside.sidebar').count()===0);
ok('no agent rail', await p.locator('.agent-rail').count()===0);
// 2 orbit overlay
await p.locator('.orbit-trigger').click();
await p.waitForTimeout(200);
const ovVisible = await p.locator('.orbit-overlay').isVisible().catch(()=>false);
ok('orbit overlay opens', ovVisible);
const items = await p.locator('.orbit-item').evaluateAll(es=>es.map(e=>e.dataset.page));
ok('orbit has pages', items.includes('dashboard')&&items.includes('practice')&&items.includes('profile')&&items.includes('resume'), items.join(','));
await p.locator('.orbit-overlay .orbit-close').click();
await p.waitForTimeout(200);
ok('orbit overlay closes', await p.locator('.orbit-overlay').isHidden().catch(()=>false));
// 3 fog transition on nav
await p.locator('.orbit-trigger').click();await p.waitForTimeout(150);
await p.locator('.orbit-item[data-page="dashboard"]').click();
await p.waitForTimeout(600);
ok('navigated to dashboard (fog)', (await p.evaluate(()=>location.hash))==='#dashboard');
ok('fog veil present', await p.locator('.fog-veil').count()===1);
await p.waitForTimeout(900);
ok('fog veil removed', await p.locator('.fog-veil').count()===0);
// 4 dashboard controls
await p.screenshot({path:'v3-dashboard.png',fullPage:true});
ok('dashboard controls', await p.locator('.dashboard-controls').count()===1);
ok('focus buttons', await p.locator('.dashboard-focus .btn').count()===2);
ok('direction select', await p.locator('select[data-action="dashdirection"]').count()===1);
ok('city scroll track', await p.locator('.city-scroll-track').count()===1);
const cityCount=await p.locator('.city-choice').count();
ok('many cities', cityCount>20, 'count='+cityCount);
ok('fullscreen btn', await p.locator('[data-action="fullscreen"]').count()===1);
const frameBox=await p.locator('.dashboard-frame').boundingBox();
ok('landscape frame', frameBox&&frameBox.width>frameBox.height, frameBox?Math.round(frameBox.width)+'x'+Math.round(frameBox.height):'nobox');
// 5 legacy iframe: selector + cloud canvas
const df=p.frameLocator('.dashboard-frame');
await df.locator('.dashboard-selector .city-wheel').waitFor({timeout:6000}).catch(()=>{});
ok('legacy city wheel', await df.locator('.city-wheel .city-wheel-item').count()>0);
ok('legacy direction wheel', await df.locator('.direction-wheel').count()===1);
await df.locator('.city-wheel-item').nth(3).click().catch(()=>{});
ok('legacy wordcloud canvas', await df.locator('.panel-right canvas').count()>=1);
// 6 home explore routing
await p.evaluate(()=>{location.hash='home'});await p.waitForTimeout(700);
await p.locator('[data-action="explorecity"]').click();await p.waitForTimeout(700);
ok('explorecity -> dashboard', (await p.evaluate(()=>location.hash))==='#dashboard');
// 7 profile chips
await p.evaluate(()=>{location.hash='profile'});await p.waitForTimeout(700);
ok('big upload btn', await p.locator('.big-upload').count()===1);
ok('pref city input', await p.locator('#pref-city').count()===1);
await p.locator('#pref-city').fill('深圳');
await p.locator('[data-confirm="city"]').click();await p.waitForTimeout(150);
ok('city chip added', await p.locator('#tags-city .preference-tag').count()>=1);
ok('input cleared', (await p.locator('#pref-city').inputValue())==='');
const tagTxt=await p.locator('#tags-city .preference-tag').first().innerText();
ok('chip text', tagTxt.includes('深圳'), tagTxt);
// remove chip
await p.locator('#tags-city .preference-tag button[data-remove-pref]').first().click();await p.waitForTimeout(150);
ok('chip removed', await p.locator('#tags-city .preference-tag').count()===0);
// 8 grow textarea
const g=await p.locator('textarea.grow-text').count();
ok('grow textareas exist', g>=1, 'count='+g);
// 9 resume AI hints
await p.evaluate(()=>{location.hash='resume'});await p.waitForTimeout(700);
ok('ai help strip', await p.locator('.ai-help-strip').count()===1);
ok('ai help buttons', await p.locator('.ai-help').count()>=2);
ok('decor toggle', await p.locator('.decor-toggle input[type="checkbox"]').count()===1);
await p.screenshot({path:'v3-resume.png',fullPage:true});
// admin page keeps admin layout
await p.evaluate(()=>{location.hash='admin'});await p.waitForTimeout(700);
await p.screenshot({path:'v3-admin.png',fullPage:true});
console.log(out.join('\n'));
console.log('---PAGE ERRORS---');
console.log(errors.length?errors.join('\n'):'(none)');
await browser.close();
