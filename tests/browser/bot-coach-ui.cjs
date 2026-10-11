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
  await page.addInitScript(() => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('papertrade-custom-watchlists',JSON.stringify([{id:'alpha',name:'My picks',symbols:['RELIANCE']},{id:'beta',name:'Long term',symbols:['INFY']}]));localStorage.setItem('qa-seeded','1'); } });
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3229');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});
  const section=name=>page.waitForFunction(name=>document.querySelector('.terminal-shell')?.dataset.section===name,name);
  const nav=page.locator('.mobile-bottom-nav');const tab=name=>nav.getByRole('button',{name,exact:true}).click();

  const more=page.getByRole('button',{name:'More options',exact:true});
  const openTool=async name=>{await more.click();await page.getByRole('button',{name,exact:true}).click();};
  await openTool('Bot');
  const bot=page.locator('.bot-workspace');await bot.waitFor();
  const preset21=bot.getByRole('button',{name:'EMA 21',exact:true}),preset5=bot.getByRole('button',{name:'EMA 5 reversal',exact:true});
  await preset21.click();assert.equal(await preset21.getAttribute('aria-pressed'),'true');assert.equal(await preset5.getAttribute('aria-pressed'),'false');
  await preset5.click();assert.equal(await preset21.getAttribute('aria-pressed'),'false');assert.equal(await preset5.getAttribute('aria-pressed'),'true');
  assert.notEqual(await preset21.evaluate(e=>getComputedStyle(e).backgroundColor),await preset5.evaluate(e=>getComputedStyle(e).backgroundColor));
  assert.match(await bot.getByLabel('Strategy',{exact:true}).textContent(),/EMA 5/);
  const five=bot.getByLabel('Entry timeframe 5m',{exact:true});
  await five.locator('..').click();assert.equal(await five.isChecked(),false);
  await five.focus();assert.equal(await nav.isVisible(),true);assert.equal(await nav.locator('button:visible').count(),7);
  await five.locator('..').click();assert.equal(await five.isChecked(),true);assert.equal(await nav.isVisible(),true);
  await bot.getByLabel('Strategy',{exact:true}).click();await page.getByRole('option',{name:'My EMA 21 entry',exact:true}).click();
  assert.equal(await preset21.getAttribute('aria-pressed'),'true');assert.equal(await preset5.getAttribute('aria-pressed'),'false');
  assert.match(await bot.getByLabel('Exit plan').textContent(),/Signal candle/);
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});assert.ok(await bot.evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Bot fits ${width}`);}
  await page.setViewportSize({width:390,height:844});await bot.evaluate(e=>e.scrollTop=0);await page.screenshot({path:'/tmp/bot-ui-light.png'});
  await bot.getByRole('button',{name:'Close bot',exact:true}).click();
  await more.click();await page.waitForTimeout(400);await page.screenshot({path:'/tmp/tools-menu-light.png'});await page.getByRole('button',{name:'Coach',exact:true}).click();
  const coach=page.getByRole('dialog',{name:'Trading coach'});await coach.waitFor();await page.waitForTimeout(400);
  assert.equal(await coach.evaluate(e=>getComputedStyle(e).animationName),'coach-slide-from-right');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});const box=await coach.boundingBox();assert.equal(box.x,0);assert.equal(box.y,0);assert.equal(box.width,width);assert.equal(box.height,844);assert.equal(await coach.evaluate(e=>getComputedStyle(e).borderRadius),'0px');assert.ok(await coach.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await page.setViewportSize({width:390,height:844});
  await coach.getByRole('tab',{name:'limits',exact:true}).click();await coach.getByLabel('Daily loss limit (₹)').fill('2500');await coach.getByRole('button',{name:'Save trading limits'}).click();await coach.getByRole('button',{name:'Saved',exact:true}).waitFor();
  await coach.getByLabel('Daily loss limit (₹)').fill('3000');await coach.getByRole('button',{name:'Save trading limits'}).waitFor();
  await coach.getByRole('tab',{name:'payoff',exact:true}).click();await coach.getByText('Select an option contract',{exact:true}).waitFor();
  await coach.getByRole('tab',{name:'journal',exact:true}).click();await page.screenshot({path:'/tmp/coach-ui-light.png'});
  await page.keyboard.press('Escape');await coach.waitFor({state:'hidden'});await page.waitForTimeout(200);assert.ok(await more.evaluate(e=>e===document.activeElement));
  await more.click();await page.getByRole('button',{name:'Use neon dark theme'}).click();await page.getByRole('button',{name:'Bot',exact:true}).click();await bot.waitFor();
  await preset5.click();await five.focus();assert.equal(await nav.isVisible(),true);await bot.evaluate(e=>e.scrollTop=0);await page.screenshot({path:'/tmp/bot-ui-dark.png'});
  await bot.getByRole('button',{name:'Close bot',exact:true}).click();await openTool('Coach');await coach.waitFor();await page.waitForTimeout(400);await page.screenshot({path:'/tmp/coach-ui-dark.png'});
  await page.goBack();await coach.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS: bottom navigation after timeframe focus; exclusive presets and matching dropdown; responsive Bot; full-screen Coach, limits, Escape/Back and both themes.');
 }finally{await browser?.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
