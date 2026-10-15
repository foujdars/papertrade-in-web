// Use START_TEST_SERVER=1 after building, or PNL_APP_URL for an existing server. Only isolated browser storage and mocked feeds are used.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const {buildClosedTrades}=await import('../../lib/trade-analytics.ts');
 const orders=Array.from({length:14},(_,i)=>{
  const createdAt=Date.parse('2026-09-01T10:00:00+05:30')+i*86400000,price=i%3===0?90:120;
  const shared={symbol:'RELIANCE',instrumentKey:'NSE_EQ|INE002A01018',quantity:10,status:'COMPLETE',product:i%2?'INTRADAY':'DELIVERY',journalPlan:{strategy:i%2?'SMC':'Breakout'}};
  return [{...shared,id:`pnl-entry-${i}`,side:'BUY',price:100,createdAt,time:'10:00'},{...shared,id:`pnl-exit-${i}`,side:'SELL',price,createdAt:createdAt+3600000,time:'11:00'}];
 }).flat();
 const expected=buildClosedTrades(orders),net=expected.reduce((s,t)=>s+t.netPnl,0);
 const {readGlobalAccount}=await import('../../lib/global-order-engine.ts');
 const globalAccount={...readGlobalAccount(null),wallet:10118,events:[
  {id:'global-open',symbol:'BTCUSD',kind:'OPEN',at:Date.parse('2026-09-05T10:00:00+05:30'),contracts:1,price:100,pnl:0,fee:2,detail:'Long'},
  {id:'global-exit',symbol:'BTCUSD',kind:'CLOSE',at:Date.parse('2026-09-05T11:00:00+05:30'),contracts:1,price:225,pnl:125,fee:5,detail:'Manual close'}
 ]};
 const launch={headless:true};if(process.env.CHROMIUM_PACKAGE){const c=require(process.env.CHROMIUM_PACKAGE);launch.executablePath=await c.executablePath();launch.args=c.args;}
 const server=process.env.START_TEST_SERVER?require('node:child_process').spawn(process.execPath,[require('node:path').resolve('node_modules/vinext/dist/cli.js'),'start','--port','3220'],{stdio:'pipe'}):null;
 const browser=await chromium.launch(launch);try{
  if(server)for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3220')).ok)break;}catch{}if(i===59)throw Error('Server unavailable');await new Promise(r=>setTimeout(r,500));}
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{localStorage.setItem('papertrade-orders',JSON.stringify(seed.orders));localStorage.setItem('papertrade-perpetual-wallet-v1:guest',JSON.stringify(seed.globalAccount));},{orders,globalAccount});
  await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('**/api/**',r=>r.fulfill({json:{ok:true,quotes:{},candles:[],underlyings:[],instruments:[]}}));
  await page.goto(process.env.PNL_APP_URL||'http://127.0.0.1:3220');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const original=await page.evaluate(()=>localStorage.getItem('papertrade-orders'));
  const globalOriginal=await page.evaluate(()=>localStorage.getItem('papertrade-perpetual-wallet-v1:guest'));
  await page.getByRole('button',{name:'P&L',exact:true}).last().click();await page.getByTestId('pnl-count').waitFor();assert.equal(await page.getByTestId('pnl-count').textContent(),'15');assert.equal(await page.getByTestId('pnl-net').textContent(),`₹${(net+118*85).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
  assert.equal(await page.locator('.pnl-trade-list').isVisible(),false);
  const chart=page.getByRole('img',{name:/Cumulative realised/});await chart.focus();await page.keyboard.press('ArrowLeft');const readout=await page.locator('.pnl-chart-readout').first().textContent();await page.waitForTimeout(2200);assert.equal(await page.locator('.pnl-chart-readout').first().textContent(),readout,'clock updates must not reset inspected point');
  await page.locator('.pnl-chart-readout button').first().click();assert.equal(await page.locator('.pnl-trade-row').count(),1);await page.locator('.pnl-trade-row').click();await page.locator('.trade-review-dialog').waitFor();await page.getByLabel('Close trade review').click();
  await page.getByRole('button',{name:'Clear chart selection'}).click();assert.equal(await page.locator('.pnl-trade-row').count(),15);
  await page.getByRole('button',{name:'P&L product',exact:true}).click();await page.getByRole('option',{name:/^Intraday/}).click();assert.equal(await page.locator('.pnl-trade-row').count(),8);await page.getByRole('tab',{name:'Overview',exact:true}).click();assert.equal(await page.getByTestId('pnl-count').textContent(),'8');
  await page.getByRole('button',{name:'P&L product',exact:true}).click();await page.getByRole('option',{name:'All products',exact:true}).click();await page.getByLabel('Calendar month').fill('2026-09');await page.getByRole('button',{name:/2026-09-05:/}).click();assert.equal(await page.getByTestId('pnl-count').textContent(),'2');await page.locator('.pnl-day-detail button').click();assert.equal(await page.locator('.pnl-trade-row').count(),2);
  const globalRow=page.locator('.pnl-trade-row').filter({hasText:'BTCUSD'});assert.match(await globalRow.textContent(),/Global · USD/);assert.match(await globalRow.textContent(),/\$118.00/);assert.ok(!(await globalRow.textContent()).includes('₹'));
  await globalRow.click();await page.locator('.trade-review-dialog').waitFor();assert.match(await page.locator('.pnl-review-executions').textContent(),/\$7.00/);await page.getByLabel('Close trade review').click();await page.getByRole('button',{name:'Clear selected day'}).click();assert.equal(await page.locator('.pnl-trade-row').count(),15);
  await page.locator('.pnl-trade-row').filter({hasText:'RELIANCE'}).first().focus();await page.keyboard.press('Shift+Space');await page.getByRole('button',{name:'Select Indian trades',exact:true}).click();assert.match(await page.locator('.pnl-selection-toolbar').textContent(),/14 selected/);assert.equal(await globalRow.getAttribute('aria-disabled'),null);await globalRow.click();assert.match(await page.locator('.pnl-selection-toolbar').textContent(),/1 selected/);await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:'Home',exact:true}).last().click();await page.getByRole('button',{name:'More options',exact:true}).click();await page.getByRole('button',{name:'Coach',exact:true}).click();await page.getByRole('tab',{name:'insights',exact:true}).click();await page.getByRole('button',{name:'Open P&L insights'}).click();await page.getByRole('heading',{name:'How the rupees add up'}).waitFor();assert.equal(await page.getByRole('tab',{name:'Insights',exact:true}).getAttribute('aria-selected'),'true');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});const bounds=await page.locator('.pnl-analytics').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(await page.locator('.pnl-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.locator('.pnl-modal').evaluate(e=>e.scrollTop=0);if(process.env.PNL_SCREENSHOTS)await page.screenshot({path:'outputs/pnl-dashboard-overview.png'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-orders')),original,'analytics must never alter ledger');assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-perpetual-wallet-v1:guest')),globalOriginal,'review must not alter the Global ledger');assert.deepEqual(errors,[]);
  console.log('Dashboard P&L: actual-ledger totals, persistent chart inspection, scoped trades/review, clearing day drill, Coach handoff, four widths and unchanged order storage pass');
 }finally{await browser.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
