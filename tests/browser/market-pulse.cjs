/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness uses externally installed packages. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const start = Date.parse('2026-10-06T03:45:00Z'), end = Date.parse('2026-10-06T10:05:00Z');
  const tape = Array.from({length:40}, (_,i)=>({t:start+(end-start)*i/39,advance:Math.round(900+1341*i/39),decline:Math.round(350+677*i/39)}));
  let pulse = {ok:true,breadth:{advance:2241,decline:1027},tape,vix:{price:13.6,change:-1.18,changePercent:-7.98},vixCheckedAt:end,flows:[],pcr:{putOi:240000000,callOi:170000000,value:24/17,expiry:'2026-10-06',asOf:new Date(end).toISOString()},sessionLive:false};
  const bundle = await esbuild.build({entryPoints:['tests/browser/market-pulse.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const css = [...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const server = http.createServer((req,res)=> {
    if(req.url.startsWith('/api/')) {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(pulse));}
    res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');
    res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const launch={headless:true};
    if(process.env.CHROMIUM_PACKAGE) {const pkg=require(process.env.CHROMIUM_PACKAGE), c=pkg.default||pkg;launch.executablePath=await c.executablePath();launch.args=c.args;}
    browser=await chromium.launch(launch);
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date(end)});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const chart=page.locator('.india-ad-chart');await chart.waitFor();
    assert.equal(await page.locator('.india-vix-value strong').textContent(),'13.60');
    assert.equal(await page.locator('.india-pcr-main strong').textContent(),'1.41');
    assert.equal(await page.locator('.india-gauge-oi-value.put').textContent(),'24Cr');
    assert.equal(await page.locator('.india-gauge-oi-value.call').textContent(),'17Cr');
    assert.equal(await page.locator('.india-gauge-arc').count(),6);
    assert.equal(await page.locator('.india-gauge-needle').count(),2);
    assert.deepEqual(await page.locator('.india-breadth-end.up tspan').allTextContents(), ['2,241', '(69%)']);
    assert.deepEqual(await page.locator('.india-breadth-end.down tspan').allTextContents(), ['1,027', '(31%)']);
    assert.ok(await page.locator('.india-breadth-end').evaluateAll(labels => labels.every(label => { const [count, percentage] = label.children; return percentage.getBBox().y > count.getBBox().y; })), 'Bracketed percentages sit below counts');
    assert.match(await page.locator('.india-breadth-head small').textContent(),/NSE · 6 Oct · 15:35 IST/);
    for(const theme of ['light','neon']) {
      if(theme==='neon') await page.getByRole('button',{name:'Theme',exact:true}).click();
      for(const width of [320,375,390,768,1280]) {
        await page.setViewportSize({width,height:844});
        await page.waitForFunction(()=>Math.abs(document.querySelector('.india-ad-chart').getBoundingClientRect().width-Number(document.querySelector('.india-ad-chart').getAttribute('viewBox').split(' ')[2]))<1);
        const columns=await page.locator('.india-gauge-panel > div').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
        assert.equal(columns[0].y,columns[1].y);assert.equal(columns[0].height,columns[1].height);
        assert.ok(columns[1].x>columns[0].x);assert.ok(Math.abs(columns[0].width-columns[1].width)<1);
        assert.ok(await page.locator('.home-dashboard-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${theme} fits ${width}px`);
        assert.ok(await chart.locator('text').evaluateAll(els=>els.every(el=>{const b=el.getBBox(),v=el.ownerSVGElement.viewBox.baseVal;return b.x>=-1&&b.x+b.width<=v.width+1;})),`chart labels fit ${width}px`);
        const gaugeText=await page.locator('.india-market-gauge text').evaluateAll(els=>els.map(el=>({text:el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
        assert.ok(gaugeText.every(t=>t.height>=7),`readable gauge labels ${width}px: ${JSON.stringify(gaugeText)}`);
        if(width===390&&process.env.MARKET_PULSE_SCREENSHOT) await page.screenshot({path:process.env.MARKET_PULSE_SCREENSHOT.replace('.png',`-${theme}.png`)});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Expand market pulse',exact:true}).click();
    assert.equal(await chart.evaluate(el=>el.getBoundingClientRect().height),300);
    assert.equal(await chart.getAttribute('viewBox').then(v=>Number(v.split(' ')[3])),300);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Expand market pulse',exact:true}).getAttribute('aria-expanded'),'false');
    await page.getByLabel('What is put/call ratio?',{exact:true}).click();
    const info=page.locator('.india-pcr details p');await info.waitFor();
    assert.match(await info.textContent(),/total put open interest ÷ total call open interest/);
    const popup=await info.boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=390);
    await page.keyboard.press('Escape');assert.equal(await info.count(),0);
    // The existing 30-second refresh updates actual values without remounting.
    pulse={...pulse,vix:{...pulse.vix,price:23},tape:[{t:end,advance:1000,decline:1000}]};
    await page.clock.fastForward(31000);
    await page.waitForFunction(()=>document.querySelector('.india-vix-value strong').textContent==='23.00');
    assert.equal(await page.locator('.india-vix-status').textContent(),'Elevated');
    assert.equal(await chart.locator('path.up').getAttribute('d').then(d=>d.includes('L')),false,'One sample never fabricates a line');
    assert.ok(await chart.locator('.india-breadth-end').evaluateAll(els=>Math.abs(Number(els[0].getAttribute('y'))-Number(els[1].getAttribute('y')))>=22),'Equal-count endpoint labels do not overlap');
    pulse={...pulse,vix:null,pcr:null,tape:[],breadth:null};await page.clock.fastForward(31000);
    await page.locator('.india-pulse-wait').waitFor();
    assert.equal(await page.locator('.india-gauge-needle').count(),0);
    assert.equal(await page.locator('.india-vix-status').count(),0);
    assert.equal(await page.locator('.india-vix-value strong').textContent(),'—');
    assert.equal(await page.locator('.india-pcr-main strong').textContent(),'—');
    assert.deepEqual(errors,[]);
    console.log('PASS: side-by-side live gauges and breadth endpoint labels at 320–1280px in both themes; expansion, popups, 30-second refresh, sparse and unavailable data.');
  } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
