const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({entryPoints:['tests/browser/chart-repair.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-feed',setup(b){
  b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));
 }}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const start=Date.parse('2025-10-06T00:00:00Z')/1000;
 const bars=(first,count,step)=>Array.from({length:count},(_,i)=>({time:first+i*step,open:105+Math.sin(i/9)*3,close:106+Math.sin(i/9)*3,high:107+Math.sin(i/9)*3,low:104+Math.sin(i/9)*3,volume:1000}));
 const requests=[];let failOnce=false;
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   const step=url.searchParams.get('timeframe')==='1D'?86400:300,before=Number(url.searchParams.get('before'));
   if(before){requests.push(before);return setTimeout(()=>{if(failOnce){failOnce=false;res.statusCode=503;res.end(JSON.stringify({ok:false}));return;}res.end(JSON.stringify({ok:true,candles:bars(before-step*300,300,step),history:{nextBefore:before-step*300,hasMore:true}}));},300);}
   const isNifty=url.searchParams.get('instrumentKey')==='NSE_INDEX|Nifty 50';
   const candles=bars(start,300,step).map(c=>isNifty?{...c,open:c.open*210,high:c.high*210,low:c.low*210,close:c.close*210}:c);
   if(url.searchParams.get('years')==='5')candles[candles.length-2]={...candles[candles.length-2],low:0};
   return res.end(JSON.stringify({ok:true,candles,quotes:{},segments:['historical']}));
  }
  res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':'text/html');
  res.end(url.pathname==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap{height:100%!important}.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script>window.fixtureCandles=${JSON.stringify(bars(start,300,300))}</script><script src="/qa.js"></script>`);
 });
 await new Promise(resolve=>server.listen(3232,'127.0.0.1',resolve));
 const launch={headless:true};
 if(process.env.CHROMIUM_PACKAGE){const c=(await import(process.env.CHROMIUM_PACKAGE)).default;launch.executablePath=await c.executablePath();launch.args=c.args.filter(arg=>arg!=='--single-process');}
 const browser=await chromium.launch(launch);
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(start=>localStorage.setItem('papertrade-lwc-drawings-v1:NSE_EQ|TEST',JSON.stringify([{id:'zero-anchor',type:'horizontal-ray',anchors:[{time:start+86400*290,price:0}],style:{lineColor:'#2563eb',lineWidth:1},options:{visible:false}}])),start);
  await page.goto('http://127.0.0.1:3232');await page.waitForFunction(()=>window.qaSeries?.data().length===300&&window.qaManager?.getAllDrawings().length===1);await page.waitForTimeout(250);
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});await page.waitForTimeout(150);const range=await page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange());assert.ok(range.from>90 && range.to<120,JSON.stringify({width,range}));}
  await page.evaluate(()=>window.qaExtendTimeline());await page.waitForTimeout(250);
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
   const timelineRange=await page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange());
   assert.ok(timelineRange.from>90&&timelineRange.to<120,`Extra timestamps must not bypass the zero-anchor repair: ${JSON.stringify({width,timelineRange})}`);
  }
  await page.goto('http://127.0.0.1:3232?prior');
  await page.waitForFunction(()=>window.qaSeries?.data().length===300&&document.querySelector('.chart-previous-day'));
  await page.waitForTimeout(500);
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
   const priorRange=await page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange());
   assert.ok(priorRange.from>90&&priorRange.to<120,`Prior levels must not force zero into the scale: ${JSON.stringify({width,priorRange})}`);
  }
  await page.evaluate(()=>{window.qaChart.priceScale('right').setAutoScale(false);window.qaChart.priceScale('right').setVisibleRange({from:80,to:140});});await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange()),{from:80,to:140});await page.evaluate(start=>localStorage.setItem('papertrade-lwc-drawings-v1:NSE_INDEX|Nifty 50',JSON.stringify([{id:'old-nifty-level',type:'horizontal-line',anchors:[{time:start+86400*290,price:1}],style:{lineColor:'#6657ee',lineWidth:1},options:{visible:false,userHidden:true}}])),start);
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:3232?nifty&prior');
  await page.waitForFunction(()=>window.qaSeries?.data().length===300&&window.qaManager?.getAllDrawings().length===1&&document.querySelector('.chart-previous-day'));
  await page.waitForTimeout(500);
  const niftyRange=await page.evaluate(()=>window.qaChart.priceScale('right').getVisibleRange());
  await page.screenshot({path:'/tmp/nifty-saved-drawing-scale.png'});
  assert.ok(niftyRange.from>20000&&niftyRange.to<26000,`A saved positive drawing must not flatten Nifty: ${JSON.stringify(niftyRange)}`);
  assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings()[0].anchors[0].price),1,'The saved drawing remains intact');
  assert.deepEqual(errors,[]);console.log('PASS: Nifty opens around visible prices despite its saved near-zero positive drawing.');console.log('PASS: positive opening scale with hidden zero drawings, extended shared timeline and invalid daily prior-level history; manual scale remains intact.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
