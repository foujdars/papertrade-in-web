const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [], historyRequests = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/market/psbb-scan') {
        const stamp = Date.parse(`${url.searchParams.get('month')}-03T10:00:00+05:30`) / 1000;
        return route.fulfill({ json: { ok: true, report: { instrumentKey: url.searchParams.get('instrumentKey'), timeframe: url.searchParams.get('timeframe'), month: url.searchParams.get('month'), rows: [{ id: '1', status: 'success', setup: { side: 'long', mssTime: stamp, confirmedTime: stamp, entry: 100, stop: 90, target1: 110 } }], counts: { pending: 0, active: 0, failed: 0, success: 1 }, coverage: 'available', scannedAt: Date.now() } } });
      }
      if (url.pathname === '/api/upstox/candles') {
        historyRequests.push(Object.fromEntries(url.searchParams));
        return route.fulfill({ json: { ok: true, segments: ['historical'], candles: Array.from({ length: 150 }, (_, i) => ({ time: 1789712700 + i * 300, open: 100, close: 102 + Math.sin(i / 5) * 3, high: 108, low: 94, volume: 1000 })) } });
      }
      return route.fulfill({ json: { ok: true, quotes: {}, underlyings: [], instruments: [], candles: [] } });
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3228');
    await page.locator('.launch-disclaimer').waitFor({ state: 'hidden', timeout: 30000 });
    await page.locator('.mobile-bottom-nav').getByRole('button', { name: 'Watchlist', exact: true }).click();
    await page.locator('.market-section-tabs').filter({ visible: true }).getByRole('button', { name: 'Watchlist', exact: true }).click();
    await page.getByRole('button', { name: /^Current watchlist:/ }).click();
    const options = page.locator('.watchlist-selector-options button');
    assert.equal(await options.nth(1).locator('b').textContent(), 'Trading watchlist');
    await options.nth(1).click();
    await page.locator('.tw-row').first().waitFor();
    await page.getByLabel('Trading stock universe').selectOption('Indices');
    await page.getByRole('status').filter({ hasText: '3/3 stocks scanned' }).waitFor();
    await page.getByRole('tab', { name: '4H', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '3/3 stocks scanned' }).waitFor();
    const last = page.getByRole('button', { name: 'Open SENSEX 4H success chart' });
    await last.scrollIntoViewIfNeeded();
    assert.ok(await last.isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Full dashboard fits mobile');
    if (process.env.WATCHLIST_DASHBOARD_SCREENSHOT) await page.screenshot({ path: process.env.WATCHLIST_DASHBOARD_SCREENSHOT });
    await last.click();
    await page.waitForFunction(() => document.querySelector('.terminal-shell')?.dataset.section === 'trade');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('timeframe') === '4H');
    await page.waitForTimeout(700);
    assert.ok(historyRequests.some(request => request.instrumentKey === 'BSE_INDEX|SENSEX' && request.date), 'Chart requests the selected setup date');
    assert.deepEqual(errors, []);
    console.log('Production dashboard: Trading watchlist is second, mobile list scrolls, Sensex 4H opens at setup date.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
