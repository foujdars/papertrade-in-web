const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/psbb.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = fs.readFileSync('app/chart-style.css', 'utf8');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} body{margin:0;--muted:#65708a}.terminal-shell{display:block}</style><div id="root"></div><script src="/qa.js"></script>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser:', error.stack); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('PSBB · D1 marked · Waiting for divergence', { exact: true }).waitFor();
    assert.equal(await page.locator('.chart-psbb-point').textContent(), 'D1');
    for (const timeframe of ['1m', '5m', '15m', '1H', '4H', '1D']) {
      for (const long of [false, true]) {
        await page.evaluate((view) => window.psbbView(view), { timeframe, long, count: 25 });
        await page.getByText(new RegExp(`^${timeframe} PSBB.*Waiting for new swing ${long ? 'high' : 'low'}$`)).waitFor();
        assert.equal(await page.locator('.chart-psbb-level.entry').count(), 0);
        await page.evaluate((view) => window.psbbView(view), { timeframe, long, count: 27 });
        await page.getByText(new RegExp(`^${timeframe} PSBB.*Case B.*Waiting for MSS close$`)).waitFor();
        assert.match(await page.locator('.chart-psbb text.entry').textContent(), /^Entry .*pending$/);
        assert.equal(await page.locator('.chart-psbb text.target').count(), 0);
        await page.evaluate((view) => window.psbbView(view), { timeframe, long, count: 29 });
        await page.getByText(new RegExp(`^${timeframe} PSBB.*Case B.*MSS confirmed$`)).waitFor();
        const levelNames = await page.locator('.chart-psbb text.chart-psbb-level').allTextContents();
        assert.equal(levelNames.length, 3);
        assert.match(levelNames[0], /^SL /); assert.match(levelNames[1], /^Entry /); assert.match(levelNames[2], /^Target 1R /);
        assert.ok(await page.locator('.chart-psbb line.entry').getAttribute('marker-end'));
        assert.equal(await page.locator('.chart-psbb line.entry').evaluate((node) => getComputedStyle(node).strokeDasharray), '2px, 4px');
        const geometry = await page.evaluate(() => {
          const { chart, series, analysis } = window.psbbQa, setup = analysis.setups.at(-1);
          const line = document.querySelector('.chart-psbb line.entry');
          const shift = chart.timeScale().options().timeVisible && window.psbbQa.candles[1].time - window.psbbQa.candles[0].time !== 86400 ? 19800 : 0;
          return { x: Number(line.getAttribute('x1')), y: Number(line.getAttribute('y1')), expectedX: chart.timeScale().timeToCoordinate(setup.mssTime + shift), expectedY: series.priceToCoordinate(setup.entry) };
        });
        assert.ok(Math.abs(geometry.y - geometry.expectedY) < 1, 'Entry line uses swing price');
        assert.ok(Math.abs(geometry.x - geometry.expectedX) < 1, 'Entry starts at actual MSS candle');
      }
    }
    assert.deepEqual(errors, []);
    if (process.env.PSBB_SCREENSHOT) await page.screenshot({ path: process.env.PSBB_SCREENSHOT });
    console.log('PSBB mobile chart: D1, pending MSS, dotted purple entry arrow, swing stop and 1R target align on all six intervals.');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
