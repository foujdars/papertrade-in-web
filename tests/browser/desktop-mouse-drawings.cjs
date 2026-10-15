/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict'), esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/indicator-studio.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'feed', setup(b) { b.onResolve({ filter: /upstox-live-feed$/ }, () => ({ path: 'feed', namespace: 'qa' })); b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({ contents: 'export async function openUpstoxLiveFeed(){return ()=>{}}', loader: 'js' })); } }] });
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, f]) => fs.readFileSync('app/' + f, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
  const start = Date.parse('2026-09-18T09:15:00+05:30') / 1000;
  const candles = Array.from({ length: 330 }, (_, i) => ({ time: start + i * 300, open: 100 + i * .03, high: 103 + i * .03, low: 98 + i * .03, close: 101 + i * .03, volume: 1000 }));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, candles, quotes: {}, segments: ['historical'] })); }
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<style>${css}.price-chart-wrap,.price-chart,.chart-stack{height:100%!important}</style><div id="root"></div><script src="/qa.js"></script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.qaCandles?.data().length > 300 && document.querySelector('[data-pointer-listeners="active"]'));
    const host = page.locator('[data-pointer-listeners="active"]');
    const box = await host.boundingBox();
    for (const tool of ['horizontal-line', 'trend-line', 'rectangle']) {
      await page.evaluate(tool => window.qaTool(tool), tool);
      await page.waitForTimeout(100);
      const first = { x: box.width * .45, y: box.height * .35 }, second = { x: box.width * .7, y: box.height * .6 };
      await page.mouse.move(box.x + first.x, box.y + first.y);
      await page.waitForTimeout(80);
      const aim = await page.locator('.drawing-crosshair').evaluate(el => ({ hidden: el.hidden, x: parseFloat(el.style.getPropertyValue('--aim-x')), y: parseFloat(el.style.getPropertyValue('--aim-y')) }));
      assert.equal(aim.hidden, false);
      assert.ok(Math.abs(aim.x - first.x) < 40 && Math.abs(aim.y - first.y) < 5, `${tool}: crosshair follows mouse rather than retained corner aim`);
      const before = await page.evaluate(() => window.qaManager.getAllDrawings().length);
      await page.mouse.click(box.x + first.x, box.y + first.y);
      if (tool !== 'horizontal-line') await page.mouse.click(box.x + second.x, box.y + second.y);
      await page.waitForFunction(n => window.qaManager.getAllDrawings().length === n + 1, before);
      const anchor = await page.evaluate(() => { const drawing = window.qaManager.getAllDrawings().at(-1), a = drawing.anchors[0]; return { x: window.qaChart.timeScale().timeToCoordinate(a.time), y: window.qaCandles.priceToCoordinate(a.price) }; });
      assert.ok(Math.abs(anchor.x - first.x) < 40 && Math.abs(anchor.y - first.y) < 5, `${tool}: first anchor matches click`);
    }
    console.log('PASS: desktop mouse hover and click anchors for line, trend line and rectangle');
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.goto(`http://127.0.0.1:${server.address().port}`);
    await phone.waitForFunction(() => window.qaCandles?.data().length > 300 && document.querySelector('[data-pointer-listeners="active"]'));
    await phone.evaluate(() => window.qaTool('horizontal-line'));
    await phone.waitForFunction(() => !document.querySelector('.drawing-crosshair').hidden);
    const retained = await phone.locator('.drawing-crosshair').evaluate(el => ({ x: parseFloat(el.style.getPropertyValue('--aim-x')), y: parseFloat(el.style.getPropertyValue('--aim-y')) }));
    const phoneBox = await phone.locator('[data-pointer-listeners="active"]').boundingBox();
    await phone.touchscreen.tap(phoneBox.x + 50, phoneBox.y + 100);
    await phone.waitForFunction(() => window.qaManager.getAllDrawings().length === 1);
    const touchAnchor = await phone.evaluate(() => { const a = window.qaManager.getAllDrawings()[0].anchors[0]; return { x: window.qaChart.timeScale().timeToCoordinate(a.time), y: window.qaCandles.priceToCoordinate(a.price) }; });
    assert.ok(Math.abs(touchAnchor.x - retained.x) < 1 && Math.abs(touchAnchor.y - retained.y) < 1, 'Touch still confirms the retained crosshair, not the tap location');
    console.log('PASS: phone touch confirmation remains unchanged');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
