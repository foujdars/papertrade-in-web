// Run against `npx next dev -p 3220`. Only isolated browser storage and mocked feeds are used.
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
 const browser=await chromium.launch({headless:true});try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{localStorage.setItem('papertrade-orders',JSON.stringify(seed));},orders);
  await page.route('**/*.supabase.co/**',r=>r.abort());await page.route('**/api/**',r=>r.fulfill({json:{ok:true,quotes:{},candles:[],underlyings:[],instruments:[]}}));
  await page.goto(process.env.PNL_APP_URL||'http://localhost:3220');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const original=await page.evaluate(()=>localStorage.getItem('papertrade-orders'));
  await page.getByRole('button',{name:'P&L',exact:true}).last().click();await page.getByTestId('pnl-count').waitFor();assert.equal(await page.getByTestId('pnl-count').textContent(),'14');assert.equal(await page.getByTestId('pnl-net').textContent(),`₹${net.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
  assert.equal(await page.locator('.pnl-trade-list').isVisible(),false);
  const chart=page.getByRole('img',{name:/Cumulative realised/});await chart.focus();await page.keyboard.press('ArrowLeft');const readout=await page.locator('.pnl-chart-readout').first().textContent();await page.waitForTimeout(2200);assert.equal(await page.locator('.pnl-chart-readout').first().textContent(),readout,'clock updates must not reset inspected point');
  await page.locator('.pnl-chart-readout button').first().click();assert.equal(await page.locator('.pnl-trade-row').count(),1);await page.locator('.pnl-trade-row').click();await page.locator('.trade-review-dialog').waitFor();await page.getByLabel('Close trade review').click();
  await page.getByRole('button',{name:'Clear chart selection'}).click();assert.equal(await page.locator('.pnl-trade-row').count(),14);
  await page.getByRole('button',{name:'P&L product',exact:true}).click();await page.getByRole('option',{name:/^Intraday/}).click();assert.equal(await page.locator('.pnl-trade-row').count(),7);await page.getByRole('tab',{name:'Overview',exact:true}).click();assert.equal(await page.getByTestId('pnl-count').textContent(),'7');
  await page.getByRole('button',{name:'Reset filters'}).click();await page.getByRole('button',{name:/2026-09-05:/}).click();assert.equal(await page.getByTestId('pnl-count').textContent(),'1');await page.locator('.pnl-day-detail button').click();assert.equal(await page.locator('.pnl-trade-row').count(),1);await page.getByRole('button',{name:'Clear selected day'}).click();assert.equal(await page.locator('.pnl-trade-row').count(),14);
  await page.getByRole('button',{name:'Home',exact:true}).last().click();await page.getByRole('button',{name:'Open trading coach'}).click();await page.getByRole('tab',{name:'insights',exact:true}).click();await page.getByRole('button',{name:'Open P&L insights'}).click();await page.getByRole('heading',{name:'Profit-to-net waterfall'}).waitFor();assert.equal(await page.getByRole('tab',{name:'Insights',exact:true}).getAttribute('aria-selected'),'true');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:844});const bounds=await page.locator('.pnl-analytics').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(await page.locator('.pnl-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
  await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'Overview',exact:true}).click();await page.locator('.pnl-modal').evaluate(e=>e.scrollTop=0);if(process.env.PNL_SCREENSHOTS)await page.screenshot({path:'outputs/pnl-dashboard-overview.png'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('papertrade-orders')),original,'analytics must never alter ledger');assert.deepEqual(errors,[]);
  console.log('Dashboard P&L: actual-ledger totals, persistent chart inspection, scoped trades/review, clearing day drill, Coach handoff, four widths and unchanged order storage pass');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
