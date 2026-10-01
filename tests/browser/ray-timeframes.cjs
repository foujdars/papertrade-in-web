const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({entryPoints:['tests/browser/chart-repair.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-feed',setup(b){
  b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));
 }}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const stamp=s=>Date.parse(s)/1000;
 const bars=times=>times.map((time,i)=>({time,open:105+Math.sin(i/3)*2,close:106+Math.sin(i/3)*2,high:108+Math.sin(i/3)*2,low:102+Math.sin(i/3)*2,volume:1000}));
 const indiaDay=bars(Array.from({length:45},(_,i)=>stamp('2026-09-01T00:00:00+05:30')+i*86400));
 const indiaMonth=bars(Array.from({length:22},(_,i)=>Date.UTC(2025+Math.floor(i/12),i%12,1)/1000-19800));
 const globalMinute=bars(Array.from({length:60},(_,i)=>stamp('2026-09-18T09:15:00Z')+i*300));
 const globalMonth=bars(Array.from({length:22},(_,i)=>Date.UTC(2025+Math.floor(i/12),i%12,1)/1000));
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':url.pathname.startsWith('/api/')?'application/json':'text/html');if(url.pathname.startsWith('/api/'))return res.end(JSON.stringify({ok:true,candles:url.searchParams.get('timeframe')==='1M'?indiaMonth:indiaDay,quotes:{},segments:['historical']}));const globalMode=url.searchParams.has('global');res.end(url.pathname==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script>window.fixtureCandles=${JSON.stringify(globalMinute)};window.fixtureFrames={'1M':${JSON.stringify(globalMonth)}};</script><script src="/qa.js"></script>`);});
 await new Promise(resolve=>server.listen(3234,'127.0.0.1',resolve));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const c=(await import(process.env.CHROMIUM_PACKAGE)).default;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);
 try {
 for(const globalMode of [false,true]) {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const originalEpoch=globalMode?globalMinute[20].time:indiaDay[17].time,originalTime=originalEpoch+(globalMode?19800:0),key=globalMode?'DELTA|BTCUSD':'NSE_EQ|TEST';
  await page.addInitScript(({originalTime,key,globalMode})=>{
   if(!localStorage.getItem('papertrade-lwc-drawings-v1:'+key))localStorage.setItem('papertrade-lwc-drawings-v1:'+key,JSON.stringify([{id:'ray',type:'horizontal-ray',anchors:[{time:originalTime,price:103}],style:{lineColor:'#6657ee',lineWidth:2},options:{visible:true,text:'Alignment'}}]));
   window.qaText=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(text==='Alignment')window.qaText.push({x,y,width:this.measureText(text).width});return fill.call(this,text,x,y,...args);};
  },{originalTime,key,globalMode});
  await page.goto('http://127.0.0.1:3234'+(globalMode?'?global=1':''));await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1&&window.qaSeries.data().length>30);await page.evaluate(()=>window.qaChart.timeScale().fitContent());
  const checkText=async(align)=>{
   await page.evaluate(()=>window.qaManager.selectDrawing('ray'));await page.getByRole('button',{name:'Drawing settings',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Drawing settings'});await dialog.waitFor();await dialog.getByRole('tab',{name:'Text',exact:true}).click();await dialog.getByLabel('Text alignment').selectOption(align);await page.evaluate(()=>window.qaText=[]);await dialog.getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>window.qaText.length>0);
   const result=await page.evaluate(align=>{const d=window.qaManager.getAllDrawings()[0],v=d.getViewport(),line=d.computeGeometry(v).find(g=>g.type==='line'),label=d.computeGeometry(v).find(g=>g.type==='text'),paint=window.qaText.at(-1);const expected=align==='left'?Math.min(line.start.x,line.end.x)+4:align==='right'?Math.max(line.start.x,line.end.x)-4:(line.start.x+line.end.x)/2;return {position:label.position.x,expected,painted:paint.x+(align==='center'?paint.width/2:align==='right'?paint.width:0)};},align);
   assert.ok(Math.abs(result.position-result.expected)<.1);assert.ok(Math.abs(result.painted-result.expected)<1,'canvas text aligns at '+align);return result.position;
  };
  const xs=[];for(const align of ['left','center','right'])xs.push(await checkText(align));assert.ok(xs[0]<xs[1]&&xs[1]<xs[2]);await page.screenshot({path:`outputs/ray-alignment-${globalMode?'global':'india'}.png`});
  await page.getByRole('button',{name:'Monthly frame',exact:true}).click();await page.waitForFunction(()=>window.qaSeries.data().length===22&&window.qaManager.getAllDrawings().length===1);await page.evaluate(()=>window.qaChart.timeScale().fitContent());
  const expectedMonth=globalMode?globalMonth[20].time:indiaMonth[20].time;
  const monthly=await page.evaluate(expectedMonth=>{const d=window.qaManager.getAllDrawings()[0],v=d.getViewport(),line=d.computeGeometry(v).find(g=>g.type==='line');return {start:line.start.x,expected:window.qaChart.timeScale().timeToCoordinate(expectedMonth),anchor:d.anchors[0].time};},expectedMonth);
  assert.equal(monthly.anchor,originalTime,'timeframe switch preserves original anchor');assert.ok(Math.abs(monthly.start-monthly.expected)<.1,'monthly ray starts at containing September candle');assert.ok(monthly.start>0,'does not extend to plot left');
  await checkText('center');await page.evaluate(()=>window.qaManager.selectDrawing('ray'));await page.getByRole('button',{name:'Drawing settings',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Drawing settings'});await dialog.getByLabel('Line width').selectOption('3');await dialog.getByRole('button',{name:'Apply',exact:true}).click();await page.screenshot({path:`outputs/ray-month-${globalMode?'global':'india'}.png`});
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem('papertrade-lwc-drawings-v1:'+key))[0].anchors[0].time,key),originalTime,'style edits on monthly chart preserve daily/minute anchor');
  await page.getByRole('button',{name:'Original frame',exact:true}).click();await page.waitForFunction(()=>window.qaSeries.data().length>30);await page.evaluate(()=>window.qaChart.timeScale().fitContent());
  const back=await page.evaluate(originalTime=>{const d=window.qaManager.getAllDrawings()[0],v=d.getViewport();return {time:d.anchors[0].time,x:d.computeGeometry(v).find(g=>g.type==='line').start.x,expected:window.qaChart.timeScale().timeToCoordinate(originalTime),width:d.style.lineWidth};},originalTime);assert.equal(back.time,originalTime);assert.ok(Math.abs(back.x-back.expected)<.1);assert.equal(back.width,3);
  await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1&&window.qaSeries.data().length>30);assert.equal(await page.evaluate(()=>window.qaManager.getAllDrawings()[0].anchors[0].time),originalTime);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: left/centre/right geometry and painted text, daily and 5m to containing monthly candle, original timestamp retained through monthly style edits, return to original frame and reload, Indian/global axes.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
