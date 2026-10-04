/* eslint-disable @typescript-eslint/no-require-imports -- Runtime-selected browser packages. */
const assert = require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const now=Date.parse('2026-10-05T05:00:00Z');
const headers=['Name','ISIN Code','NSE Code','BSE Code','Industry','Pledged percentage','Return on equity','Average return on equity 3Years','Average return on equity 5Years','Return on capital employed','Average return on capital employed 3Years','Average return on capital employed 5Years','Debt to equity','Net Profit','Price to Earning','Industry PE','Profit growth 3Years','Profit growth 5Years','Sales growth 3Years','Sales growth 5Years','OPM','PEG Ratio','Current ratio','Quick ratio','YOY Quarterly sales growth','YOY Quarterly profit growth','Sales','Sales last year','Net Profit last year'];
const names=['Alpha Engineering','Beta Engineering','Gamma Engineering','Delta Engineering','Epsilon Engineering','Zeta Software'];
const symbols=['ALPHA','BETA','GAMMA','DELTAQA','EPSILON','ZETA'];
const keys=names.map((_,i)=>`NSE_EQ|INE000A010${i}1`);
const csv=[headers,...names.map((name,i)=>[name,keys[i].split('|')[1],symbols[i],500001+i,i===5?'Software':'Engineering',0,18+i,19,18,22,21,20,.2,500,18+i,20,15,12,11,10,16,1,2,1.5,18,20,1000,900,400])].map(row=>row.join(',')).join('\n');
const dates=[];let t=Date.parse('2026-10-01T03:45:00Z');while(dates.length<280){if(![0,6].includes(new Date(t).getUTCDay()))dates.unshift(t/1000);t-=86400000;}
const bars=i=>dates.map((time,n)=>{const close=100+n*(.15+i*.025);return {time,open:close-.2,high:close+1,low:close-1,close,volume:200000};});
(async()=>{
 const pack=require(process.env.CHROMIUM_PACKAGE), binary=pack.default||pack;
 const browser=await chromium.launch({headless:true,executablePath:await binary.executablePath(),args:binary.args});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);await page.clock.setFixedTime(now);
 const errors=[], requests=[];let failOne=false,slow=false;
 await page.addInitScript(()=>{if(window===window.top&&location.protocol==='http:')localStorage.setItem('papertrade-chart-indicators-v1',JSON.stringify({ema21:true,rsi:true}));});
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('https://assets.upstox.com/**',r=>r.abort());
 await page.route('**/api/**',async r=>{
 const u=new URL(r.request().url());
 if(u.pathname==='/api/market/session')return r.fulfill({json:{ok:true,session:{date:'2026-10-05',checkedAt:now,status:'NORMAL_OPEN',source:'fixture',sessions:[{start:Date.parse('2026-10-05T03:45:00Z'),end:Date.parse('2026-10-05T10:00:00Z')}]}}});
 if(u.pathname==='/api/upstox/candles'){
 const key=u.searchParams.get('instrumentKey'),i=Math.max(0,keys.indexOf(key));
 if(u.searchParams.get('years')==='3') { requests.push(key);if(slow)await new Promise(resolve=>setTimeout(resolve,400)); if(failOne&&key===keys[5])return r.fulfill({status:503,json:{ok:false,error:{message:'Fixture history unavailable'}}}); }
 return r.fulfill({json:{ok:true,source:'upstox',instrumentKey:key,timeframe:u.searchParams.get('timeframe'),segments:['historical'],candles:bars(i),fetchedAt:new Date(now).toISOString()}});
 }
 if(u.pathname==='/api/upstox/quotes'){
 const req=JSON.parse(r.request().postData()||'{}'),quotes={};
 for(const key of req.keys||[]) {const i=Math.max(0,keys.indexOf(key)),price=bars(i).at(-1).close;quotes[key]={instrumentKey:key,symbol:symbols[i],lastPrice:price,netChange:1,changePercent:1,open:price-1,high:price+1,low:price-2,previousClose:price-1,lastTradeAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),volume:200000};}
 return r.fulfill({json:{ok:true,quotes}});
 }
 return r.fulfill({json:{ok:true,quotes:{},candles:[],underlyings:[],instruments:[],ipos:[],articles:[],connected:true}});
 });
 for(let attempt=0;;attempt++){try{await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3236');break;}catch(e){if(attempt>59)throw e;await page.waitForTimeout(1000);}}
 await page.locator('.main-nav').waitFor({timeout:60000});
 const open=async()=>{const nav=page.viewportSize().width<=940?'.mobile-bottom-nav':'.main-nav';await page.locator(nav).getByRole('button',{name:'Fundamental Analysis',exact:true}).click();await page.getByRole('heading',{name:'Fundamental Analysis',exact:true}).waitFor();};
 await open();await page.getByLabel('Import fundamental CSV').setInputFiles({name:'research-fixture.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.getByRole('button',{name:'6 companies',exact:true}).waitFor();console.log('Imported research universe');
 assert.equal(await page.getByRole('button',{name:'Compare this company’s peers',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Discover top stocks →',exact:true}).count(),0);
 await page.locator('.fa-rules summary').click();assert.equal(await page.locator('.fa-rules li').count(),3);assert.doesNotMatch(await page.locator('.fa-rules').innerText(),/CSV|chart connections|stock-scout/);
 if(process.env.RESEARCH_SCREENSHOTS){await page.setViewportSize({width:390,height:844});await page.locator('.fa-rules').scrollIntoViewIfNeeded();await page.screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/rules-mobile.png`});await page.setViewportSize({width:1440,height:1000});}
 await page.getByRole('button',{name:'Peer comparison',exact:true}).click();
 assert.equal(await page.locator('.research-matrix thead th').count(),5);
 await page.locator('.research-picker summary').click();await page.getByLabel('Search peers').fill('delta');await page.getByLabel('Compare Delta Engineering',{exact:true}).check();
 assert.equal(await page.locator('.research-matrix thead th').count(),6);await page.getByLabel('Search peers').fill('epsilon');assert.ok(await page.getByLabel('Compare Epsilon Engineering',{exact:true}).isDisabled());
 await page.getByRole('button',{name:'Remove Beta Engineering from comparison',exact:true}).click();await page.getByLabel('Compare Epsilon Engineering',{exact:true}).check();
 await page.getByRole('button',{name:'All metrics',exact:true}).click();assert.equal(await page.locator('.research-matrix tbody tr').count(),26);
 await page.getByLabel('Comparison baseline').selectOption({label:'ALPHA'});assert.match(await page.locator('.research-matrix').innerText(),/vs ALPHA/);
 await page.getByLabel('Differences only').check();assert.ok(await page.locator('.research-matrix tbody tr').count()<26);
 await page.getByLabel('Differences only').uncheck();await page.getByRole('button',{name:'Overview',exact:true}).click();
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('.fundamental-workspace.navigation-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Peer window fits ${width}`);}
 if(process.env.RESEARCH_SCREENSHOTS){await page.locator('.fundamental-workspace.navigation-page').screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/peers.png`});await page.locator('.research-matrix-scroll').screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/peer-matrix.png`});}
 await page.getByRole('button',{name:'Top stocks',exact:true}).click();await page.getByRole('button',{name:'Generate top stocks',exact:true}).click();
 await page.locator('.research-top-table tbody tr').first().waitFor();assert.equal(requests.length,7);assert.equal(await page.locator('.research-top-table tbody tr').count(),4);console.log('Four-horizon scan and diversification passed');
 const orders=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-orders')||'[]'));
 assert.equal((await orders()).length,0);
 for(const h of ['1M','3M','6M','12M']){await page.getByRole('navigation',{name:'Top stocks horizon'}).getByRole('button',{name:new RegExp(`^${h}`)}).click();assert.equal(await page.locator('.research-top-table tbody tr').count(),4);}
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export all horizons'}).click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/papertrade-top-stocks/);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.locator('.fundamental-workspace.navigation-page').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Top stocks fits ${width}`);}
 if(process.env.RESEARCH_SCREENSHOTS){await page.locator('.fundamental-workspace.navigation-page').screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/top-stocks.png`});await page.locator('.research-top-scroll').screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/ranked-stocks.png`});await page.setViewportSize({width:390,height:844});await page.locator('.research-top-table tbody tr').first().screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/mobile-stock.png`});await page.setViewportSize({width:1440,height:1000});}
 await page.locator('.research-top-table tbody tr').first().getByRole('button',{name:'Compare peers',exact:true}).click();await page.getByLabel('Peer comparison desk').waitFor();await page.getByRole('button',{name:'Top stocks',exact:true}).click();assert.equal(requests.length,7,'changing tabs preserves scan');
 failOne=true;await page.getByRole('button',{name:'Refresh prices & rank'}).click();await page.getByText('5 of 6 candidates have usable price history.',{exact:false}).waitFor();assert.equal(await page.locator('.research-top-table tbody tr').count(),3);await page.locator('.research-exclusions summary').click();assert.match(await page.locator('.research-exclusions').innerText(),/Fixture history unavailable/);failOne=false;
 await page.getByRole('button',{name:'Refresh prices & rank'}).click();await page.getByText('6 of 6 candidates have usable price history.',{exact:false}).waitFor();
 const first=page.locator('.research-top-table tbody tr').first();const firstName=await first.locator('.research-stock-title b').innerText();
 await first.getByRole('button',{name:/Simulate trade/}).click();const dialog=page.getByRole('dialog',{name:firstName,exact:true});await dialog.waitFor();
 await page.getByLabel('Simulation capital budget').fill('1');assert.ok(await dialog.getByRole('button',{name:/Review paper order/}).isDisabled());await page.getByLabel('Simulation capital budget').fill('25000');
 await page.getByLabel('Simulated price move').fill('-10');assert.match(await dialog.locator('.research-scenario').innerText(),/-10.0%/);assert.equal((await orders()).length,0);
 const cdp=await page.context().newCDPSession(page);
 for(const [width,height] of [[320,568],[390,844],[768,700],[1440,1000],[390,430]]){
   await page.setViewportSize({width,height});await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:24,bottom:24,left:0,right:0}});
   const frame=await dialog.boundingBox();assert.ok(frame.x>=-1&&frame.y>=23&&frame.x+frame.width<=width+1&&frame.y+frame.height<=height+1,`Simulation bounds at ${width}x${height}: ${JSON.stringify(frame)}`);
   assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'No sideways scrolling');
   for(const control of [dialog.getByRole('button',{name:'Close trade simulation'}),dialog.getByRole('button',{name:/Review paper order/})]){
     const box=await control.boundingBox();assert.ok(box.y>=frame.y&&box.y+box.height<=height-24+1,'Dialog controls clear device safe areas');
   }
   await dialog.locator('.research-simulation-body').evaluate(e=>e.scrollTop=e.scrollHeight);await dialog.getByRole('button',{name:/Review paper order/}).click({trial:true});
   await dialog.locator('.research-simulation-body').evaluate(e=>e.scrollTop=0);
   if(process.env.RESEARCH_SCREENSHOTS&&width===390&&height===844)await page.screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/simulation-mobile.png`});
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.terminal-shell').evaluate(e=>e.dataset.theme='neon');
 if(process.env.RESEARCH_SCREENSHOTS)await page.screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/simulation-dark.png`});
 await dialog.getByRole('button',{name:'Close trade simulation'}).click();assert.ok(await first.getByRole('button',{name:/Simulate trade/}).evaluate(e=>e===document.activeElement),'Closing restores trigger focus');
 await first.getByRole('button',{name:/Simulate trade/}).click();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.research-simulation[open]').count(),0);
 await first.getByRole('button',{name:/Simulate trade/}).click();
 await page.locator('.terminal-shell').evaluate(e=>e.dataset.theme='light');
 await page.setViewportSize({width:1440,height:1000});await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});
 if(process.env.RESEARCH_SCREENSHOTS)await dialog.screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/simulation.png`});
 await dialog.getByRole('button',{name:/Review paper order/}).click();await page.locator('.research-ticket-note').waitFor();await page.locator('.order-ticket.mobile-open').waitFor();
 assert.equal((await orders()).length,0,'opening order ticket cannot fill');
 const ticket=page.locator('.order-ticket');await ticket.locator('.place-order').waitFor();await page.waitForFunction(()=>!document.querySelector('.place-order')?.disabled);
 assert.match(await ticket.innerText(),/Top Stocks research draft/);assert.match(await ticket.locator('textarea').inputValue(),/Top Stocks 12M/);
 await ticket.locator('.place-order').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('papertrade-orders')||'[]').length===1);
 const filled=(await orders())[0];assert.equal(filled.product,'DELIVERY');assert.equal(filled.side,'BUY');assert.ok(filled.quantity>0);
 const protections=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-protections')||'[]'));assert.equal(protections.length,1);assert.ok(protections[0].targetPrice>filled.price);assert.ok(protections[0].stopLossPrice<filled.price);console.log('Research plan filled through real paper wallet with protection');
 await page.reload();await page.locator('.main-nav').waitFor();assert.equal((await orders()).length,1);await page.setViewportSize({width:390,height:844});await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Charts',exact:true}).click();
 for(const [width,height] of [[320,568],[390,844],[768,700],[900,600]]){
   await page.setViewportSize({width,height});await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:24,bottom:24,left:0,right:0}});
   const nav=await page.locator('.mobile-bottom-nav').boundingBox(),footer=page.locator('.permanent-trade-footer');
   for(const side of ['buy','sell']){
     const button=footer.locator(`.${side}`),box=await button.boundingBox();assert.ok(box&&box.height>=44&&box.y+box.height<=nav.y+1,`${side} clears navigation at ${width}`);
     await button.click({trial:true});
   }
   const status=await page.locator('.chart-statusbar').boundingBox(),dock=await footer.boundingBox();assert.ok(status.y+status.height<=dock.y+1,'Trade dock does not cover chart controls');
 }
 await page.setViewportSize({width:390,height:844});
 if(process.env.RESEARCH_SCREENSHOTS)await page.screenshot({path:`${process.env.RESEARCH_SCREENSHOTS}/chart-mobile.png`});
 for(const side of ['sell','buy']){await page.locator(`.permanent-trade-footer .${side}`).click();await page.locator('.order-ticket.mobile-open').waitFor();await page.locator('.order-ticket').getByRole('button',{name:'Close paper order',exact:true}).click();}
 assert.equal((await orders()).length,1,'Opening Buy/Sell never submits a trade');
 await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}});await page.setViewportSize({width:1440,height:1000});
 await open();await page.getByRole('button',{name:'6 companies',exact:true}).waitFor();
 await page.getByRole('button',{name:'Top stocks',exact:true}).click();slow=true;await page.getByRole('button',{name:'Generate top stocks',exact:true}).click();await page.getByRole('button',{name:'Cancel scan',exact:true}).click();await page.getByText('Scan cancelled. No orders were placed.',{exact:true}).waitFor();assert.equal((await orders()).length,1);
 assert.deepEqual(errors,[]);console.log('Research browser checks passed: peer selection/medians, four horizons, partial failures, responsive layouts, preview, actual paper trade, persistence and cancellation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
