/* eslint-disable @typescript-eslint/no-require-imports */
// Real notification panel: switches, persistence, cross-tab changes and IPO context.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  let launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const browserPackage = require(process.env.CHROMIUM_PACKAGE), packaged = browserPackage.default || browserPackage;
    launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
  }
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({ viewport: { width:390,height:844 } });
    const page = await context.newPage(); const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*.supabase.co/**',r=>r.abort());
    await context.route('**/api/**',r=>r.fulfill({json:{ok:true,enabled:false,quotes:{},candles:[],ipos:[],allotments:[],underlyings:[],instruments:[]}}));
    for(let attempt=0;;attempt++){
      try{await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3234');break;}
      catch(e){if(attempt>=59)throw e;await page.waitForTimeout(1000);}
    }
    await page.locator('.mobile-bottom-nav').waitFor({timeout:60000});
    const open=async()=>{await page.locator('.notification-center-trigger').click();await page.getByRole('switch',{name:'EMA 21 alerts',exact:true}).waitFor();};
    await open();
    const ema21=page.getByRole('switch',{name:'EMA 21 alerts',exact:true}),ema5=page.getByRole('switch',{name:'EMA 5 alerts',exact:true});
    assert.equal(await ema21.isChecked(),true);assert.equal(await ema5.isChecked(),true);
    await ema21.uncheck();assert.equal(await ema5.isChecked(),true);
    await page.getByRole('status').filter({hasText:'Saved on this device.'}).waitFor();
    let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-notification-preferences-v4')));
    assert.equal(stored.ema21,false);assert.equal(stored.ema5,true);
    await page.reload();await page.locator('.mobile-bottom-nav').waitFor();await open();
    assert.equal(await ema21.isChecked(),false);assert.equal(await ema5.isChecked(),true);
    await ema5.uncheck();await ema21.check();
    stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('papertrade-notification-preferences-v4')));
    assert.equal(stored.ema21,true);assert.equal(stored.ema5,false);
    const other=await context.newPage();await other.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3234');
    await other.evaluate(()=>{const key='papertrade-notification-preferences-v4';const p=JSON.parse(localStorage.getItem(key));localStorage.setItem(key,JSON.stringify({...p,ema21:false,ema5:true}));});
    await page.waitForFunction(()=>{const inputs=[...document.querySelectorAll('.notification-settings input')];return inputs.length===2&&!inputs[0].checked&&inputs[1].checked;});
    await other.close();
    await page.evaluate(()=>{
      localStorage.setItem('papertrade-notification-center-v1',JSON.stringify([{id:'ipo-listing-example',kind:'ipo',title:'Example listed today',body:'Example Limited: listed 14 Sept 2026 at ₹120; issue price ₹100 (+20%). Open IPOs for listing details.',createdAt:Date.now(),read:false}]));
      window.dispatchEvent(new Event('papertrade:notification-center-change'));
    });
    await page.getByText('IPO: Example listed today',{exact:true}).waitFor();
    assert.match(await page.locator('.notification-center-panel').innerText(),/Example Limited: listed 14 Sept 2026 at ₹120; issue price ₹100/);
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.locator('.notification-center-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Panel fits ${width}px`);
    }
    if(process.env.NOTIFICATION_SCREENSHOT)await page.screenshot({path:process.env.NOTIFICATION_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Notification browser checks pass: default switches, independent controls, persistence, cross-tab changes, IPO prefix/context and four viewport widths.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
