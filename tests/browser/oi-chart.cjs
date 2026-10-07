/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const build=await esbuild.build({entryPoints:['tests/browser/oi-chart.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?build.outputFiles[0].text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}.terminal-shell{display:block!important;padding:12px;min-height:100vh}.home-option-pulse{max-width:900px;margin:auto}</style><div id="root"></div><script src="/qa.js"></script>`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const p=require(process.env.CHROMIUM_PACKAGE),c=p.default||p;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
  for(const theme of ['light','neon'])for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.locator('.terminal-shell').evaluate((el,t)=>el.dataset.theme=t,theme);
   for(const symbol of ['NIFTY','BANKNIFTY','MIDCPNIFTY']){
    await page.getByRole('button',{name:symbol,exact:true}).click();await page.waitForFunction(s=>document.querySelector('.home-oi-spot text')?.textContent.startsWith(s),symbol);
    assert.equal(await page.locator('.home-oi-marker').count(),3);assert.ok(await page.locator('.home-oi-chart-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal graph overflow');
    const boxes=await page.locator('.home-oi-marker rect').evaluateAll(es=>es.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(boxes[i].right<=boxes[j].x||boxes[j].right<=boxes[i].x||boxes[i].bottom<=boxes[j].y||boxes[j].bottom<=boxes[i].y,'same-strike badges do not overlap');
    if(width===390&&symbol==='MIDCPNIFTY'){fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:`outputs/oi-chart-${theme}.png`});}
   }
  }
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Change',exact:true}).click();await page.getByRole('img',{name:'Call and put change in open interest by strike',exact:true}).waitFor();
  const checkBars=async()=>{assert.ok(await page.locator('.home-oi-bar').evaluateAll(es=>{const box=es[0].ownerSVGElement.viewBox.baseVal;return es.every(el=>{const b=el.getBBox();return b.y>=0&&b.y+b.height<box.height&&Number.isFinite(b.height);});}),'all signed bars fit the plot');assert.equal(await page.locator('.home-oi-zero').count(),1);};
  await checkBars();await page.screenshot({path:'outputs/oi-change.png'});await page.getByRole('button',{name:'Negative only',exact:true}).click();await checkBars();assert.deepEqual(errors,[]);
  console.log('PASS: OI charts fit 320–1280px in both themes; three instruments, current price, collocated levels, signed/negative-only change bars.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
