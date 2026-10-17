/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const output=path.resolve(process.env.MARKET_QA_OUTPUT_DIR||'work/market-data-qa');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const now=Date.now();let change=17,failed=false,scanner=true;const calls={movers:0,search:0,quotes:0};
 const meta=()=>({fetchedAt:new Date(now).toISOString(),marketOpen:true,status:scanner?'delayed':'verified',source:scanner?'tradingview':'upstox',warning:scanner?'Scanner prices may be delayed.':null,failedTabs:[],staleTabs:[]});
 const row=()=>({symbol:'TEST',name:'Verified company',price:100+change,change,volume:100000,tradedValue:null,note:null,source:scanner?'tradingview':'upstox',quoteAt:scanner?null:new Date(now).toISOString(),delayed:scanner,exchange:'NSE'});
 const bundle=await build({entryPoints:['tests/browser/market-data-freshness.fixture.jsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://test');
  if(url.pathname==='/qa.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');let body={ok:false};
   if(url.pathname==='/api/market/movers'){calls.movers++;body={ok:true,lists:{gainers:[row()],losers:[],high52:[row()]},...meta()};if(failed){res.statusCode=503;body={ok:false};}}
   if(url.pathname==='/api/market/search-movers'){calls.search++;body={ok:true,in:{gainers:[row()],losers:[]},us:{gainers:[],losers:[]},crypto:{gainers:[],losers:[]},metadata:{in:meta()}};if(failed){res.statusCode=503;body={ok:false};}}
   if(url.pathname==='/api/market/search-popular')body={ok:true,in:[],us:[],crypto:[]};
   if(url.pathname==='/api/upstox/quotes'){calls.quotes++;body={ok:true,quotes:{'NSE_EQ|INE000A01002':{lastPrice:100,previousClose:0,changePercent:0,changeAvailable:false,lastTradeAt:new Date(now).toISOString()}}};}
   return res.end(JSON.stringify(body));
  }
  res.setHeader('Content-Type','text/html');res.end(`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.qa-movers{height:160px;flex:0 0 auto;position:relative;z-index:2}.qa-movers:has(.desktop-movers){height:auto;max-height:420px;overflow:auto}</style><div id="root"></div><script src="/qa.js"></script>`);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(now)});await page.goto(`http://127.0.0.1:${server.address().port}`);
  const card=page.locator('.home-market-card[data-kind="movers"]').first();await card.getByText('+17.00%',{exact:true}).first().waitFor();assert.match(await card.innerText(),/Delayed scanner quotes/);
  change=9;scanner=false;await page.clock.fastForward(15_100);await card.getByText('+9.00%',{exact:true}).first().waitFor();assert.doesNotMatch(await card.innerText(),/17\.00%/);
  failed=true;await page.clock.fastForward(15_100);await card.getByText(/Refresh failed/).waitFor();assert.match(await card.innerText(),/9\.00%/);
  failed=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await card.getByText('Broker-checked quotes',{exact:true}).waitFor();
  await card.click();const movers=page.getByRole('dialog',{name:'Market movers',exact:true});await movers.getByText('Quote',{exact:false}).first().waitFor();await page.clock.fastForward(400);const box=await movers.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=391,'mobile movers sheet fits viewport');assert.match(await movers.innerText(),/9\.00%/);await page.screenshot({path:path.join(output,'market-movers-mobile.png')});await movers.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('textbox',{name:'Search Indian markets'}).click();const search=page.getByRole('dialog',{name:'Search markets',exact:true});await search.getByRole('button',{name:'Open TEST chart',exact:true}).waitFor();assert.match(await search.getByRole('button',{name:'Open TEST chart',exact:true}).innerText(),/9\.00%/);
  const recent=search.getByRole('button',{name:'Open RECENT chart',exact:true});await page.waitForFunction(()=>document.querySelector('[aria-label="Open RECENT chart"] .market-quote-time')?.textContent.startsWith('Quote '));assert.equal(await recent.locator('.home-pair-quote em').innerText(),'—','Missing previous close is not displayed as zero percent');
  const before=calls.search;change=8;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await search.getByRole('button',{name:'Open TEST chart',exact:true}).getByText('+8.00%',{exact:true}).waitFor();assert.ok(calls.search>before,'Open search refreshes on resume');
  failed=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await search.getByText(/Refresh failed/).waitFor();assert.match(await search.getByRole('button',{name:'Open TEST chart',exact:true}).innerText(),/8\.00%/);failed=false;
  await search.getByRole('button',{name:'Close search',exact:true}).click();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});await page.evaluate(w=>{window.qaInline(w>=1000);window.qaPlatform(w===768?'android':'web');},width);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(120);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px fits`);if(width===1440){await page.locator('.desktop-stock-row').first().waitFor();assert.match(await page.locator('.desktop-movers').filter({visible:true}).first().innerText(),/8\.00%/);await page.screenshot({path:path.join(output,'market-movers-desktop.png')});}}
  assert.deepEqual(errors,[]);console.log('PASS: real movers/Home search update17→9, stale failure retention, resume recovery, unavailable change, timestamps and320/390/768(native host)/1440 layouts.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
