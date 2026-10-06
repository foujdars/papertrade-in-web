/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness uses externally installed packages. */
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const {MARKET_GREEN,MARKET_RED}=await import('../../lib/market-colours.ts');
 const rgb=hex=>`rgb(${[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(', ')})`;
 const bars=Array.from({length:120},(_,i)=>({time:1791288000+i*300,open:105+Math.sin(i/9)*3,close:105+Math.sin(i/9)*3+(i%2?-1:1),high:110,low:100,volume:1000}));
 const bundle=await esbuild.build({entryPoints:['tests/browser/market-colours.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-feed',setup(b){b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).concat(['components/news-workspace.css','components/fundamental-workspace.css','components/global-order-ticket.css'].map(f=>fs.readFileSync(f,'utf8'))).join('\n').replace(/@import[^;]+;/g,'');
 const end=Date.parse('2026-10-06T10:00:00Z'),pulse={ok:true,tape:[{t:end-3600000,advance:1000,decline:700},{t:end,advance:2241,decline:1027}],vix:{price:13.6,change:-1.18,changePercent:-7.98},pcr:{value:24/17,putOi:240000000,callOi:170000000,expiry:'2026-10-06',asOf:new Date(end).toISOString()}};
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(req.url.startsWith('/api/market/india-pulse')?pulse:{ok:true,candles:bars,quotes:{}}));}
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');
  res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}#colour-contracts :is(.option-sheet-backdrop,.option-chain-sheet,.coach-modal,.bar-replay,.order-ticket){position:static;inset:auto;min-height:0;max-height:none;width:auto;display:block}</style><div id="root"></div><script>window.fixtureCandles=${JSON.stringify(bars)}</script><script src="/qa.js"></script>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;launch.executablePath=await c.executablePath();launch.args=c.args;}
  browser=await chromium.launch(launch);const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.qaSeries?.data().length===120);await page.locator('.india-ad-chart').waitFor();
  const gainText='.up,.positive,.buy-tag,.buy-active,.advanced-buy,.news-positive,.fa-badge.review,.pnl-calendar-day.profit';
  const lossText='.down,.negative,.sell-tag,.sell-active,.advanced-sell,.news-negative,.fa-badge.rejected,.pnl-calendar-day.loss';
  const gainButtons='.chart-trade-buttons .buy,.fno-trade-actions>button.buy,.place-order.buy,.chart-buy-button,.chart-order-buttons .compact-buy';
  const lossButtons='.chart-trade-buttons .sell,.fno-trade-actions>button.sell,.place-order.sell,.chart-sell-button,.chart-order-buttons .compact-sell';
  for(const theme of ['light','neon']){
   if(theme==='neon')await page.getByRole('button',{name:'Theme',exact:true}).click();
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    await page.waitForFunction(({green,red})=>{const o=window.qaSeries?.options();return o?.upColor===green&&o?.downColor===red;},{green:MARKET_GREEN,red:MARKET_RED});
    const options=await page.evaluate(()=>{const o=window.qaSeries.options();return [o.upColor,o.borderUpColor,o.wickUpColor,o.downColor,o.borderDownColor,o.wickDownColor];});
    assert.deepEqual(options,[MARKET_GREEN,MARKET_GREEN,MARKET_GREEN,MARKET_RED,MARKET_RED,MARKET_RED]);
    for(const [selector,property,expected] of [[gainText,'color',rgb(MARKET_GREEN)],[lossText,'color',rgb(MARKET_RED)],[gainButtons,'backgroundColor',rgb(MARKET_GREEN)],[lossButtons,'backgroundColor',rgb(MARKET_RED)],[gainButtons,'color','rgb(255, 255, 255)'],[lossButtons,'color','rgb(255, 255, 255)'],['.india-flow-chart .fii.up','fill',rgb(MARKET_GREEN)],['.india-flow-chart .down','fill',rgb(MARKET_RED)],['.india-breadth-line.up','stroke',rgb(MARKET_GREEN)],['.india-breadth-line.down','stroke',rgb(MARKET_RED)]]){
     const bad=await page.locator(selector).evaluateAll((els,{property,expected})=>els.filter(el=>getComputedStyle(el)[property]!==expected).map(el=>({class:el.getAttribute('class'),actual:getComputedStyle(el)[property]})),{property,expected});
     assert.deepEqual(bad,[],`${theme} ${width}px ${property} ${selector}`);
    }
    assert.equal(await page.locator('.india-market-gauge .call').first().evaluate(el=>getComputedStyle(el).stroke),rgb(MARKET_RED));
    for(const selector of [gainButtons,lossButtons])assert.ok(await page.locator(selector).evaluateAll(els=>els.every(el=>getComputedStyle(el).backgroundImage==='none')),'No differing button gradients');
    if(width===390&&process.env.MARKET_COLOURS_SCREENSHOT)await page.screenshot({path:process.env.MARKET_COLOURS_SCREENSHOT.replace('.png',`-${theme}.png`)});
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS: candle bodies/borders/wicks, chart lines/bars, gains/losses, news, research and all order-button variants match in both themes at 320–1280px.');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
