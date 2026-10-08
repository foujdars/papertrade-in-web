/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const server=process.env.START_TEST_SERVER?require('node:child_process').spawn(process.execPath,[fs.realpathSync('node_modules/.bin/vinext'),'start','--port','3229'],{stdio:'pipe'}):null;
 if(server)for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3229')).ok)break;}catch{}if(i===59){server.kill();throw Error('Test server unavailable');}await new Promise(r=>setTimeout(r,500));}
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const p=require(process.env.CHROMIUM_PACKAGE),c=p.default||p;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('papertrade-custom-watchlists',JSON.stringify([{id:'qa',name:'My favourites',symbols:[]}])));
  await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('https://assets.upstox.com/**',r=>r.abort());
  await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/api/upstox/candles')?{ok:true,segments:['historical'],candles:Array.from({length:100},(_,i)=>({time:1789712700+i*300,open:100,high:105,low:95,close:101,volume:1000}))}:{ok:true,quotes:{},candles:[],underlyings:[{symbol:'RELIANCE',name:'Reliance Industries',instrumentKey:'NSE_EQ|INE002A01018',underlyingType:'EQUITY',optionContracts:10,futureContracts:1}],instruments:[],connected:false}}));
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3229');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});
  await page.getByRole('button',{name:"Today's profit and loss — open positions"}).click();
  const positions=page.getByRole('dialog',{name:'Open positions',exact:true});await positions.waitFor();
  assert.equal(await positions.getByText('No open positions',{exact:true}).count(),1);
  await positions.getByRole('button',{name:'Close positions',exact:true}).click();
  await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Charts',exact:true}).click();
  const star=page.locator('.chart-floating-favourite');await star.waitFor();
  assert.equal(await page.locator('.trade-cockpit .chart-watchlist-star').count(),0,'star moved out of control row');
  for(const theme of ['light','neon'])for(const width of [320,390,768,1280]){
   await page.setViewportSize({width,height:844});await page.locator('.terminal-shell').evaluate((el,t)=>el.dataset.theme=t,theme);
   assert.ok(await page.locator('.chart-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${theme} toolbar fits ${width}`);
   const button=page.locator('.desktop-chart-symbol .chart-compare-link');
   assert.ok(await button.evaluate(el=>getComputedStyle(el).borderRadius==='50%'),'compare is circular');
   assert.ok(await button.evaluate(el=>el.parentElement.classList.contains('chart-symbol-search')),'compare inside symbol surface');
   assert.ok(await star.evaluate(el=>el.parentElement.classList.contains('chart-body')&&getComputedStyle(el).position==='absolute'),'favourite floats on chart');
   assert.ok(await page.locator('.desktop-symbol-trigger .stock-logo').evaluate(el=>Math.abs(el.getBoundingClientRect().width-22)<1&&Math.abs(el.getBoundingClientRect().height-22)<1),'logo fixed at 22px');
   assert.ok(await page.locator('.desktop-chart-symbol .chart-symbol-search').evaluate(el=>el.getBoundingClientRect().width<=182),'symbol selector compact');
   assert.equal(await star.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','favourite circle transparent');
   const link=page.locator('.desktop-chart-symbol .chart-derivatives-link');await link.waitFor();assert.ok(await link.evaluate(el=>getComputedStyle(el).borderRadius==='50%'&&getComputedStyle(el).backgroundColor==='rgba(0, 0, 0, 0)'&&el.previousElementSibling.classList.contains('chart-symbol-search')),'option link transparent circle beside selector');
   if(width===390){fs.mkdirSync('outputs',{recursive:true});await page.screenshot({path:`outputs/chart-symbol-controls-${theme}.png`});}
  }
  await page.setViewportSize({width:390,height:844});await star.click();
  const watchlists=page.getByRole('dialog',{name:'Custom watchlists',exact:true});await watchlists.waitFor();await watchlists.getByRole('button',{name:/My favourites/}).click();
  await watchlists.getByRole('button',{name:'Close custom watchlists',exact:true}).click();assert.ok(await star.evaluate(el=>el.classList.contains('saved')),'saved state preserved');
  assert.equal(await star.evaluate(el=>getComputedStyle(el).color),'rgb(234, 179, 8)','saved favourite turns yellow');
  await page.locator('.desktop-chart-symbol .chart-compare-link').click();const compare=page.getByRole('dialog',{name:'Compare symbols',exact:true});await compare.waitFor();
  await compare.getByLabel('Search symbols to compare').fill('HDFCBANK');await compare.locator('.compare-picker-list button').first().click();await compare.getByRole('button',{name:'Close compare symbols',exact:true}).click();
  assert.ok(await page.locator('.desktop-chart-symbol .chart-compare-link').evaluate(el=>el.classList.contains('active')),'comparison selection retained');
  await page.locator('.desktop-symbol-trigger').click();await page.locator('.desktop-symbol-menu input').fill('TCS');await page.locator('.desktop-symbol-menu > div > button').first().click();await page.getByRole('button',{name:'Add TCS to a custom watchlist',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: floating favourite/save, circular compare/select and symbol search; toolbar fits both themes at 320–1280px.');
 }finally{await browser.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
