/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness uses externally installed packages. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const { SECTORS } = await import('../../lib/sector-heat.ts');
  const changes = [.76, -.08, -.58, .47, 1.66, 1.40, .81, .88, -.27, 1.20, .46, .68, 1.20, .62, .59, 1.57];
  const sectors = SECTORS.map((s, i) => ({ ...s, watch: s.watch ?? null, chart: s.chart ?? null, price: 100, change: changes[i] }));
  const dates = ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-05'];
  const flows = dates.map((date, i) => ({ date, label: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date)), fii: i === 13 ? -4699 : -1100 - i, dii: i === 13 ? 5182 : 1400 + i, nifty: null, niftyChange: null })).reverse();
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/home-market.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, f]) => fs.readFileSync('app/' + f, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const body = req.url.startsWith('/api/market/sector-heat') ? { ok: true, sectors } : req.url.startsWith('/api/market/india-pulse') ? { ok: true, flows, breadth: null, tape: [], vix: null, pcr: null, sessionLive: false } : { ok: false };
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(body));
    }
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) { const pkg = require(process.env.CHROMIUM_PACKAGE), c = pkg.default || pkg; launch.executablePath = await c.executablePath(); launch.args = c.args; }
    browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.home-heat button').first().waitFor();
    const chart = page.locator('.india-flow-chart'), bars = chart.locator('g[role="button"]'), detail = page.locator('.india-flow-detail');
    await bars.first().waitFor();
    // Click/tap both bar pairs and empty slot areas. Exactly one group remains selected.
    for (const theme of ['light', 'neon']) {
      if (theme === 'neon') await page.getByRole('button', { name: 'Theme', exact: true }).click();
      for (const width of [320, 361, 375, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForFunction(() => Math.round(document.querySelector('.india-flow-chart').getBoundingClientRect().width) === Number(document.querySelector('.india-flow-chart').getAttribute('viewBox').split(' ')[2]) || document.querySelector('.india-flow-chart').getBoundingClientRect().width < 300);
        assert.equal(await page.locator('.home-heat button').count(), 16);
        const tiles = await page.locator('.home-heat button').evaluateAll(els => els.map(el => ({ height: el.getBoundingClientRect().height, overflow: el.scrollWidth > el.clientWidth + 1 })));
        assert.ok(tiles.every(t => t.height >= 44 && t.height < 60 && !t.overflow), `${theme} compact readable heat tiles at ${width}px: ${JSON.stringify(tiles)}`);
        assert.ok(await page.locator('.home-heat b').evaluateAll(els => els.every(el => el.scrollWidth <= el.clientWidth + 1)), 'Full sector names fit on one line');
        assert.ok(await page.locator('.home-dashboard-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${theme} home fits ${width}px`);
        await bars.first().locator('.flow-hit').tap();
        await bars.last().locator('.fii').tap();
        assert.equal(await chart.locator('g.selected').count(), 1);
        assert.equal(await bars.last().getAttribute('aria-pressed'), 'true');
        assert.equal(await detail.locator('b').textContent(), flows[0].label);
        assert.equal(await detail.locator('strong').first().textContent(), '−4,699 Cr');
        assert.equal(await detail.locator('strong').last().textContent(), '+5,182 Cr');
        assert.equal(await bars.last().locator('.flow-date').textContent(), '5 Oct');
        await bars.first().focus(); await page.keyboard.press('Enter');
        assert.equal(await bars.first().getAttribute('aria-pressed'), 'true');
        await bars.last().focus(); await page.keyboard.press('Space');
        assert.equal(await bars.last().getAttribute('aria-pressed'), 'true');
        assert.equal(await chart.locator('g.selected').count(), 1);
        const labelsFit = await chart.locator('.flow-date').evaluateAll(els => els.every(el => { const b = el.getBBox(), v = el.ownerSVGElement.viewBox.baseVal; return b.x >= 0 && b.x + b.width <= v.width + 1; }));
        assert.ok(labelsFit, 'Flow date labels fit within the chart');
        if (width === 390 && process.env.HOME_PULSE_SCREENSHOT) { await page.locator('.home-sector-heat').scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.HOME_PULSE_SCREENSHOT.replace('.png', `-${theme}.png`) }); }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Chart timeline, 1M', exact: true }).click();
    await page.getByRole('option', { name: '1W', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.india-flow-chart g[role="button"]').length === 3);
    await bars.last().locator('.dii').tap();
    assert.equal(await detail.locator('b').textContent(), flows[0].label);
    assert.equal(await detail.locator('strong').first().textContent(), '−4,699 Cr');
    assert.deepEqual(errors, []);
    console.log('PASS: 16 compact sector tiles; final FII/DII day has exact values and one selection; taps, keyboard, range changes and date labels work in both themes at 320–1280px.');
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
