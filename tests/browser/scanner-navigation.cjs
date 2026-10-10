/* eslint-disable @typescript-eslint/no-require-imports -- Browser harness uses externally installed packages. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const server=process.env.START_TEST_SERVER?require('node:child_process').spawn(process.execPath,[require('node:path').resolve('node_modules/vinext/dist/cli.js'),'start','--port','3229'],{stdio:'pipe'}):null;
 let browser;
 try{
  if(server)for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3229')).ok)break;}catch{}if(i===59)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,500));}
  const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const mod=require(process.env.CHROMIUM_PACKAGE),c=mod.default||mod;launch.executablePath=await c.executablePath();launch.args=c.args;}browser=await chromium.launch(launch);
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('https://assets.upstox.com/**',r=>r.abort());
  const rows=['Bulk','Bulk','Block'].map((kind,i)=>({symbol:'RELIANCE',name:'Reliance Industries',isin:'INE002A01018',client:`Client ${i}`,side:'Buy',kind,qty:1000,price:100,value:100000,date:'2026-10-06'}));
  await page.route('**/api/**',r=>{const url=new URL(r.request().url());return r.fulfill({json:url.pathname==='/api/market/deals'?{ok:true,date:'2026-10-06',rows}:url.pathname==='/api/market/news'?{items:[{title:'Reliance Industries announces results',url:'https://example.com/news',source:'Test source',publishedAt:new Date().toISOString(),sentiment:'Positive',importance:3}],updatedAt:new Date().toISOString(),sourceCount:1}:url.pathname==='/api/upstox/candles'?{ok:true,candles:Array.from({length:100},(_,i)=>({time:1789712700+i*300,open:100,high:105,low:95,close:101,volume:1000}))}:{ok:true,quotes:{},candles:[],underlyings:[],instruments:[],connected:false}});});
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3229');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});
  const section=name=>page.waitForFunction(name=>document.querySelector('.terminal-shell')?.dataset.section===name,name);
  const nav=page.locator('.mobile-bottom-nav');const tab=name=>nav.getByRole('button',{name,exact:true}).click();
  await tab('Watchlist');await section('watchlist');
  assert.equal(await page.locator('.watchlist-market-header').count(),0);
  const lists=await page.locator('.watchlist-panel .desktop-watchlist-tabs button').allTextContents();
  assert.ok(!lists.some(t=>/ALL NSE|Trading watchlist/.test(t)));
  assert.ok(lists.findIndex(t=>t.includes('Indices')) < lists.findIndex(t=>t.includes('NIFTY 50')));
  await tab('Scanner');await section('markets');
  await page.getByRole('heading',{name:'PSSB MTF',exact:true}).waitFor();
  assert.equal(await page.getByText('PSBB divergences confirmed today',{exact:false}).count(),0);
  for(const width of [320,390,768]) { await page.setViewportSize({width,height:844}); assert.ok(await nav.evaluate(e=>e.scrollWidth<=e.clientWidth+1)); assert.equal(await nav.getByRole('button').count(),8); }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.scanner-workspace .market-section-tabs').getByRole('button',{name:'Investment',exact:true}).click();
  await page.locator('.market-scanner-tabs').waitFor();
  assert.equal(await page.getByRole('heading',{name:'PSSB MTF',exact:true}).count(),0);
  await page.locator('.scanner-workspace .market-section-tabs').getByRole('button',{name:'Trading',exact:true}).click();
  await page.getByRole('heading',{name:'PSSB MTF',exact:true}).waitFor();
  await page.getByRole('button',{name:'Other scanners',exact:true}).click();await page.locator('.market-scanner-tabs').waitFor();
  await tab('Watchlist');await section('watchlist');await page.goBack();await section('markets');await page.locator('.market-scanner-tabs').waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: Scanner navigation, PSSB MTF, investment and trading scans, ordered watchlists, eight mobile tabs, and browser Back.');
 }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
