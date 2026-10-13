/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser regression harness. */
// Mock feeds exist only in this isolated test browser. Application feeds are unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const now = Date.parse('2026-10-13T05:30:00Z');
const iso = new Date(now).toISOString();
const stocks = [['RELIANCE','Reliance Industries',2782.45,1.24],['HDFCBANK','HDFC Bank',1742.8,-.64],['INFY','Infosys',1891.3,.91],['BHARTIARTL','Bharti Airtel',1785.4,3.28]];
const rows = stocks.map(([symbol,name,price,change])=>({symbol,name,price,change,volume:125000,tradedValue:null,note:null}));
const candles = Array.from({length:200},(_,i)=>{const close=2720+i*.32+Math.sin(i/8)*12;return {time:(now-60000000+i*300000)/1000,open:close-2,high:close+4,low:close-5,close,volume:150000+i*100};});
const orders = Array.from({length:12},(_,i)=>{const at=Date.parse('2026-10-01T04:00:00Z')+i*86400000;const base={symbol:'RELIANCE',instrumentKey:'NSE_EQ|INE002A01018',quantity:10,status:'COMPLETE',product:i%2?'INTRADAY':'DELIVERY'};return [{...base,id:`design-entry-${i}`,side:'BUY',price:2700,createdAt:at,time:'09:30'},{...base,id:`design-exit-${i}`,side:'SELL',price:i%3===0?2680:2735,createdAt:at+3600000,time:'10:30'}];}).flat();
orders.push({id:'design-holding',symbol:'RELIANCE',instrumentKey:'NSE_EQ|INE002A01018',quantity:8,status:'COMPLETE',product:'DELIVERY',side:'BUY',price:2700,createdAt:now-1800000,time:'10:30'});
(async()=>{
 const launch={headless:true};
 if(process.env.CHROMIUM_PACKAGE){const pkg=require(process.env.CHROMIUM_PACKAGE),binary=pkg.default||pkg;Object.assign(launch,{executablePath:await binary.executablePath(),args:binary.args});}
 const browser=await chromium.launch(launch);
 const {SECTORS}=await import('../../lib/sector-heat.ts');
 const shots=process.env.DESIGN_SCREENSHOTS;if(shots)fs.mkdirSync(shots,{recursive:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1050}});page.setDefaultTimeout(20000);await page.clock.setFixedTime(now);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{if(window!==window.top||!location.protocol.startsWith('http'))return;if(!localStorage.getItem('design-seed')){localStorage.setItem('papertrade-orders',JSON.stringify(seed));localStorage.setItem('papertrade-custom-watchlists',JSON.stringify([{id:'design',name:'Core watchlist',symbols:['RELIANCE','HDFCBANK','INFY','BHARTIARTL']}]));localStorage.setItem('papertrade-chart-indicators-v1',JSON.stringify({ema21:true,rsi:true}));localStorage.setItem('design-seed','1');}},orders);
  await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('https://assets.upstox.com/**',r=>r.abort());
  await page.route('**/api/**',async r=>{
   const u=new URL(r.request().url());let json={ok:true,quotes:{},candles:[],underlyings:[],instruments:[],entries:[],connected:true};
   if(u.pathname==='/api/market/session')json={ok:true,session:{date:'2026-10-13',checkedAt:now,status:'NORMAL_OPEN',source:'test',sessions:[{start:now-3600000,end:now+18000000}]}};
   if(u.pathname==='/api/upstox/quotes') {const req=JSON.parse(r.request().postData()||'{}');const quotes={};for(const key of req.keys||[]){const price=key.includes('Bank')?56247.2:key.includes('Nifty')?24781.65:key.includes('SENSEX')?81245.88:2782.45;quotes[key]={instrumentKey:key,lastPrice:price,netChange:182.45,changePercent:.74,open:price-20,high:price+30,low:price-40,previousClose:price-182.45,volume:1000000,lastTradeAt:iso,updatedAt:iso};}json={ok:true,quotes};}
   if(u.pathname==='/api/upstox/candles')json={ok:true,source:'upstox',instrumentKey:u.searchParams.get('instrumentKey'),timeframe:u.searchParams.get('timeframe'),candles,fetchedAt:iso};
   if(u.pathname==='/api/market/movers')json={ok:true,lists:{gainers:rows.filter(x=>x.change>0),losers:rows.filter(x=>x.change<0),high52:rows,low52:[],active:rows,volume:rows,upper:[],lower:[]}};
   if(u.pathname==='/api/market/equity-watch')json={ok:true,rows};
   if(u.pathname==='/api/market/deals')json={ok:true,date:'2026-10-13',rows:['Bulk','Block'].map((kind,i)=>({symbol:'RELIANCE',name:'Reliance Industries',isin:'INE002A01018',client:i?'Institutional investor':'Domestic investor',side:i?'Sell':'Buy',kind,qty:1250000,price:2782.45,value:3478062500,date:'2026-10-13'}))};
   if(u.pathname==='/api/market/news')json={items:Array.from({length:9},(_,i)=>({title:i%2?'Banking shares in focus as quarterly earnings season begins':'Reliance Industries announces results and expansion plans',url:`https://example.com/news/${i}`,source:i%2?'Mint Markets':'Economic Times',publishedAt:new Date(now-i*60000).toISOString(),sentiment:['Positive','Negative','Neutral'][i%3],importance:i%3===0?3:1})),updatedAt:iso,checkedAt:iso,sourceCount:3,unavailableSources:[]};
   if(u.pathname==='/api/market/india-pulse')json={ok:true,sessionLive:true,breadth:{advance:1847,decline:1212,unchanged:95},tape:Array.from({length:20},(_,i)=>({t:now-5400000+i*240000,advance:1600+i*12,decline:1450-i*10,unchanged:95})),vix:{price:15.27,change:-.6,changePercent:-3.78},vixCheckedAt:now,flows:Array.from({length:12},(_,i)=>({date:`2026-10-${String(12-i).padStart(2,'0')}`,label:`${12-i} Oct`,fii:-4699+i*630,dii:5182-i*410,nifty:null,niftyChange:null})),pcr:null};
   if(u.pathname==='/api/market/sector-heat')json={ok:true,sectors:SECTORS.map((s,i)=>({...s,watch:s.watch??null,chart:s.chart??null,price:100,change:[.76,-.08,-.58,.47,1.66,1.40,.81,.88,-.27,1.20,.46,.68,1.20,.62,.59,1.57][i]}))};
   if(u.pathname==='/api/market/gift-nifty')json={ok:true,gift:{price:24820.5,asOf:iso},futureClose:{price:24738.4,date:'2026-10-12'}};
   if(u.pathname==='/api/upstox/fno-underlyings')json={ok:true,underlyings:[{symbol:'NIFTY',name:'Nifty 50',instrumentKey:'NSE_INDEX|Nifty 50',optionContracts:100,futures:[{instrumentKey:'NSE_FO|123',tradingSymbol:'NIFTY 27 OCT FUT',expiry:'2026-10-27'}]}]};
   if(u.pathname==='/api/upstox/option-chain'){const side=(oi,prevOi)=>({marketData:{oi,prevOi,ltp:200},instrumentKey:'NSE_FO|123'});json={ok:true,expiries:['2026-10-20','2026-10-27'],fetchedAt:iso,rows:Array.from({length:11},(_,i)=>({strikePrice:24500+i*50,underlyingSpotPrice:24781.65,call:side(100000+(i%4)*20000,90000),put:side(140000-(i%4)*10000,120000)}))};}
   if(u.pathname==='/api/upstox/ipos')json={ok:true,fetchedAt:iso,ipos:[{id:'design-ipo',name:'Research Technologies IPO',symbol:'RESEARCH',status:'open',issueType:'regular',industry:'Information Technology',issueSizeCrore:250,minimumPrice:100,maximumPrice:110,totalSubscription:2.54,biddingStartDate:'2026-10-12',biddingEndDate:'2026-10-16',gmpAmount:5,gmpPercent:4.55,gmpSource:'ipogram',gmpCheckedAt:iso,details:{allotmentDate:'2026-10-20',listingDate:'2026-10-23',dailyEndTime:'17:00:00'}}]};
   return r.fulfill({json});
  });
  for(let i=0;;i++){try{await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3245');break;}catch(e){if(i>59)throw e;await page.waitForTimeout(1000);}}
  await page.locator('.main-nav').waitFor({timeout:60000});
  const ledger=await page.evaluate(()=>localStorage.getItem('papertrade-orders'));
  const nav=()=>page.locator(page.viewportSize().width<=940?'.mobile-bottom-nav':'.main-nav');
  const tab=async name=>{await nav().getByRole('button',{name:name==='IPO'&&page.viewportSize().width>940?'IPOs':name,exact:true}).click();};
  const shot=async (name,selector)=>{const el=page.locator(selector).first();await el.waitFor();await el.evaluate(e=>e.scrollTop=0);await page.waitForTimeout(160);if(shots)await page.screenshot({path:`${shots}/${name}.png`});};
  const fit=async(selector,label)=>{const el=page.locator(selector).first();await el.waitFor();const overflow=await el.evaluate(e=>e.scrollWidth>e.clientWidth+1);if(!process.env.DESIGN_BASELINE)assert.ok(!overflow,`${label} has no page overflow`);};
  const themes=process.env.DESIGN_BASELINE?['light']:['light','neon'];
  for(const theme of themes){
   await page.setViewportSize({width:390,height:844});await tab('Home');
   if(theme==='neon'){await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Use neon dark theme',exact:true}).click();await page.getByRole('button',{name:'Close more options',exact:true}).click();}
   for(const width of process.env.DESIGN_BASELINE?[1440,390]:[1440,768,390,320]){
    console.log(`Checking ${theme} at ${width}px`);
    await page.setViewportSize({width,height:width>=941?1050:844});await tab('Home');await fit('.home-dashboard-scroll',`${theme} Home ${width}`);await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollTop=0);
    assert.ok(await page.locator('.home-market-chooser').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.home-global-search').getBoundingClientRect().bottom),'Home search never covers market selector');if(width===1440||width===390)await shot(`home-${theme}-${width}`,'.home-dashboard-scroll');
    for(const [name,selector] of [['Charts','.chart-area'],['Watchlist','.watchlist-panel'],['News','.news-workspace'],['IPO','.ipo-discovery-panel'],['Fundamental Analysis','.fundamental-workspace.navigation-page'],['P&L','.pnl-modal']]){
     await tab(name);await fit(selector,`${theme} ${name} ${width}`);
     if(name==='P&L')assert.ok(await page.locator('.pnl-summary-six b').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1 && el.getBoundingClientRect().height<parseFloat(getComputedStyle(el).fontSize)*2)),`P&L amounts stay intact at ${width}`);
     if(name==='Charts'){const actions=page.locator(width<=940?'.permanent-trade-footer .chart-trade-buttons':'.chart-control-orders');assert.ok(await actions.isVisible(),'Buy and sell remain visible');}if(width===1440||width===390)await shot(`${name.replaceAll(' ','-')}-${theme}-${width}`,selector);
    }
   }
   // Secondary account views retain every quote, order and action at desktop/mobile widths.
   for(const [name,selector] of [['Holdings','.holdings-modal'],['Orders','.orders-modal']]){
    await page.setViewportSize({width:1440,height:1050});await tab(name);
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?1050:844});await fit(selector,`${theme} ${name} ${width}`);if(width!==320)await shot(`${name}-${theme}-${width}`,selector);}
   }
   await page.setViewportSize({width:390,height:844});await tab('Home');
   await page.getByRole('button',{name:/^Notifications/}).click();await shot(`notifications-${theme}`,'.notification-center-panel');await page.locator('.notification-center-panel').getByRole('button',{name:'Close notifications',exact:true}).click();
   await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Wallet',exact:true}).click();await shot(`wallet-${theme}`,'.funds-modal');await page.getByRole('button',{name:'Close virtual funds',exact:true}).click();
   await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Bot',exact:true}).click();await shot(`bot-${theme}`,'.bot-workspace');await fit('.bot-workspace',`${theme} bot`);
   await page.getByRole('button',{name:'EMA 5 reversal',exact:true}).click();assert.equal(await page.getByRole('button',{name:'EMA 5 reversal',exact:true}).getAttribute('aria-pressed'),'true');
   await tab('Home');await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Coach',exact:true}).click();await shot(`coach-${theme}`,'.coach-modal');await page.keyboard.press('Escape');
   await tab('Home');await page.getByRole('button',{name:'Global markets',exact:true}).click();await shot(`global-${theme}`,'.home-dashboard-scroll');await page.getByRole('button',{name:'Indian markets',exact:true}).click();
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-orders')),ledger,'Presentation and navigation never mutate the ledger');
  if(!process.env.DESIGN_BASELINE)assert.deepEqual(errors,[]);else console.log('Baseline page errors',errors);
  console.log('PASS: all main workspaces, both themes, four widths, Bot presets, Coach and Global navigation; ledger unchanged.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
