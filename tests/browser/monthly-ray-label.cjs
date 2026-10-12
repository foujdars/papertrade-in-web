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
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const anchor=indiaMonth[5].time;
 await page.addInitScript(anchor=>{
   if(!localStorage.getItem('papertrade-lwc-drawings-v1:NSE_EQ|TEST'))localStorage.setItem('papertrade-lwc-drawings-v1:NSE_EQ|TEST',JSON.stringify([{id:'monthly-ray',type:'horizontal-ray',anchors:[{time:anchor,price:103}],style:{lineColor:'#6657ee',lineWidth:2},options:{visible:true,text:'Monthly Support',textHorizontal:'right',direction:'right',anchorTimeOffset:0}}]));
   window.qaText=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...args){if(text==='Monthly Support')window.qaText.push({x,y,width:this.measureText(text).width});return fill.call(this,text,x,y,...args);};
 },anchor);
 await page.goto('http://127.0.0.1:3234');await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1&&window.qaSeries.data().length>30);
 await page.getByRole('button',{name:'Monthly frame',exact:true}).click();await page.waitForFunction(()=>window.qaSeries.data().length===22);await page.evaluate(()=>window.qaChart.timeScale().fitContent());
 await page.waitForFunction(()=>window.qaManager.getAllDrawings()[0].computeGeometry(window.qaManager.getAllDrawings()[0].getViewport()).some(g=>g.type==='text'));
 await page.getByRole('button',{name:'Original frame',exact:true}).click();await page.waitForFunction(()=>window.qaSeries.data().length===45);
 for(const theme of ['light','neon']){
  if(theme==='neon')await page.getByRole('button',{name:'Theme',exact:true}).click();
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:15,to:48});window.qaText=[];});
   await page.waitForFunction(()=>window.qaText.length>0);
   const geometry=await page.evaluate(()=>{const d=window.qaManager.getAllDrawings()[0],v=d.getViewport(),text=d.computeGeometry(v).find(g=>g.type==='text');return {anchorX:v.timeScale.timeToCoordinate(d.anchors[0].time),time:d.anchors[0].time,x:text?.position.x,width:v.width,paint:window.qaText.at(-1)};});
   assert.ok(geometry.anchorX<0,'Monthly origin is outside daily viewport');assert.equal(geometry.time,anchor);
   assert.ok(Math.abs(geometry.x-(geometry.width-4))<.1,'Right-aligned text stays at visible ray end');assert.ok(Math.abs(geometry.paint.x+geometry.paint.width-geometry.x)<1,'Text actually painted');
  }
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.qaManager.selectDrawing('monthly-ray'));await page.getByRole('button',{name:'Drawing settings',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Drawing settings',exact:true});await settings.waitFor();assert.equal(await settings.locator('select').count(),0);
 await settings.getByRole('button',{name:'Line width',exact:true}).click();const picker=page.getByRole('dialog',{name:'Line width',exact:true});await picker.waitFor();await page.keyboard.press('Escape');await picker.waitFor({state:'hidden'});assert.ok(await settings.isVisible(),'Escape closes just the nested picker');
 await settings.getByRole('tab',{name:'Text',exact:true}).click();await settings.getByRole('button',{name:'Text alignment',exact:true}).click();await page.getByRole('option',{name:'Right',exact:true}).click();await settings.getByRole('button',{name:'Apply',exact:true}).click();
 await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1&&window.qaSeries.data().length===45);await page.evaluate(()=>{window.qaChart.timeScale().setVisibleLogicalRange({from:15,to:48});window.qaText=[];});await page.waitForFunction(()=>window.qaText.length>0);
 assert.deepEqual(errors,[]);console.log('PASS: an older monthly ray label remains right-aligned and actually painted on daily charts at 320–1280px in both themes; nested modern picker Escape and reload persistence.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
