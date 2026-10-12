/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const now = Date.parse('2026-10-12T05:00:00Z');
  const start = Date.parse('2026-10-12T03:45:00Z');
  let advances = 2241, failBreadth = false;
  const calls = [];
  const pulse = () => ({ok:true,sessionLive:true,breadth:{advance:advances,decline:1027},tape:Array.from({length:20},(_,i)=>({t:start+(now-start)*i/19,advance:Math.round(900+(advances-900)*i/19),decline:350+Math.round(677*i/19)})),vix:{price:13.6,change:-1.18,changePercent:-7.98},vixCheckedAt:now,flows:Array.from({length:20},(_,i)=>({date:`2026-09-${30-i}`,label:`Day ${30-i}`,fii:-1200-i*20,dii:1300+i*10,nifty:null,niftyChange:null})),pcr:null});
  const side = oi => ({marketData:{oi,prevOi:oi-10}});
  const assets = new Map();
  for (const [id, root] of [['current',process.cwd()],...(process.env.HOME_COMPARISON_ROOT ? [['base',process.env.HOME_COMPARISON_ROOT]] : [])]) {
    const built = await esbuild.build({absWorkingDir:root,entryPoints:['tests/browser/home-market.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
    const css = [...fs.readFileSync(path.join(root,'app/layout.tsx'),'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync(path.join(root,'app',f),'utf8')).join('\n').replace(/@import[^;]+;/g,'');
    assets.set(id, {js:built.outputFiles[0].text,css});
  }
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://test');
    if (url.pathname.startsWith('/api/')) {
      calls.push(req.url); res.setHeader('Content-Type','application/json');
      let body = {ok:false};
      if (url.pathname==='/api/market/india-pulse') { body = pulse(); if (failBreadth && url.searchParams.get('part')==='breadth') {res.statusCode=503;body={ok:false};} }
      if (url.pathname==='/api/market/sector-heat') body={ok:true,sectors:['Bank','PSU Bank','IT','Auto','Pharma','FMCG','Metal','Energy','Realty','Infra','Media','PSE','Consumption','Commodities','Services','MNC'].map((label,i)=>({id:String(i),label,change:i%2?-.58:1.2,watch:'NIFTY 50'}))};
      if (url.pathname==='/api/upstox/fno-underlyings') body={ok:true,underlyings:[{symbol:'NIFTY',name:'Nifty 50',instrumentKey:'NSE_INDEX|Nifty 50',optionContracts:100,futures:[{instrumentKey:'NSE_FO|123',tradingSymbol:'NIFTY 27 OCT FUT',expiry:'2026-10-27'}]}]};
      if (url.pathname==='/api/market/gift-nifty') body={ok:true,gift:{price:22520.5,asOf:new Date(now).toISOString()},futureClose:{price:22618.4,date:'2026-10-09'}};
      if (url.pathname==='/api/upstox/option-chain') body={ok:true,expiries:['2026-10-27'],fetchedAt:new Date(now).toISOString(),rows:Array.from({length:9},(_,i)=>({strikePrice:22200+i*100,underlyingSpotPrice:22600,call:side(100+i*20),put:side(260-i*15)}))};
      if (url.pathname==='/api/market/deals') body={ok:true,date:'2026-10-09',rows:[]};
      return res.end(JSON.stringify(body));
    }
    const id = url.searchParams.get('version') || 'current', asset = assets.get(id);
    res.setHeader('Content-Type',url.pathname==='/qa.js'?'application/javascript':'text/html');
    res.end(url.pathname==='/qa.js'?asset.js:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${asset.css}</style><div id="root"></div><script src="/qa.js?version=${id}"></script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const launch={headless:true};
  if(process.env.CHROMIUM_PACKAGE){const p=await import(process.env.CHROMIUM_PACKAGE),c=p.default;launch.executablePath=await c.executablePath();launch.args=c.args.filter(a=>a!=='--single-process');}
  let browser;
  try {
    browser=await chromium.launch(launch);
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date(now)});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.home-oi-chart-scroll svg').waitFor(); await page.locator('.india-ad-chart').waitFor();
    assert.ok(calls.includes('/api/market/india-pulse?part=breadth'));
    assert.ok(calls.includes('/api/market/india-pulse?part=vix'));
    assert.ok(calls.includes('/api/market/india-pulse?part=flows'));
    assert.ok(!calls.includes('/api/market/india-pulse'), 'Home panels only request their own data');
    advances=2400;await page.clock.fastForward(10_100);
    await page.waitForFunction(()=>document.querySelector('.india-breadth-end.up').textContent.includes('2,400'));
    failBreadth=true;await page.clock.fastForward(10_100);
    await page.waitForFunction(()=>document.querySelector('.india-breadth-head small').textContent.includes('Delayed'));
    assert.ok((await page.locator('.india-breadth-end.up').textContent()).includes('2,400'),'Failed refresh preserves last verified chart');
    failBreadth=false;advances=2500;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.waitForFunction(()=>document.querySelector('.india-breadth-end.up').textContent.includes('2,500'));
    const heights={};fs.mkdirSync('outputs',{recursive:true});
    for(const theme of ['light','neon']) {
      await page.locator('.terminal-shell').evaluate((el,theme)=>el.dataset.theme=theme,theme);
      for(const width of [320,390,768,1280]) {
        await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
        assert.ok(await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${theme} ${width}px does not overflow`);
        assert.ok(await page.locator('.home-derivative-metrics > div').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),`${theme} ${width}px complete metric values fit`);
        assert.ok(await page.locator('.india-ad-chart text').evaluateAll(es=>es.every(e=>{const b=e.getBBox(),v=e.ownerSVGElement.viewBox.baseVal;return b.x>=-1&&b.x+b.width<=v.width+1;})),'Breadth labels fit');
        assert.ok(await page.locator('.home-heat button').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)),'Heat cells retain touch height');
        assert.equal(await page.locator('.home-heat button').count(),16);
        const dims=await page.locator('.home-market-data').evaluate(e=>{const a=e.querySelector('.india-pulse-layout').getBoundingClientRect(),b=e.querySelector('.home-derivatives').getBoundingClientRect();return {a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};});
        if(width>=900)assert.ok(dims.b.x>dims.a.x&&Math.abs(dims.b.y-dims.a.y)<1,'Wide screens use side-by-side data panels');
        else assert.ok(dims.b.y>dims.a.y,'Phone reading order stays pulse then derivatives');
        heights[`${theme}-${width}`]=await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollHeight);
        if(width===390){await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`outputs/home-compact-${theme}.png`});await page.locator('.home-market-data').screenshot({path:`outputs/home-data-${theme}.png`});}
      }
    }
    if(assets.has('base')) {
      for(const width of [390,1280]) {
        await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:${server.address().port}/?version=base`);
        await page.locator('.home-oi-chart-scroll svg').waitFor();await page.locator('.home-heat button').first().waitFor();await page.waitForTimeout(150);
        const before=await page.locator('.home-dashboard-scroll').evaluate(e=>e.scrollHeight), after=heights[`light-${width}`];
        assert.ok(after<before,`${width}px Home saves vertical space: ${before} → ${after}`);
        console.log(`Home ${width}px total scroll height: ${before} → ${after} (${Math.round((before-after)/before*100)}% less)`);
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: independent Home requests, 10-second breadth refresh, failure retention/reconnect, complete compact layouts in both themes at 320–1280px.');
  } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
