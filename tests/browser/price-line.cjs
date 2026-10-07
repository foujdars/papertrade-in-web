/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const build=await esbuild.build({entryPoints:['tests/browser/price-line.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'feed',setup(b){b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const start=Date.parse('2026-09-18T09:15:00+05:30')/1000,candles=Array.from({length:330},(_,i)=>{const close=100+i*.03+4*Math.sin(i/9);return {time:start+i*300,open:close-.3,high:close+1,low:close-1,close,volume:1000};});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,candles,quotes:{},segments:['historical']}));}res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?build.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}</style><div id="root"></div><script src="/qa.js"></script>`);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const p=require(process.env.CHROMIUM_PACKAGE),c=p.default||p;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.addStyleTag({content:'.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}'});await page.waitForFunction(()=>window.qaSeries?.data().length>300);
  const aim=async()=>{const host=await page.locator('.lightweight-chart').boundingBox();await page.mouse.move(host.x+170,host.y+180);await page.locator('.chart-price-plus').waitFor();return page.evaluate(()=>({price:Number(document.querySelector('.chart-price-plus button').getAttribute('aria-label').split('at ')[1]),y:parseFloat(document.querySelector('.chart-price-plus').style.top)}));};
  assert.equal(await page.locator('.chart-price-plus').count(),0,'no price action before crosshair');
  await aim();assert.equal(await page.locator('.chart-price-plus').evaluate(el=>el.getBoundingClientRect().height),18,'compact label height');assert.equal(await page.evaluate(()=>window.qaChart.options().crosshair.horzLine.labelVisible),false,'no duplicate native price label');
  await page.evaluate(()=>window.qaChart.clearCrosshairPosition());await page.locator('.chart-price-plus').waitFor({state:'hidden'});
  await aim();await page.evaluate(()=>window.qaCrosshair());await page.waitForFunction(()=>!window.qaChart.options().crosshair.horzLine.visible);await page.locator('.chart-price-plus').waitFor({state:'hidden'});
  const hiddenHost=await page.locator('.lightweight-chart').boundingBox();await page.mouse.move(hiddenHost.x+180,hiddenHost.y+200);assert.equal(await page.locator('.chart-price-plus').count(),0,'no plus while crosshair toggled off');
  await page.evaluate(()=>window.qaCrosshair());await page.waitForFunction(()=>window.qaChart.options().crosshair.horzLine.visible);
  const cursor=await aim();await page.locator('.chart-price-plus button').click();
  await page.waitForFunction(()=>window.qaManager.getAllDrawings().length===1);
  const line=await page.evaluate(()=>window.qaManager.exportDrawings()[0]);assert.equal(line.type,'horizontal-line');assert.ok(Math.abs(line.anchors[0].price-cursor.price)<.006,'line uses crosshair price, not candle close');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>window.qaManager.getAllDrawings().length===0);await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(()=>window.qaManager.getAllDrawings().length===1);
  await page.reload();await page.waitForFunction(()=>window.qaManager?.getAllDrawings().length===1&&window.qaSeries?.data().length>300);assert.deepEqual(await page.evaluate(()=>window.qaManager.exportDrawings()[0].anchors),line.anchors);
  await page.getByRole('button',{name:'Theme',exact:true}).click();await page.waitForFunction(()=>window.qaSeries?.data().length>300);await aim();assert.ok(await page.locator('.chart-price-plus').isVisible());
  const host=await page.locator('.lightweight-chart').boundingBox();const paneHeight=await page.evaluate(()=>window.qaChart.panes()[0].getHeight());await page.mouse.move(host.x+170,host.y+paneHeight+35);await page.locator('.chart-price-plus').waitFor({state:'hidden'});
  await aim();await page.evaluate(()=>window.qaTool('horizontal-line'));await page.locator('.chart-price-plus').waitFor({state:'hidden'});await page.evaluate(()=>window.qaTool('cursor'));await page.waitForFunction(()=>window.qaChart.options().crosshair.horzLine.visible&&!document.querySelector('.lightweight-chart').classList.contains('is-drawing'));
  const touch=await page.context().newCDPSession(page);await page.mouse.move(0,0);await page.evaluate(()=>window.qaChart.clearCrosshairPosition());
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:host.x+170,y:host.y+180}]});await page.locator('.chart-price-plus').waitFor();
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:host.x+170,y:host.y+220}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);await page.locator('.chart-price-plus').waitFor();
  const point=await page.locator('.chart-price-plus button').getAttribute('aria-label');await page.locator('.chart-price-plus button').tap();await page.waitForFunction(()=>window.qaManager.getAllDrawings().length===2);assert.ok(Math.abs((await page.evaluate(()=>window.qaManager.exportDrawings().at(-1).anchors[0].price))-Number(point.split('at ')[1]))<.006);
  fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:'outputs/price-axis-line.png'});assert.deepEqual(errors,[]);console.log('PASS: compact single price label follows crosshair visibility; exact-price horizontal drawing, touch, persistence, undo/redo, dark mode and RSI/tool exclusions.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
