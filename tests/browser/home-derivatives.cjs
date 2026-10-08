/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const build=await esbuild.build({entryPoints:['tests/browser/home-derivatives.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const catalogue=[{symbol:'NIFTY',name:'Nifty 50',instrumentKey:'NSE_INDEX|Nifty 50',optionContracts:100,futures:[{instrumentKey:'NSE_FO|123',tradingSymbol:'NIFTY 27 OCT FUT',expiry:'2026-10-27'}]},{symbol:'BANKNIFTY',name:'Nifty Bank',instrumentKey:'NSE_INDEX|Nifty Bank',optionContracts:100},{symbol:'RELIANCE',name:'Reliance',instrumentKey:'NSE_EQ|INE002A01018',optionContracts:100}];
 const side=(oi,prevOi)=>({marketData:{oi,prevOi}});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://test');res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/upstox/fno-underlyings')return res.end(JSON.stringify({ok:true,underlyings:catalogue}));
  if(url.pathname==='/api/market/gift-nifty')return res.end(JSON.stringify({ok:true,gift:{price:22520.5,asOf:'2026-10-07T13:00:00Z'},futureClose:{price:22618.4,date:'2026-10-07'}}));
  if(url.pathname==='/api/market/india-pulse')return res.end(JSON.stringify({ok:true,vix:{price:14.3,change:-.6,changePercent:-4},vixCheckedAt:Date.parse('2026-10-07T13:00:00Z')}));
  if(url.pathname==='/api/upstox/option-chain'){
   const missing=url.searchParams.get('instrumentKey').startsWith('NSE_EQ');
   return res.end(JSON.stringify({ok:true,expiries:['2026-10-08','2026-10-27'],fetchedAt:'2026-10-07T13:00:00Z',rows:missing?[]:[{strikePrice:22500,underlyingSpotPrice:22600,call:side(100,150),put:side(200,100)},{strikePrice:22600,underlyingSpotPrice:22600,call:side(100,120),put:side(100,140)}]}));
  }
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?build.outputFiles[0].text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}.terminal-shell{display:block!important;padding:12px;min-height:100vh}.home-derivatives{max-width:900px;margin:auto}</style><div id="root"></div><script src="/qa.js"></script>`);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-07T13:00:00Z'));await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('img',{name:'Call and put open interest by strike',exact:true}).waitFor();
  assert.ok(await page.getByText('97.9 pts below',{exact:true}).isVisible());assert.equal(await page.locator('.home-derivative-metrics > div').first().locator('b').textContent(),'1.5');
  await page.getByRole('button',{name:'Open GIFT NIFTY chart',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaInstrument.instrumentKey),'GLOBAL_INDEX|SGX NIFTY');
  await page.getByRole('button',{name:'Open NIFTY futures chart',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaInstrument.instrumentKey),'NSE_FO|123');
  for(const theme of ['light','neon'])for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.locator('.terminal-shell').evaluate((el,theme)=>el.dataset.theme=theme,theme);
   assert.ok(await page.locator('.home-derivatives').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${theme} fits ${width}`);
   assert.ok(await page.locator('.home-option-pulse').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'chart scroll stays inside card');
   assert.ok(await page.locator('.home-gift-card').evaluate(el=>el.getBoundingClientRect().height<=80),'gift card is one compact row');
   if(width===390){fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:`outputs/home-derivatives-${theme}.png`});}
  }
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Change in OI',exact:true}).click();await page.getByRole('img',{name:'Call and put change in open interest by strike',exact:true}).waitFor();assert.ok(await page.getByText('Call Δ -70',{exact:true}).isVisible());
  await page.getByRole('button',{name:'OI instrument',exact:true}).click();await page.getByRole('option',{name:/BANKNIFTY/}).click();await page.getByRole('button',{name:'Open BANKNIFTY chart',exact:true}).waitFor();await page.getByRole('button',{name:'OI expiry',exact:true}).click();await page.getByRole('option',{name:'2026-10-27',exact:true}).click();
  await page.getByRole('button',{name:'Open BANKNIFTY chart',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaOpened),'BANKNIFTY');
  await page.getByRole('button',{name:'OI instrument',exact:true}).click();await page.getByRole('option',{name:/RELIANCE/}).click();await page.getByText('Option-chain data unavailable. Retrying automatically.',{exact:true}).waitFor();assert.equal(await page.locator('.home-derivative-metrics > div').first().locator('b').textContent(),'—');assert.deepEqual(errors,[]);
  console.log('PASS: futures-close gap, PCR/OI totals, OI-change tab, instrument/expiry selection, chart action, unavailable data and contained light/dark layouts at four widths.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
