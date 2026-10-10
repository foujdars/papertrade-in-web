/* eslint-disable @typescript-eslint/no-require-imports -- Browser harness uses externally installed packages. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const server=process.env.START_TEST_SERVER?require('node:child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3229','--hostname','127.0.0.1'],{stdio:'pipe'}):null;
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
  await page.getByRole('button',{name:'Open bulk deals, 2 deals',exact:true}).waitFor();
  assert.equal(await page.locator('.home-dashboard-scroll > *').last().getAttribute('class'),'home-deal-slot','Deals are the last Home section');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.locator('.home-deals-summary').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Deals fit ${width}px`);}
  await page.setViewportSize({width:390,height:844});
  for(const [name,destination]of [['Charts','trade'],['Watchlist','watchlist'],['Scanner','markets'],['News','news'],['IPO','ipo'],['Fundamental Analysis','fundamentals'],['P&L','pnl']]){await tab(name);await section(destination);await page.goBack();await section('home');}
  await page.getByRole('button',{name:'Open block deals, 1 deals',exact:true}).click();await page.getByRole('button',{name:'Show RELIANCE deals',exact:true}).click();await page.goBack();await page.locator('.home-deal-row').waitFor({state:'hidden'});await page.getByRole('dialog',{name:'Bulk and block deals',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open RELIANCE chart',exact:true}).click();await section('trade');await page.goBack();await section('home');await page.getByRole('dialog',{name:'Bulk and block deals',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Coach',exact:true}).click();await page.getByRole('dialog',{name:'Trading coach',exact:true}).waitFor();await page.getByRole('tab',{name:'replay',exact:true}).click();await page.locator('.bar-replay-tools > button').first().click();await page.getByRole('dialog',{name:'Choose chart timeframe',exact:true}).waitFor();
  await page.goBack();await page.getByRole('dialog',{name:'Choose chart timeframe',exact:true}).waitFor({state:'hidden'});await page.getByRole('dialog',{name:'Trading coach',exact:true}).waitFor();await page.goBack();await page.getByRole('dialog',{name:'Trading coach',exact:true}).waitFor({state:'hidden'});await section('home');
  await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Bot',exact:true}).click();await section('bot');await page.goBack();await section('home');
  await tab('Charts');await page.getByRole('button',{name:/^Timeframe:/}).filter({visible:true}).click();await page.getByRole('dialog',{name:'Choose chart timeframe',exact:true}).waitFor();await page.goBack();await section('trade');await page.getByRole('dialog',{name:'Choose chart timeframe',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:/^Bar replay for/}).filter({visible:true}).click();await page.locator('.chart-replay-bar').waitFor();await page.goBack();await page.locator('.chart-replay-bar').waitFor({state:'hidden'});await section('trade');await page.goBack();await section('home');
  assert.deepEqual(errors,[]);console.log('PASS: Actual dashboard Home deals at bottom, responsive counts, all tabs, chart-to-Home Back, Coach nested timeframe, Bot menu transition, chart timeframe and inline Replay Back.');
 }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
