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
   return res.end(JSON.stringify({ok:true,candles:bars(start,300,step),quotes:{},segments:['historical']}));
  }
  res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':'text/html');
  res.end(url.pathname==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap{height:100%!important}.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script>window.fixtureCandles=${JSON.stringify(bars(start,300,300))}</script><script src="/qa.js"></script>`);
 });
 await new Promise(resolve=>server.listen(3232,'127.0.0.1',resolve));
 const launch={headless:true};
 if(process.env.CHROMIUM_PACKAGE){const c=(await import(process.env.CHROMIUM_PACKAGE)).default;launch.executablePath=await c.executablePath();launch.args=c.args.filter(arg=>arg!=='--single-process');}
 const browser=await chromium.launch(launch);
 try {
  for(const globalMode of [false,true]){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({start,globalMode})=>{
    const step=globalMode?300:86400,shift=globalMode?19800:0,key=globalMode?'DELTA|BTCUSD':'NSE_EQ|TEST';
    if (!localStorage.getItem('papertrade-lwc-drawings-v1:'+key)) localStorage.setItem('papertrade-lwc-drawings-v1:'+key,JSON.stringify([{id:'support-ray',type:'horizontal-ray',anchors:[{time:start+step*20+shift,price:103}],style:{lineColor:'#2563eb',lineWidth:2},options:{visible:true,text:'Support zone',textHorizontal:'left'}},{id:'trend',type:'trend-line',anchors:[{time:start+step*35+shift,price:101},{time:start+step*50+shift,price:104}],style:{lineColor:'#8054da',lineWidth:2},options:{visible:true,text:'Trend',showPriceLabel:false}}]));
   },{start,globalMode});
   await page.goto('http://127.0.0.1:3232'+(globalMode?'?global=1':''));
   await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===2&&window.qaSeries?.data().length===300);
   const host=await page.locator('.lightweight-chart').boundingBox();
   // Genuine user interaction enables history requests; then move to the first bars.
   await page.mouse.move(host.x+150,host.y+230);await page.mouse.wheel(-20,0);
   const before=await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:0,to:60});return {time:window.qaSeries.data()[20].time};});
   await page.waitForTimeout(60);
   const x=await page.evaluate(t=>window.qaChart.timeScale().timeToCoordinate(t),before.time);
   await page.waitForFunction(()=>window.qaSeries.data().length===600);
   assert.ok(Math.abs((await page.evaluate(t=>window.qaChart.timeScale().timeToCoordinate(t),before.time))-x)<1,'history prepend must not jump');
   const after=await page.evaluate(()=>({first:window.qaSeries.data()[0].time,range:window.qaChart.timeScale().getVisibleLogicalRange()}));
   assert.ok(after.first<start+(globalMode?19800:0));
   assert.ok(Math.abs(after.range.from-300)<1);
   await page.screenshot({path:`outputs/chart-repair-${globalMode?'global':'india'}-light.png`});
   // A ray's line and axis price stay visible, but its annotation leaves with its candle.
   const inspect=()=>page.evaluate(()=>{const d=window.qaManager.getAllDrawings().find(d=>d.id==='support-ray');return {text:d.computeGeometry(d.getViewport()).some(g=>g.type==='text'&&g.text==='Support zone'),axis:d.priceAxisViews()[0].visible(),priceOnLine:d.horizontalRayOptions.showPrice};});
   assert.deepEqual(await inspect(),{text:true,axis:true,priceOnLine:false});
   await page.evaluate(()=>window.qaChart.timeScale().setVisibleLogicalRange({from:335,to:395}));
   await page.waitForTimeout(200);
   assert.deepEqual(await inspect(),{text:false,axis:true,priceOnLine:false});
   await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:300,to:360});window.qaManager.selectDrawing('support-ray');});
   await page.getByRole('button',{name:'Drawing settings',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Drawing settings'});
   await dialog.waitFor();
   assert.equal(await dialog.getByLabel('Ray direction').count(),1);
   assert.equal(await dialog.getByText('Extend left',{exact:true}).count(),0);
   await dialog.getByLabel('Drawing text').fill('Demand area');
   await dialog.getByLabel('Line width').selectOption('3');
   await dialog.getByLabel('Line style').selectOption('dashed');
   await dialog.getByRole('button',{name:'Black line colour',exact:true}).click();
   for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:844});const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/chart-repair-settings-light.png'});
   await dialog.getByRole('button',{name:'Apply',exact:true}).click();
   const saved=await page.evaluate(()=>window.qaManager.getAllDrawings().find(d=>d.id==='support-ray').toJSON());
   assert.equal(saved.style.lineWidth,3);assert.deepEqual(saved.style.lineDash,[8,5]);assert.equal(saved.options.text,'Demand area');
   if(globalMode){await page.evaluate(()=>window.refreshGlobal());await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.qaSeries.data().length),600);}
   await page.getByRole('button',{name:'Theme',exact:true}).click();await page.waitForTimeout(500);
   await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:300,to:360});window.qaManager.selectDrawing('support-ray');});
   await page.getByRole('button',{name:'Drawing settings',exact:true}).click();await dialog.waitFor();await page.screenshot({path:'outputs/chart-repair-settings-dark.png'});await page.keyboard.press('Escape');
   await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().find(d=>d.id==='support-ray')?.options.text==='Demand area');
   if(globalMode){await page.getByRole('button',{name:'Switch symbol'}).click();await page.waitForFunction(()=>window.qaSeries.data().length===40);assert.equal(await page.evaluate(()=>window.qaSeries.data()[0].close),51);}
   else {
    // Failed pages leave candles intact and can be retried by the user.
    failOnce=true;
    await page.mouse.move(host.x+150,host.y+230);await page.mouse.wheel(-20,0);
    await page.evaluate(()=>window.qaChart.timeScale().setVisibleLogicalRange({from:0,to:60}));
    await page.getByRole('button',{name:'Load older candles · Retry'}).waitFor();
    assert.equal(await page.evaluate(()=>window.qaSeries.data().length),300);
    await page.getByRole('button',{name:'Load older candles · Retry'}).click();
    await page.waitForFunction(()=>window.qaSeries.data().length===600);
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  assert.ok(requests.length>=4);
  console.log('PASS: Indian/global history paging, viewport stability, no refresh truncation, symbol isolation, retry, ray annotation clipping, price-axis labels, tool-specific settings, saved edits, light/dark and 320–1280px layouts.');
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
