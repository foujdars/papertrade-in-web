const fs=require('fs'),http=require('http'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const build=await esbuild.build({entryPoints:['tests/browser/home-market.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
 const gain={symbol:'BHARTIARTL',name:'Bharti Airtel',price:1785.4,change:3.28,volume:120000,tradedValue:null,note:null},loss={...gain,symbol:'RELIANCE',name:'Reliance Industries',change:-2.12};
 const watch=[gain,loss,{...gain,symbol:'HDFCBANK',change:1.2},{...gain,symbol:'INFY',change:0}];
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');const body=req.url.startsWith('/api/market/movers')?{ok:true,lists:{gainers:[gain],losers:[loss],high52:[gain],low52:[loss],active:[gain],volume:[gain],upper:[],lower:[]}}:req.url.startsWith('/api/market/equity-watch')?{ok:true,rows:watch}:{ok:false};return res.end(JSON.stringify(body));}
  res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');res.end(req.url==='/qa.js'?build.outputFiles[0].text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const c=(await import(process.env.CHROMIUM_PACKAGE)).default;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText('BHARTIARTL',{exact:true}).first().waitFor();await page.waitForTimeout(200);
  assert.equal(await page.locator('.home-index-card i').count(),0,'index quotes have no live dots');assert.equal(await page.locator('.home-breadth-preview').count(),3);
  assert.equal(await page.locator('.home-breadth-preview').first().getAttribute('aria-label'),'Nifty 50: 2 rising, 1 falling, 1 unchanged');
  assert.equal(await page.locator('.home-breadth-meter').count(),0);assert.deepEqual(await page.locator('.home-breadth-counts').first().locator('em').allTextContents(),['2 up','1 down']);assert.equal(await page.locator('.home-breadth-preview .stock-logo').count(),3);
  for(const theme of ['light','neon']){
   if(theme==='neon')await page.getByRole('button',{name:'Theme',exact:true}).click();
   for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
    assert.ok(await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${theme} home fits ${width}`);
    assert.ok(await page.locator('.home-index-card > b').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1)),`${theme} complete index values fit ${width}`);
    const indices=await page.locator('.home-index-card').evaluateAll(elements=>elements.map(e=>({y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height})));assert.ok(indices.every(i=>Math.abs(i.y-indices[0].y)<1 && i.height>=44 && i.height<76),'indices share one compact row with usable touch targets');
    const tiles=await page.locator('.home-market-card-v2').evaluateAll(elements=>elements.map(e=>({bg:getComputedStyle(e).backgroundColor,height:e.getBoundingClientRect().height})));assert.ok(tiles.every(t=>t.height<110),'compact overview cards');assert.notEqual(await page.locator('.home-market-pair').evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','shared market panel has a themed surface');
    const pulse=await page.locator('.home-pulse-first').evaluate(e=>({height:e.getBoundingClientRect().height,children:[...e.children].map(c=>({tag:c.className,height:c.getBoundingClientRect().height,display:getComputedStyle(c).display,padding:getComputedStyle(c).padding,position:getComputedStyle(c).position}))}));assert.ok(pulse.height<130,`indices and session strip stay short: ${width} ${JSON.stringify(pulse)}`);
    assert.equal(await page.locator('.home-session-board').count(),0,'home session row removed');
    assert.ok(await page.locator('.india-breadth-card').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('.home-derivatives')) & Node.DOCUMENT_POSITION_FOLLOWING)),'derivatives follow the advance/decline chart');
    assert.ok(await page.locator('.home-index-change').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth+1)),'percentage and point changes fit');
    if(width===390){await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`outputs/home-market-${theme}.png`});await page.locator('.home-market-pair').screenshot({path:`outputs/home-market-cards-${theme}.png`});}
   }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:"Today's profit and loss — open positions",exact:true}).click();assert.equal(await page.evaluate(()=>window.qaPositions),true,'zero-trade P&L opens positions');
  await page.getByRole('button',{name:'Open your watchlists',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaWatchlists),true);
  await page.getByRole('button',{name:'Open NIFTY 50 chart',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaOpened),'NIFTY');
  await page.getByRole('button',{name:/Open market movers/}).click();const movers=page.getByRole('dialog',{name:'Market movers',exact:true});await movers.waitFor();await movers.getByRole('tab',{name:'Losers',exact:true}).click();await movers.getByRole('button',{name:'Open RELIANCE chart',exact:true}).click();assert.equal(await page.evaluate(()=>window.qaOpened),'RELIANCE');await movers.waitFor({state:'hidden'});
  await page.getByRole('button',{name:/Open equity market/}).click();const equity=page.getByRole('dialog',{name:'Equity market watch'});await equity.waitFor();await equity.getByRole('tab',{name:'Bank',exact:true}).click();await equity.getByRole('button',{name:'Open HDFCBANK chart',exact:true}).waitFor();await equity.getByRole('button',{name:'A–Z',exact:true}).click();await page.keyboard.press('Escape');await equity.waitFor({state:'hidden'});
  await page.evaluate(()=>window.qaIndices([{symbol:'NIFTY',label:'NIFTY 50',price:null,points:null,changePercent:null,live:false}]));await page.getByText('Awaiting quotes',{exact:true}).waitFor({state:'attached'});assert.equal(await page.locator('.home-index-change .positive').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS: home indices have complete quotes/no live dots; compact light/dark layouts at 320–1280px; breadth counts and logos; empty-position P&L action; mover tabs, index filters, chart actions, Escape and unavailable quotes.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
