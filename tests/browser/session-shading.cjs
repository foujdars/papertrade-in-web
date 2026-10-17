const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const bundle=await esbuild.build({entryPoints:['tests/browser/session-shading.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'feed',setup(b){b.onResolve({filter:/PineCodeEditor$/},()=>({path:'editor',namespace:'editor'}));b.onLoad({filter:/.*/,namespace:'editor'},()=>({contents:'export function PineCodeEditor(){return null}',loader:'js'}));b.onResolve({filter:/upstox-live-feed$/},()=>({path:'feed',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export async function openUpstoxLiveFeed(){return ()=>{}}',loader:'js'}));}}]});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width"><style>body{margin:0}${css}</style><div id="root"></div><script src="/qa.js"></script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 const pkg=require(process.env.CHROMIUM_PACKAGE),c=pkg.default||pkg;
 browser=await chromium.launch({headless:true,executablePath:await c.executablePath(),args:c.args});
 for(const global of [false,true]){
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const start=Date.parse(global?'2026-10-15T00:00:00Z':'2026-10-15T03:45:00Z')/1000;
 await page.addInitScript(({start,global})=>{window.fixtureCandles=Array.from({length:global?288:76},(_,i)=>({time:start+i*300,open:100,close:101,high:102,low:99,volume:1000}));},{start,global});
 await page.goto(`http://127.0.0.1:${server.address().port}/${global?'?global':''}`);
 await page.waitForFunction(()=>window.qaChart&&window.loadSessionBars);await page.evaluate(()=>window.loadSessionBars());
 await page.waitForFunction(()=>document.querySelectorAll('.chart-session-shade').length>0);
 for(const theme of ['light','neon']){
 if(theme==='neon')await page.getByRole('button',{name:'Theme',exact:true}).click();
 for(const width of [390,1000]){
 await page.setViewportSize({width,height:700});await page.evaluate(()=>window.qaChart.timeScale().fitContent());
 await page.waitForFunction(()=>[...document.querySelectorAll('.chart-session-shade')].some(el=>el.getBoundingClientRect().width>10));
 const layers=await page.evaluate(()=>{const chart=document.querySelector('.lightweight-chart'),shade=document.querySelector('.chart-session-shade');return {isolation:getComputedStyle(chart).isolation,chartZ:getComputedStyle(chart).zIndex,shadeZ:getComputedStyle(shade).zIndex};});
 assert.equal(layers.isolation,'isolate');assert.ok(Number(layers.shadeZ)>Number(layers.chartZ));
 const band=await page.locator('.chart-session-shade').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).find(r=>r.width>10));
 const clip={x:Math.max(0,Math.ceil(band.x))+2,y:Math.ceil(band.y)+200,width:4,height:4};
 const visiblePixel=await page.screenshot({clip});
 const hideStyle=await page.addStyleTag({content:'.chart-session-shade{visibility:hidden!important}'});
 const hiddenPixel=await page.screenshot({clip});await hideStyle.evaluate(el=>el.remove());
 assert.notDeepEqual(visiblePixel,hiddenPixel,'Shading must visibly tint the canvas, not just exist in the DOM');

 const hide=page.getByRole('button',{name:/Hide India session shade/});await hide.click();assert.equal(await page.getByRole('button',{name:/Show India session shade/}).getAttribute('aria-pressed'),'false');
 await page.getByRole('button',{name:/Show India session shade/}).click();await page.waitForFunction(()=>document.querySelectorAll('.chart-session-shade').length>0);
 }
 }
 await page.getByRole('button',{name:'Frame',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.chart-session-shade'));
 assert.equal(await page.getByRole('button',{name:'India session shading requires an intraday timeframe'}).getAttribute('aria-disabled'),'true');
 assert.deepEqual(errors,[]);
 }
 console.log('PASS session shading: delayed candles, Indian/global feeds, light/dark, mobile/desktop, toggles, resize and daily control state');
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
