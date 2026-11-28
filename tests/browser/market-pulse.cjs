/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness uses externally installed packages. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const start = Date.parse('2026-10-06T03:45:00Z'), end = Date.parse('2026-10-06T10:05:00Z');
  const tape = Array.from({length:381}, (_,i)=>({t:start+(end-start)*i/380,advance:Math.round(900+1341*i/380),decline:Math.round(350+677*i/380)}));
  let pulse = {ok:true,breadth:{advance:1914,decline:1392},breadthCheckedAt:end,tape:[],vix:{price:13.6,change:-1.18,changePercent:-7.98},vixCheckedAt:end,flows:[],pcr:{putOi:240000000,callOi:170000000,value:24/17,expiry:'2026-10-06',asOf:new Date(end).toISOString()},sessionLive:false};
  const bundle = await esbuild.build({entryPoints:['tests/browser/market-pulse.fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"production"'}});
  const css = [...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([,f])=>fs.readFileSync('app/'+f,'utf8')).join('\n').replace(/@import[^;]+;/g,'');
  const server = http.createServer((req,res)=> {
    if(req.url.startsWith('/api/')) {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(pulse));}
    res.setHeader('Content-Type',req.url==='/qa.js'?'application/javascript':'text/html');
    res.end(req.url==='/qa.js'?bundle.outputFiles[0].text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const launch={headless:true,executablePath:process.env.CHROME_PATH};
    if(process.env.CHROMIUM_PACKAGE) {const pkg=require(process.env.CHROMIUM_PACKAGE), c=pkg.default||pkg;launch.executablePath=await c.executablePath();launch.args=c.args.filter(arg=>arg!=='--single-process');}
    browser=await chromium.launch(launch);
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:new Date(end)});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const chart = page.locator('.india-ad-chart');
    const card = page.getByRole('region', {name:'Indian market pulse'});
    const ratio = card.locator('.india-breadth-ratio strong');
    const trend = card.getByRole('button', {name:'Intraday'});
    const waitForRatio = text => page.waitForFunction(value => document.querySelector('.india-breadth-ratio strong')?.textContent === value, text);
    await waitForRatio('1.38 : 1');
    assert.deepEqual(await card.locator('.india-breadth-counts b').allTextContents(), ['1,914 57.9%', '1,392 42.1%']);
    assert.ok(await card.locator('.india-breadth-share-bar').evaluate(bar => {
      const advance = bar.querySelector('.up');
      return Math.abs(advance.getBoundingClientRect().width / bar.getBoundingClientRect().width - 1914 / (1914 + 1392)) < .002;
    }));
    assert.equal(await trend.count(), 0, 'Snapshot stays usable without history');

    pulse = {...pulse, tape};
    await page.clock.fastForward(11000);
    await trend.click();
    assert.equal(await trend.getAttribute('aria-expanded'), 'true');
    assert.equal(await chart.locator('path.up').getAttribute('d').then(d => d.includes('L')), true);
    assert.match(await chart.getAttribute('aria-label'), /2,241 advances and 1,027 declines/);
    assert.equal(await ratio.textContent(), '1.38 : 1', 'Intraday history does not replace the newer snapshot');
    assert.equal(await page.locator('.india-vix-value strong').textContent(), '13.60');
    assert.equal(await page.locator('.india-pcr-main strong').textContent(), '1.41');

    for (const theme of ['light','neon']) {
      if (theme === 'neon') await page.getByRole('button', {name:'Theme', exact:true}).click();
      for (const width of [320,375,390,768,1280]) {
        await page.setViewportSize({width,height:844});
        await page.waitForFunction(() => {
          const svg = document.querySelector('.india-ad-chart');
          return Math.abs(svg.getBoundingClientRect().width - svg.viewBox.baseVal.width) < 1;
        });
        assert.ok(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `Market Pulse fits ${width}px`);
        assert.ok(await chart.locator('text').evaluateAll(labels => labels.every(label => {
          const bounds = label.getBBox(), view = label.ownerSVGElement.viewBox.baseVal;
          return bounds.x >= -1 && bounds.x + bounds.width <= view.width + 1;
        })), `Chart labels fit ${width}px`);
        if (width === 390 && process.env.MARKET_PULSE_SCREENSHOT) await card.screenshot({path:process.env.MARKET_PULSE_SCREENSHOT.replace('.png', `-${theme}.png`)});
      }
    }
    await page.keyboard.press('Escape');
    assert.equal(await trend.getAttribute('aria-expanded'), 'false');
    assert.equal(await chart.count(), 0);

    pulse = {...pulse, breadth:{advance:2000,decline:0}, breadthCheckedAt:end+60000, tape:[]};
    await page.clock.fastForward(11000);
    await waitForRatio('∞');
    assert.deepEqual(await card.locator('.india-breadth-counts b').allTextContents(), ['2,000 100.0%', '0 0.0%']);
    await trend.click();
    assert.match(await chart.getAttribute('aria-label'), /2,241 advances and 1,027 declines/, 'Shorter responses preserve verified history');

    pulse = {...pulse, breadth:{advance:1000,decline:1000}, breadthCheckedAt:end+120000};
    await page.clock.fastForward(11000);
    await waitForRatio('1.00 : 1');
    assert.deepEqual(await card.locator('.india-breadth-counts b').allTextContents(), ['1,000 50.0%', '1,000 50.0%']);

    pulse = {...pulse, breadth:null, breadthCheckedAt:null, tape:[]};
    await page.clock.fastForward(11000);
    await card.getByRole('button', {name:'Retry market pulse'}).waitFor();
    assert.equal(await ratio.textContent(), '1.00 : 1', 'Failed fetch preserves the verified snapshot');
    const tomorrow = start + 24 * 3600000;
    await page.clock.setSystemTime(tomorrow + 60000);
    pulse = {...pulse, sessionLive:true};
    await card.getByRole('button', {name:'Retry market pulse'}).click();
    await card.getByText('No breadth data', {exact:true}).waitFor();
    assert.equal(await trend.count(), 0, 'A new session clears the prior snapshot and tape while new data is unavailable');
    assert.deepEqual(errors,[]);
    console.log('PASS: accurate breadth counts, ratios and bar geometry, optional measured history, refresh and session rollover at 320–1280px in both themes.');
  } finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
