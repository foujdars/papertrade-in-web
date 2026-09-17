const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async()=>{
 const today=Date.parse('2026-09-16T09:15:00+05:30')/1000;
 const candles=Array.from({length:90},(_,i)=>({time:i<79?today-86400+i*300:today+(i-79)*300,open:110+i%5,high:113+i%5,low:108+i%5,close:111+i%5,volume:500}));
 const bundle=await esbuild.build({entryPoints:['tests/browser/live-chart.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'feed-test',setup(build){build.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));build.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(o){window.qaFeed=o.onTick;window.qaDisconnect=o.onDisconnect;return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 let quote=null,quoteRequests=0,refreshes=0,failQuotes=false;
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/upstox/quotes'){quoteRequests++;res.setHeader('Content-Type','application/json');if(failQuotes)res.statusCode=503;return res.end(JSON.stringify(failQuotes?{ok:false,error:{retryAfterSeconds:10}}:{ok:true,quotes:quote?{'NSE_EQ|TEST':quote}:{}}));}
  if(url.pathname==='/api/upstox/candles'){if(url.searchParams.has('scope'))refreshes++;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,candles,segments:['intraday']}));}
  res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':'text/html');res.end(url.pathname==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\n.terminal-shell{display:block!important;height:100dvh}.price-chart-wrap,.price-chart,.chart-stack{height:740px!important}</style><div id="root"></div><script>window.qaCandles=${JSON.stringify(candles)}</script><script src="/qa.js"></script>`);
 }).listen(3224,'127.0.0.1');
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-09-16T10:08:01+05:30')});
  await page.goto('http://127.0.0.1:3224');await page.waitForFunction(()=>window.qaSeries?.data().length===90);await page.evaluate(()=>window.qaSmc(false));
  const priceRange=()=>page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange());
  const timeRange=()=>page.evaluate(()=>window.qaChart.timeScale().getVisibleLogicalRange());
  const initial=await priceRange();
  await page.mouse.move(365,300);await page.mouse.down();await page.mouse.move(365,500,{steps:15});await page.mouse.up();
  const scaled=await priceRange();assert.notDeepEqual(scaled,initial,'dragging the price axis must adjust scale');
  assert.equal(await page.evaluate(()=>window.qaChart.priceScale('right').options().autoScale),false);
  const stable=(a,b)=>{for(const key of Object.keys(a))assert.ok(Math.abs(a[key]-b[key])<1e-5,`${key}: ${a[key]} vs ${b[key]}`)};
  for(const price of [115,116,114,118]){await page.evaluate(p=>window.qaFeed({instrumentKey:'NSE_EQ|TEST',price:p,timestampMs:Date.now()}),price);await page.waitForFunction(p=>window.qaSeries.data().at(-1).close===p,price);stable(scaled,await priceRange());}
  console.log('Price-axis drag remains adjustable across four real candle updates and dashboard rerenders');
  const beforePan=await timeRange();await page.mouse.move(130,400);await page.mouse.down();await page.mouse.move(280,450,{steps:20});await page.mouse.up();
  // Wait for the chart's intentional kinetic-scroll animation before comparing data updates.
  await page.clock.fastForward(5000);await page.waitForTimeout(100);
  const afterPan=await timeRange();assert.notDeepEqual(afterPan,beforePan,'plot drag must pan');const afterPanPrice=await priceRange();
  await page.evaluate(()=>window.qaFeed({instrumentKey:'NSE_EQ|TEST',price:119,timestampMs:Date.now()}));await page.waitForFunction(()=>window.qaSeries.data().at(-1).close===119);stable(afterPan,await timeRange());stable(afterPanPrice,await priceRange());
  await page.clock.fastForward(21000);await page.waitForTimeout(200);assert.ok(refreshes>0);assert.equal(await page.evaluate(()=>window.qaSeries.data().at(-1).close),119);stable(afterPan,await timeRange());stable(afterPanPrice,await priceRange());
  console.log('Panned time/price ranges survive ticks and delayed REST reconciliation; candles do not rewind');
  // A socket may stay connected without delivering ticks. A fresh exchange quote recovers the chart.
  quote={lastPrice:121,lastTradeAt:await page.evaluate(()=>new Date(Date.now()).toISOString())};
  await page.clock.fastForward(11000);await page.waitForFunction(()=>window.qaSeries.data().at(-1).close===121);assert.equal(await page.evaluate(()=>window.qaPublished.price),121);stable(afterPan,await timeRange());stable(afterPanPrice,await priceRange());
  console.log('Silent stream recovers from a fresh selected-symbol quote without losing manual viewport');
  quote={lastPrice:999,lastTradeAt:'2026-09-15T10:00:00+05:30'};await page.clock.fastForward(15000);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.qaSeries.data().at(-1).close),121);
  failQuotes=true;await page.clock.fastForward(10000);await page.waitForTimeout(100);failQuotes=false;
  quote={lastPrice:122,lastTradeAt:await page.evaluate(()=>new Date(Date.now()).toISOString())};await page.clock.fastForward(15000);await page.waitForFunction(()=>window.qaSeries.data().at(-1).close===122);
  console.log('Old last-trade quotes do not fabricate movement; temporary quote failure retries successfully');
  // Move far into history, then deliver the first trade of the next candle.
  await page.evaluate(()=>window.qaChart.timeScale().setVisibleLogicalRange({from:10,to:40}));await page.waitForFunction(()=>Math.abs(window.qaChart.timeScale().getVisibleLogicalRange().to-40)<.01);const history=await timeRange();const manualPrice=await priceRange();
  await page.clock.fastForward(120000);await page.evaluate(()=>window.qaFeed({instrumentKey:'NSE_EQ|TEST',price:123,timestampMs:Date.now()}));await page.waitForFunction(()=>window.qaSeries.data().at(-1).close===123);assert.equal(await page.evaluate(()=>window.qaSeries.data().length),91);stable(history,await timeRange());stable(manualPrice,await priceRange());
  // Explicit reset, unlike market data, is allowed to restore automatic scaling.
  await page.evaluate(()=>window.qaAction({type:'reset',id:1}));await page.waitForFunction(()=>window.qaChart.priceScale('right').options().autoScale===true);
  const live=await timeRange();await page.clock.fastForward(300000);await page.evaluate(()=>window.qaFeed({instrumentKey:'NSE_EQ|TEST',price:124,timestampMs:Date.now()}));await page.waitForFunction(()=>window.qaSeries.data().length===92);const next=await timeRange();assert.ok(next.to>live.to,'live-edge viewport follows a new candle');
  console.log('New candles preserve historical view; Reset restores autoscale and new-bar live-edge following');
  assert.equal(errors.length,0,errors.join('\n'));assert.ok(quoteRequests>0);if(process.env.CHART_TEST_SCREENSHOT)await page.screenshot({path:process.env.CHART_TEST_SCREENSHOT});
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
