/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser harness. */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const server = spawn('node_modules/.bin/vinext', ['start', '--port', '3240'], { stdio: 'ignore' });
  const launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) { const pkg = require(process.env.CHROMIUM_PACKAGE), c = pkg.default || pkg; launch.executablePath = await c.executablePath(); launch.args = c.args; }
  const browser = await chromium.launch(launch);
  try {
    for (let n = 0; n < 100; n++) { try { await fetch('http://127.0.0.1:3240'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.clock.setFixedTime(new Date('2026-10-07T14:30:00Z'));
    const now = Date.parse('2026-10-07T14:30:00Z'), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const gold = { symbol: 'GOLD-20261204', name: 'GOLD FUT 04 DEC 26', instrumentKey: 'MCX_FO|123', exchange: 'MCX', price: 0, change: 0, assetType: 'FUTURE', expiry: '2026-12-04', lotSize: 100, underlyingSymbol: 'GOLD', underlyingKey: 'MCX_COM|1', categories: ['MCX', 'COMMODITY', 'NON_AGRI'] };
    const crude = { ...gold, symbol: 'CRUDEOILM-20261204', name: 'CRUDEOILM FUT 04 DEC 26', instrumentKey: 'MCX_FO|456', underlyingSymbol: 'CRUDEOILM' };
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.route('**/api/**', r => {
      const url = new URL(r.request().url());
      let json = { ok: true, quotes: {}, instruments: [], candles: [], entries: [], ipos: [], underlyings: [] };
      if (url.pathname === '/api/market/session') {
        const mcx = url.searchParams.get('exchange') === 'MCX';
        json = { ok: true, session: { date: '2026-10-07', checkedAt: now, status: mcx ? 'NORMAL_OPEN' : 'NORMAL_CLOSE', source: mcx ? 'MCX' : 'NSE', sessions: [{ start: Date.parse('2026-10-07T03:30:00Z'), end: Date.parse(mcx ? '2026-10-07T18:00:00Z' : '2026-10-07T10:00:00Z') }] } };
      } else if (url.pathname === '/api/upstox/commodities') json = { ok: true, instruments: [gold, crude] };
      else if (url.pathname === '/api/upstox/quotes') {
        const keys = r.request().method() === 'POST' ? r.request().postDataJSON().keys : (url.searchParams.get('keys') || '').split(',');
        json = { ok: true, quotes: Object.fromEntries(keys.map(key => [key, { instrumentKey: key, symbol: key === gold.instrumentKey ? gold.symbol : 'RELIANCE', lastPrice: 10000, volume: key === crude.instrumentKey ? 71000 : 4600, netChange: 100, changePercent: 1.01, open: 9900, high: 10100, low: 9800, previousClose: 9900, lastTradeAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() }])) };
      } else if (url.pathname === '/api/upstox/candles') json = { ok: true, candles: Array.from({ length: 120 }, (_, i) => ({ time: now / 1000 - (119 - i) * 300, open: 9900, close: 10000, high: 10100, low: 9800, volume: 1000 })) };
      return r.fulfill({ json });
    });
    await page.goto('http://127.0.0.1:3240');
    await page.locator('.launch-disclaimer').waitFor({ state: 'hidden', timeout: 30000 });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.getByRole('textbox', { name: 'Search Indian markets', exact: true }).focus();
      await page.getByRole('tab', { name: 'MCX', exact: true }).click();
      await page.getByRole('button', { name: 'Open GOLD-20261204 chart', exact: true }).waitFor();
      await page.getByText('Most active · Volume', { exact: true }).waitFor();
      assert.equal(await page.locator('.home-search-sheet-list .home-pair-row').first().getAttribute('aria-label'), 'Open CRUDEOILM-20261204 chart');
      assert.equal(await page.locator('.home-search-sheet-list .home-pair-row').first().locator('img').getAttribute('src'), '/commodities/oil.svg');
      assert.ok(await page.locator('.home-search-sheet-list img').first().evaluate(img => img.complete && img.naturalWidth > 0));
      assert.ok(await page.getByText('MCX · 09:00–23:30 IST', { exact: true }).isVisible());
      assert.ok(await page.getByRole('tab', { name: 'MCX', exact: true }).evaluate(el => el.getBoundingClientRect().right <= innerWidth));
      await page.getByRole('button', { name: 'Close search', exact: true }).last().click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox', { name: 'Search Indian markets', exact: true }).focus();
    await page.getByRole('tab', { name: 'MCX', exact: true }).click();
    await page.getByRole('button', { name: 'Open GOLD-20261204 chart', exact: true }).click();
    await page.locator('.title-line h1').filter({ hasText: 'GOLD-20261204' }).waitFor({ state: 'attached' });
    await page.waitForFunction(() => document.querySelector('.trade-feed-chip')?.textContent?.trim() === 'LIVE');
    assert.equal(await page.locator('.title-line').getByText('MCX', { exact: true }).count(), 1);
    await page.locator('.chart-trade-buttons .buy').click();
    const ticket = page.locator('.order-ticket.mobile-open');
    await ticket.waitFor();
    assert.equal(await ticket.getByRole('textbox', { name: 'Order quantity', exact: true }).inputValue(), '100');
    assert.ok(await ticket.getByRole('radio', { name: /Intraday/ }).isEnabled());
    assert.ok(await ticket.locator('.place-order').isEnabled());
    assert.deepEqual(errors, []);
    console.log('PASS: MCX contracts and session hours in Indian search at four widths; nearest contract opens its MCX chart live after NSE closes.');
  } finally { await browser.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
