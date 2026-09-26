const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const build=await esbuild.build({entryPoints:['tests/browser/indicator-studio.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'feed',setup(b){b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const start=Date.parse('2026-09-18T09:15:00+05:30')/1000,candles=Array.from({length:330},(_,i)=>{const close=100+i*.03+4*Math.sin(i/9);return {time:start+i*300,open:close-.3,high:close+1,low:close-1,close,volume:1000+i*7};});
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,candles,quotes:{},segments:['historical']}));}res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?build.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script src="/qa.js"></script>`);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.qaCanvasText=new Set();window.qaCanvasPositions=new Map();const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.qaCanvasText.add(String(text));window.qaCanvasPositions.set(String(text),{x:args[0],y:args[1]});return fill.call(this,text,...args);};});
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.qaCandles?.data().length>300);
 await page.evaluate(()=>{window.qaIndicators({rsi:true});window.qaMagnet(true);});await page.waitForFunction(()=>window.qaStudies?.bundles.some(b=>b.id==='rsi'));await page.waitForTimeout(250);
 const points=await page.evaluate(()=>{const chart=window.qaChart,s=window.qaStudies.bundles.find(b=>b.id==='rsi').series[0],bounds=document.querySelector('.lightweight-chart').getBoundingClientRect();let top=0;for(let i=0;i<s.getPane().paneIndex();i++)top+=chart.panes()[i].getHeight();const data=s.data();return [data.at(-20),data.at(-10)].map(p=>({...p,x:bounds.left+chart.timeScale().timeToCoordinate(p.time),y:bounds.top+top+s.priceToCoordinate(p.value)}));});
 await page.mouse.move(points[0].x,points[0].y+18);
 await page.waitForFunction(value=>document.querySelector('.chart-oscillator-tag')?.textContent===value,points[0].value.toFixed(2));
 assert.equal(await page.locator('.chart-oscillator-tag').count(),1);
 await page.evaluate(()=>window.qaTool('trend-line'));await page.waitForFunction(()=>!document.querySelector('.drawing-crosshair').hidden);
 const host=await page.locator('.lightweight-chart').boundingBox();
 await page.touchscreen.tap(host.x+100,host.y+150); // confirm existing RSI aim, not this tap location
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST')||'[]').length),0);
 const aim=await page.locator('.drawing-crosshair').evaluate(e=>({x:parseFloat(e.style.getPropertyValue('--aim-x')),y:parseFloat(e.style.getPropertyValue('--aim-y'))}));
 await page.mouse.move(host.x+100,host.y+160);await page.mouse.down();await page.mouse.move(host.x+100+points[1].x-host.x-aim.x,host.y+160+points[1].y-host.y-aim.y,{steps:10});await page.mouse.up();
 await page.touchscreen.tap(host.x+100,host.y+160);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST')||'[]').length===1);
 const line=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST'))[0]);
 assert.ok(Math.abs(line.a.value-points[0].value)<.001);assert.equal(line.a.time,points[0].time);assert.ok(Math.abs(line.b.value-points[1].value)<.001);
 const drawn=await page.locator('.chart-study-drawings g[clip-path]>line').first().evaluate(el=>({x1:+el.getAttribute('x1'),x2:+el.getAttribute('x2')}));
 assert.ok(drawn.x2-drawn.x1<250,'Trend line ends at its second point');
 await page.evaluate(()=>{const dock=document.createElement('footer');dock.className='permanent-trade-footer';dock.innerHTML='<button>SELL</button><button>BUY</button>';dock.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:999999;background:white;height:74px';document.querySelector('.terminal-shell').append(dock);});
 await page.getByRole('button',{name:'Drawing settings',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'DIALOG','Opening settings must not focus an input');
 assert.equal(await page.locator('.permanent-trade-footer').evaluate(e=>getComputedStyle(e).visibility),'hidden');
 // Simulate Android resize-visual without shrinking the underlying chart.
 await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:360});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:42});visualViewport.dispatchEvent(new Event('resize'));});
 await page.getByLabel('Drawing text').fill('RSI divergence');
 const apply=page.getByRole('button',{name:'Apply',exact:true});
 assert.ok(await apply.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=42&&r.bottom<=402&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),'Apply stays visible and above the trading row with keyboard open');
 await page.screenshot({path:'outputs/drawing-settings-keyboard-verified.png'});
 await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
 await page.getByLabel('Drawing text').fill('RSI divergence');await page.getByLabel('Text position').selectOption('below');await page.getByLabel('Text alignment').selectOption('right');await page.getByLabel('Extend right',{exact:true}).check();await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.getByText('RSI divergence',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST'))[0].presentation.extendRight),true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.reload();await page.getByText('RSI divergence',{exact:true}).waitFor();
 const editPoints=await page.evaluate(()=>{const chart=window.qaChart,s=window.qaStudies.bundles.find(b=>b.id==='rsi').series[0],bounds=document.querySelector('.lightweight-chart').getBoundingClientRect();const top=chart.panes()[0].getHeight(),line=JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST'))[0],next=s.data().find(p=>Number(p.time)>line.a.time);return [line.a,next].map(p=>({...p,x:bounds.left+chart.timeScale().timeToCoordinate(p.time),y:bounds.top+top+s.priceToCoordinate(p.value)}));});
 await page.mouse.move(editPoints[0].x,editPoints[0].y);await page.mouse.down();await page.mouse.move(editPoints[1].x,editPoints[1].y,{steps:6});await page.mouse.up();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST'))[0].a.time),editPoints[1].time);
 await page.screenshot({path:'outputs/rsi-drawing-settings-verified.png'});
 // A crosshair starting on price can be dragged into RSI before the first tap.
 await page.mouse.move(host.x+150,host.y+150);await page.evaluate(()=>{window.qaMagnet(true);window.qaTool('horizontal-line');});
 await page.waitForFunction(()=>!document.querySelector('.drawing-crosshair').hidden);
 const mainAim=await page.locator('.drawing-crosshair').evaluate(e=>({x:parseFloat(e.style.getPropertyValue('--aim-x')),y:parseFloat(e.style.getPropertyValue('--aim-y'))}));
 await page.mouse.move(host.x+100,host.y+100);await page.mouse.down();await page.mouse.move(host.x+100+editPoints[1].x-host.x-mainAim.x,host.y+100+editPoints[1].y-host.y-mainAim.y,{steps:12});await page.mouse.up();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST')).length),1);
 await page.touchscreen.tap(host.x+100,host.y+160);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST')).length===2);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-study-drawings:NSE_EQ|TEST'))[1].studyId),'rsi');
 // Exercise the real native vertical-line renderer: geometry-only tests miss
 // renderers that paint anchor timestamps directly and ignore custom text.
 await page.mouse.move(host.x+150,host.y+200);await page.evaluate(()=>window.qaTool('vertical-line'));
 await page.waitForFunction(()=>!document.querySelector('.drawing-crosshair').hidden);
 await page.touchscreen.tap(host.x+100,host.y+160);
 await page.waitForFunction(()=>window.qaManager.getAllDrawings().some(d=>d.type==='vertical-line'));
 const verticalTime=await page.evaluate(()=>String(window.qaManager.getAllDrawings().find(d=>d.type==='vertical-line').anchors[0].time));
 assert.equal(await page.evaluate(time=>window.qaCanvasText.has(time),verticalTime),false);
 await page.getByRole('button',{name:'Drawing settings',exact:true}).click();
 await page.getByLabel('Drawing text').fill('My D1 peak');await page.getByLabel('Text position').selectOption('middle');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.waitForFunction(()=>window.qaCanvasText.has('My D1 peak'));
 await page.screenshot({path:'outputs/vertical-line-text-verified.png'});
 await page.reload();await page.waitForFunction(()=>window.qaCanvasText.has('My D1 peak'));
 assert.equal(await page.evaluate(time=>window.qaCanvasText.has(time),verticalTime),false);
 await page.evaluate(()=>{window.qaChart.priceScale('right').setAutoScale(false);window.qaChart.priceScale('right').setVisibleRange({from:95,to:125});});
 await page.waitForFunction(()=>{const line=window.qaManager.getAllDrawings().find(d=>d.type==='vertical-line'),bar=window.qaCandles.data().find(c=>c.time===line.anchors[0].time),painted=window.qaCanvasPositions.get('My D1 peak');return painted&&Math.abs(painted.y-(window.qaCandles.priceToCoordinate(bar.close)-8))<1;});
 await page.evaluate(()=>{window.qaCanvasText.clear();window.qaChart.timeScale().setVisibleLogicalRange({from:0,to:25});});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.evaluate(()=>window.qaCanvasText.has('My D1 peak')),false,'Offscreen candle text does not stick to chart edge');
 assert.deepEqual(errors,[]);console.log('RSI: dot-value readout, magnet, remote first/second-point confirmation, finite trend, text/settings and persistence pass.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
