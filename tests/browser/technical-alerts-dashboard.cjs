// Run against a local Next server. This uses isolated browser storage and mocked feeds only.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.route('**/api/**', r => r.fulfill({ json: r.request().url().includes('/api/upstox/candles') ? { ok: true, segments: ['historical'], candles: Array.from({ length: 90 }, (_, i) => ({ time: 1789712700 + i * 300, open: 100, high: 105, low: 98, close: 102, volume: 1000 })) } : { ok: true, quotes: {}, underlyings: [], instruments: [], candles: [] } }));
    await page.goto('http://localhost:3220'); await page.locator('.launch-disclaimer').waitFor({ state: 'hidden', timeout: 30000 });
    await page.getByRole('button', { name: 'Charts', exact: true }).last().click();
    await page.getByRole('button', { name: /Open alerts/ }).click(); await page.getByRole('button', { name: 'Create alert', exact: true }).click(); await page.getByRole('button', { name: 'Technical', exact: true }).click();
    await page.getByRole('button', { name: 'Indicator', exact: true }).click(); await page.getByRole('option', { name: 'Bollinger Bands', exact: true }).click();
    await page.getByRole('button', { name: 'Trigger condition', exact: true }).click(); await page.getByRole('option', { name: 'Returns inside from above', exact: true }).click();
    await page.getByRole('button', { name: 'Create technical alert' }).click(); await page.locator('.technical-rule').waitFor();
    assert.match(await page.locator('.technical-rule').textContent(), /Bollinger Bands.*Returns inside from above/);
    await page.screenshot({ path: 'outputs/technical-alert-dashboard.png' });
    await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'P&L', exact: true }).last().click(); await page.getByRole('button', { name: 'Charts', exact: true }).last().click(); await page.getByRole('button', { name: /Open alerts/ }).click(); assert.equal(await page.locator('.technical-rule').count(), 1);
    await page.getByLabel(/Edit technical alert for/).click(); assert.match(await page.getByRole('button', { name: 'Trigger condition', exact: true }).textContent(), /Returns inside from above/);
    assert.deepEqual(errors, []); console.log('Actual dashboard: alert icon → Technical → configured Bollinger alert; saved rule and settings survive P&L navigation');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
