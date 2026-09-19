const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*.supabase.co/**', r => r.abort());
    await page.route('**/api/**', r => r.fulfill({ json: r.request().url().includes('/api/upstox/candles')
      ? { ok: true, segments: ['historical'], candles: Array.from({ length: 150 }, (_, i) => ({ time: 1789712700 + i * 300, open: 100 + Math.sin(i / 5) * 3, close: 102 + Math.sin(i / 5) * 3, high: 108 + Math.sin(i / 5) * 2, low: 94 + Math.sin(i / 5) * 2, volume: 1000 })) }
      : { ok: true, quotes: {}, underlyings: [], instruments: [], candles: [] } }));
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3220');
    await page.locator('.launch-disclaimer').waitFor({ state: 'hidden', timeout: 30000 });
    await page.getByRole('button', { name: 'Charts', exact: true }).last().click();
    await page.locator('.chart-functions-trigger').click();
    const menu = page.getByRole('dialog', { name: 'Functions', exact: true });
    await menu.getByLabel('Search indicators').fill('Average Directional');
    await menu.getByRole('button', { name: 'Add Average Directional Index', exact: true }).click();
    await menu.getByRole('button', { name: 'Settings for Average Directional Index', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Average Directional Index settings', exact: true });
    await editor.getByLabel('DI length', { exact: true }).fill('10');
    await editor.getByRole('button', { name: 'Apply', exact: true }).click();
    await menu.getByRole('button', { name: 'Close functions' }).click();
    await page.getByRole('button', { name: 'Hide ADX 10 14', exact: true }).waitFor();
    await page.screenshot({ path: 'outputs/indicator-dashboard.png' });
    await page.getByRole('button', { name: 'Remove ADX 10 14', exact: true }).click();
    await page.getByRole('button', { name: 'Hide ADX 10 14', exact: true }).waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log('Dashboard: indicator library, ADX settings, pane controls and removal pass on production build');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
