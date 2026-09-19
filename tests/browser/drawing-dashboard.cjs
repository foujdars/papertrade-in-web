const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/api/upstox/candles')?{ok:true,segments:['historical'],candles:Array.from({length:90},(_,i)=>({time:1789712700+i*300,open:100+Math.sin(i/5)*3,close:102+Math.sin(i/5)*3,high:108+Math.sin(i/5)*2,low:94+Math.sin(i/5)*2,volume:1000}))}:{ok:true,quotes:{},underlyings:[],instruments:[],candles:[]}}));
 await page.goto('http://localhost:3220');await page.locator('.launch-disclaimer').waitFor({state:'hidden',timeout:30000});
 await page.getByRole('button',{name:'Charts',exact:true}).last().click();await page.locator('.chart-tools-trigger').waitFor();
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
  const a=await page.locator('.chart-tools-trigger').boundingBox(),b=await page.locator('.chart-functions-trigger').boundingBox();
  assert.ok(a.x+a.width<=b.x+1&&Math.abs(a.y-b.y)<12,JSON.stringify({width,a,b}));
  assert.ok(b.x+b.width<=width);assert.equal(await page.locator('.drawing-toolbar').getByRole('button',{name:'Open drawing tools',exact:true}).count(),0);
 }
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await page.screenshot({path:'outputs/drawing-dashboard.png'});
 await page.locator('.chart-tools-trigger').click();const dialog=page.getByRole('dialog',{name:'Drawing tools',exact:true});await dialog.waitFor();
 await dialog.getByRole('button',{name:'Tools',exact:true}).click();assert.ok(await dialog.locator('.drawing-tile').count()>=88);
 assert.equal(await dialog.locator('.drawing-tile-select > svg').evaluateAll(items=>items.some(e=>!e.childElementCount)),false);
 await page.getByRole('button',{name:'Close drawing tools'}).click();
 const cdp=await page.context().newCDPSession(page);
 for(const name of ['Home','P&L','IPO','Watchlist']){
  await page.getByRole('button',{name,exact:true}).last().click();await page.waitForTimeout(200);
  await cdp.send('Input.synthesizePinchGesture',{x:190,y:400,scaleFactor:2,gestureSourceType:'touch'});
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>visualViewport.scale),1,`${name} must not page-zoom`);
 }
 assert.deepEqual(errors,[]);console.log('Dashboard: tools directly before Functions at four widths, 88 functional tool tiles, no page pinch-zoom on Home/P&L/IPO/Watchlist');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
