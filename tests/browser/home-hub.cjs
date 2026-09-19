const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const instrument={symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',assetType:'EQUITY',exchange:'NSE',price:100,categories:[]};
 const now=Date.now(),tasks=[{id:'home-pending',instrument,kind:'alert',price:105,condition:'above',side:'BUY',orderType:'Limit',quantity:1,product:'DELIVERY',createdAt:now-10000,expiresAt:now+86400000,status:'pending'},{id:'home-trigger',instrument,kind:'alert',price:95,condition:'above',side:'BUY',orderType:'Limit',quantity:1,product:'DELIVERY',createdAt:now-20000,expiresAt:now+86400000,status:'triggered',completedAt:now-1000}];
 await page.addInitScript(({instrument,tasks,now})=>{if(!localStorage.getItem('home-test-seeded')){localStorage.setItem('papertrade-orders',JSON.stringify([{id:'home-entry',symbol:'RELIANCE',instrumentKey:instrument.instrumentKey,side:'BUY',product:'INTRADAY',quantity:2,price:100,status:'COMPLETE',createdAt:now,time:'10:00',assetType:'EQUITY'}]));localStorage.setItem('papertrade-price-tasks-v1:local',JSON.stringify(tasks));localStorage.setItem('papertrade-last-chart',JSON.stringify({symbol:instrument.symbol,instrument,timeframe:'15m',workspaceMode:'trade'}));localStorage.setItem('home-test-seeded','1');}}, {instrument,tasks,now});
 await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('**/api/**',r=>r.fulfill({json:{ok:true,quotes:{},candles:[],underlyings:[],instruments:[],status:'CLOSED',sessions:[],date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}),checkedAt:Date.now()}}));
 await page.goto(process.env.HOME_APP_URL||'http://localhost:3220');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 await page.getByRole('heading',{name:'Your trading day'}).waitFor();assert.equal(await page.getByText('Build skill before you risk capital.',{exact:true}).count(),0);
 await page.getByText('Holdings concentration',{exact:true}).waitFor();await page.getByText('No holdings',{exact:true}).waitFor();await page.getByText('Closed-app monitoring unavailable',{exact:true}).waitFor();
 assert.equal(await page.locator('.home-attention-open').count(),3);
 const orders=await page.evaluate(()=>localStorage.getItem('papertrade-orders'));
 await page.getByRole('button',{name:/RELIANCE · Alert triggered/}).click();await page.getByRole('dialog',{name:'Alerts',exact:true}).waitFor();assert.equal(await page.locator('.price-alert-item').count(),1);await page.getByRole('button',{name:'Show all alerts'}).waitFor();await page.getByRole('button',{name:'Close price actions'}).click();
 await page.getByRole('button',{name:/RELIANCE · No recorded stop-loss/}).click();assert.equal(await page.locator('.home-workspace').count(),0);await page.getByRole('button',{name:'Home',exact:true}).last().click();
 const resume=await page.locator('.home-resume-card').textContent();await page.locator('.home-resume-card').click();assert.equal(await page.locator('.home-workspace').count(),0);await page.getByRole('button',{name:'Home',exact:true}).last().click();assert.equal(await page.locator('.home-resume-card').textContent(),resume);
 await page.getByRole('button',{name:/Realised today/}).click();await page.getByRole('tab',{name:'Trades',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Trades',exact:true}).getAttribute('aria-selected'),'true');await page.getByRole('button',{name:'Home',exact:true}).last().click();
 await page.getByLabel('Search stocks and indices',{exact:true}).fill('xxxxxxxxx');await page.getByText('No matching stocks or indices.').waitFor();await page.getByRole('button',{name:'Clear search',exact:true}).click();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Home overflow ${width}`);await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollTop=0);if(width===390)await page.screenshot({path:'outputs/home-hub-mobile.png'});}
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Use neon dark theme'}).click();await page.waitForTimeout(400);await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'outputs/home-hub-dark.png'});await page.locator('.home-resume-card').scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/home-hub-attention.png'});
 assert.ok(await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await page.getByRole('button',{name:'Hide balances on Home',exact:true}).click();
 assert.equal(await page.locator('.home-portfolio-value b').textContent(),'••••');
 assert.equal(await page.locator('.home-pnl-split .positive,.home-pnl-split .negative').count(),0,'Privacy also conceals P&L direction');
 await page.getByRole('button',{name:'Reviewed',exact:true}).first().click();
 await page.getByRole('button',{name:'Remind in 1 hour',exact:true}).first().click();
 assert.equal(await page.locator('.home-attention-open').count(),1);
 const tasksBefore=await page.evaluate(()=>localStorage.getItem('papertrade-price-tasks-v1:local'));
 await page.reload();await page.getByRole('heading',{name:'Your trading day'}).waitFor();await page.getByRole('button',{name:'Show balances on Home'}).waitFor();
 assert.equal(await page.locator('.home-portfolio-value b').textContent(),'••••');
 await page.getByRole('button',{name:'Show reviewed / later (2)',exact:true}).click();
 assert.equal(await page.locator('.home-attention-open').count(),1);assert.equal(await page.getByRole('button',{name:'Restore',exact:true}).count(),2);
 await page.getByRole('button',{name:'Restore',exact:true}).first().click();await page.getByRole('button',{name:'Restore',exact:true}).first().click();
 assert.equal(await page.locator('.home-attention-open').count(),3);
 assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-price-tasks-v1:local')),tasksBefore,'Review must not modify alerts');
 await page.getByRole('button',{name:'Show balances on Home'}).click();
 assert.notEqual(await page.locator('.home-portfolio-value b').textContent(),'••••');
 await page.getByLabel('Search stocks and indices',{exact:true}).fill('RELIANCE');
 await page.getByRole('button',{name:'Preview RELIANCE',exact:true}).click();await page.getByRole('dialog',{name:'RELIANCE stock preview'}).waitFor();
 await page.getByRole('button',{name:'Close preview',exact:true}).click();
 await page.getByLabel('Search stocks and indices',{exact:true}).click();await page.getByText('Recent searches',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Open RELIANCE chart',exact:true}).click();assert.equal(await page.locator('.home-workspace').count(),0);
 await page.getByRole('button',{name:'Home',exact:true}).last().click();await page.getByLabel('Search stocks and indices',{exact:true}).click();
 await page.getByText('Recent searches',{exact:true}).waitFor();await page.getByRole('button',{name:'Clear recent',exact:true}).click();assert.equal(await page.getByText('Recent searches',{exact:true}).count(),0);
 await page.getByLabel('Search stocks and indices',{exact:true}).press('Escape');
 await page.evaluate(()=>localStorage.setItem('papertrade-custom-watchlists',JSON.stringify([{id:'home-favourites',name:'Favourites',symbols:['RELIANCE']}])));
 await page.reload();await page.getByRole('heading',{name:'Your trading day'}).waitFor();await page.getByLabel('Search stocks and indices',{exact:true}).click();
 await page.getByText('From your watchlists',{exact:true}).waitFor();await page.getByRole('button',{name:'Open RELIANCE chart',exact:true}).waitFor();
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('.home-search-results').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Search overflow ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/home-search-improvements.png'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-orders')),orders,'Home must not modify trades');assert.deepEqual(errors,[]);console.log('Home hub: privacy, reviewed/snoozed persistence, restoration, unchanged trades/alerts, recent/favourite searches, direct chart, routes and four widths pass');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
