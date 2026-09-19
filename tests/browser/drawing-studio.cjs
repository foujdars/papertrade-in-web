const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({entryPoints:['tests/browser/drawing-studio.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'mock-platform-feed',setup(b){
  b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));
  b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'native',namespace:'qa'}));
  b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='feed'?'export async function openUpstoxLiveFeed(){return ()=>{}}':'export const Capacitor={getPlatform:()=>"android",isNativePlatform:()=>true}; export const registerPlugin=()=>({});',loader:'js'}));
 }}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const start=Date.parse('2026-09-18T09:15:00+05:30')/1000;
 const candles=Array.from({length:65},(_,i)=>({time:start+i*300,open:100+i*.15,close:100.1+i*.15,high:101+i*.15,low:99+i*.15,volume:1000}));
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,candles,quotes:{},segments:['historical']}));}
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap{flex:1;min-width:0;height:100%!important}.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script src="/qa.js"></script>`);
 }).listen(3231,'127.0.0.1');
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({start})=>{
   if(!localStorage.getItem('papertrade-lwc-drawings-v1:NSE_EQ|TEST'))localStorage.setItem('papertrade-lwc-drawings-v1:NSE_EQ|TEST',JSON.stringify([{id:'saved-long',type:'long-position',anchors:[{time:start+300*48,price:106},{time:start+300*57,price:103},{time:start+300*57,price:112}],style:{lineColor:'#00876b',lineWidth:1,fillColor:'#00876b',fillOpacity:.2,showLabels:true},options:{visible:true,locked:false}}]));
  },{start:start+19800});
  await page.goto('http://127.0.0.1:3231');await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1);
  await page.waitForTimeout(500);await page.screenshot({path:'outputs/drawing-position-light.png'});
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'),/user-scalable=no/);
  const open=()=>page.getByRole('button',{name:'Open drawing tools',exact:true}).click();
  await open();const dialog=page.getByRole('dialog',{name:'Drawing tools',exact:true});await dialog.waitFor();
  await dialog.getByRole('button',{name:'Forecasting and measurement',exact:true}).click();
  await dialog.getByRole('button',{name:'Favorite Long Position',exact:true}).click();
  await dialog.getByRole('button',{name:'Patterns',exact:true}).click();await dialog.getByRole('button',{name:'Favorite XABCD Pattern',exact:true}).click();
  await dialog.getByRole('button',{name:'Favorites',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Long Position',exact:true}).count(),1);assert.equal(await dialog.getByRole('button',{name:'XABCD Pattern',exact:true}).count(),1);
  await dialog.getByRole('switch',{name:'Show favorites on chart'}).click();await page.getByRole('button',{name:'Close drawing tools'}).click();
  assert.equal(await page.locator('.drawing-toolbar').getByRole('button',{name:'Long Position',exact:true}).count(),0);
  await page.reload();await open();assert.equal(await page.getByRole('switch',{name:'Show favorites on chart'}).getAttribute('aria-checked'),'false');await page.getByRole('switch',{name:'Show favorites on chart'}).click();
  for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});const b=await dialog.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width+1);assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   if(width===390)await page.screenshot({path:'outputs/drawing-favorites.png'});
  }
  await page.setViewportSize({width:390,height:844});await page.getByLabel('Search drawing tools').fill('short position');assert.equal(await dialog.locator('.drawing-tile').count(),1);
  await dialog.getByRole('button',{name:'Short Position',exact:true}).click();assert.equal(await page.locator('[data-active]').textContent(),'short-position');await page.getByRole('button',{name:'Cursor',exact:true}).click();
  await open();await dialog.getByRole('button',{name:'Patterns',exact:true}).click();assert.equal(await dialog.locator('.drawing-tile').count(),14);await page.screenshot({path:'outputs/drawing-patterns.png'});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Theme',exact:true}).click();await open();await page.screenshot({path:'outputs/drawing-favorites-dark.png'});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  // Place a five-anchor manual pattern through the same relative-drag interaction as a phone.
  await open();await dialog.getByRole('button',{name:'Patterns',exact:true}).click();await dialog.getByRole('button',{name:'XABCD Pattern',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.drawing-crosshair').hidden);
  const host=await page.locator('.lightweight-chart').boundingBox();
  for(const [x,y] of [[40,290],[80,180],[120,270],[160,215],[205,330]]){
   const aim=await page.locator('.drawing-crosshair').evaluate(e=>({x:parseFloat(e.style.getPropertyValue('--aim-x')),y:parseFloat(e.style.getPropertyValue('--aim-y'))}));
   await page.mouse.move(host.x+130,host.y+300);await page.mouse.down();await page.mouse.move(host.x+130+x-aim.x,host.y+300+y-aim.y,{steps:8});await page.mouse.up();
   await page.mouse.click(host.x+130,host.y+300);
  }
  await page.waitForFunction(()=>document.querySelector('[data-active]').textContent==='cursor');
  const pattern=await page.evaluate(()=>window.qaManager.getAllDrawings().find(d=>d.type==='xabcd-pattern')?.toJSON());
  assert.equal(pattern.anchors.length,5);assert.equal(new Set(pattern.anchors.map(a=>a.time)).size,5);
  await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().some(d=>d.type==='xabcd-pattern'));
  // Android viewport guard stops page pinch, but does not consume chart multi-touch.
  const cancellation=await page.evaluate(()=>{
   const send=el=>{let blockedByPage=false;const event=new Event('touchmove',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[{},{}]});const prevent=event.preventDefault.bind(event);event.preventDefault=()=>{if(event.currentTarget===document)blockedByPage=true;prevent();};el.dispatchEvent(event);return blockedByPage;};
   return {shell:send(document.querySelector('header')),chart:send(document.querySelector('.lightweight-chart'))};
  });assert.equal(cancellation.shell,true);assert.equal(cancellation.chart,false);
  assert.deepEqual(errors,[]);console.log('Drawing studio: saved position restored, manual five-point pattern placement/restart, all categories, search, favorites/restart, toolbar visibility, responsive layouts, dark theme, Escape and Android page-zoom guard pass');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
