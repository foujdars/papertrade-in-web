/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const {readGlobalAccount}=await import('../../lib/global-order-engine.ts');
 const at=Date.now()-86400000;
 const account={...readGlobalAccount(null),events:Array.from({length:4},(_,i)=>[
  {id:`open-${i}`,symbol:'BTCUSD',kind:'OPEN',at:at+i*10000,contracts:1,price:100,pnl:0,fee:1,detail:'Long'},
  {id:`close-${i}`,symbol:'BTCUSD',kind:'CLOSE',at:at+i*10000+5000,contracts:1,price:110,pnl:10,fee:1,detail:'Close'}
 ]).flat()};
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(account=>{if(!localStorage.getItem('papertrade-perpetual-wallet-v1:guest'))localStorage.setItem('papertrade-perpetual-wallet-v1:guest',JSON.stringify(account));},account);
  await page.route('**/api/**',r=>r.fulfill({json:{ok:true,quotes:{},candles:[],instruments:[],underlyings:[]}}));
  await page.goto(process.env.PNL_APP_URL||'http://127.0.0.1:4317');
  await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});
  const open=async()=>{
   await page.getByRole('button',{name:'P&L',exact:true}).last().click();
   await page.getByRole('button',{name:'P&L market',exact:true}).click();
   await page.getByRole('option',{name:/^Global/}).click();
   await page.getByRole('tab',{name:'Trades',exact:true}).click();
  };
  await open();
  const rows=page.locator('.pnl-trade-row');await rows.first().waitFor();assert.equal(await rows.count(),4);
  await rows.first().focus();await page.keyboard.press('Shift+Space');
  await rows.nth(1).click();
  await page.getByRole('button',{name:'Delete (2)',exact:true}).click();
  assert.match(await page.locator('.trade-delete-note').textContent(),/Wallet balance, open positions and bot limits will not change/);
  await page.getByRole('button',{name:'Keep trades',exact:true}).click();assert.equal(await rows.count(),4);
  await page.getByRole('button',{name:'Delete (2)',exact:true}).click();
  await page.getByRole('button',{name:'Delete 2 trades',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('papertrade-perpetual-wallet-v1:guest')).deletedGlobalPnlTradeIds?.length===2);
  assert.equal(await rows.count(),2);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-perpetual-wallet-v1:guest')));
  assert.equal(saved.wallet,account.wallet);assert.deepEqual(saved.events,account.events);
  await page.reload();await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});await open();assert.equal(await rows.count(),2);
  await rows.first().click();await page.getByRole('button',{name:'Select multiple',exact:true}).click();
  await page.getByRole('button',{name:'Select Global trades',exact:true}).click();
  await page.getByRole('button',{name:'Delete (2)',exact:true}).click();await page.getByRole('button',{name:'Delete 2 trades',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('papertrade-perpetual-wallet-v1:guest')).deletedGlobalPnlTradeIds?.length===4);
  assert.equal(await rows.count(),0);await page.close();
 }console.log('PASS: Global P&L multi-selection, cancellation, bulk deletion, reload persistence and wallet preservation on mobile/desktop');}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
