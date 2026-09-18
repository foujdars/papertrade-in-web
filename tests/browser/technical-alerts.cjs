const fs = require('fs'), http = require('http'), esbuild = require('esbuild'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/technical-alerts.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, f]) => fs.readFileSync('app/' + f, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
  const start = Date.parse('2026-09-18T09:15:00+05:30') / 1000;
  let tail = [110], failFeed = false, calls = 0;
  const candle = (close, i) => ({ time: start + i * 300, open: 100, high: Math.max(100, close) + 1, low: Math.min(100, close) - 1, close, volume: 1000 });
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/upstox/candles')) { calls++; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(failFeed ? { ok: false } : { ok: true, candles: [...Array(44).fill(100), ...tail].map(candle) })); }
    if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true })); }
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
  }).listen(3228, '127.0.0.1');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-09-18T12:59:50+05:30') }); await page.goto('http://127.0.0.1:3228');
    const choose = async (label, option) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
    const open = () => page.getByRole('button', { name: /Open alerts/ }).click();
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa')));
    await page.getByRole('button', { name: 'New alert', exact: true }).click(); await page.getByRole('button', { name: 'Technical', exact: true }).click();
    await page.getByLabel('Period', { exact: true }).fill('5'); await choose('Frequency', 'Each new crossing');
    await page.screenshot({ path: 'outputs/technical-alert-create.png' });
    await page.getByRole('button', { name: 'Create technical alert' }).click(); await page.locator('.technical-rule').waitFor();
    assert.equal((await stored()).rules[0].period, 5); assert.equal((await stored()).rules[0].repeat, 'repeat');
    await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'Switch app tab', exact: true }).click();
    await page.clock.fastForward(30000); await page.waitForFunction(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa')).events.length === 1);
    assert.equal((await stored()).events[0].price, 110); assert.equal(calls, 1);
    await page.clock.fastForward(30000); await page.waitForTimeout(100); assert.equal((await stored()).events.length, 1);
    console.log('Confirmed close triggers while another app tab is open; repeated polls do not duplicate it');
    const settled = () => page.waitForFunction(async () => !(await navigator.locks.query()).held.some(lock => lock.name.endsWith(':monitor')));
    const second = await context.newPage(); await second.goto('http://127.0.0.1:3228'); await second.getByRole('button', { name: 'New alert', exact: true }).waitFor(); await settled();
    // Playwright's clock is shared by every page in this browser context.
    tail = [110, 80]; await page.clock.fastForward(300000); await page.waitForFunction(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa')).rules[0].lastBar >= Date.parse('2026-09-18T13:00:00+05:30') / 1000); await settled();
    tail = [110, 80, 110]; await page.clock.fastForward(300000); await page.waitForFunction(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa')).events.length === 2); await settled(); await second.close();
    console.log('Two browser tabs share persisted cursors: a new crossing creates exactly one new event');
    await page.reload(); await open(); await page.getByRole('tab', { name: /Log/ }).click(); await page.locator('.technical-event').first().waitFor(); assert.equal(await page.locator('.technical-event').count(), 2);
    await page.getByRole('button', { name: 'Open chart', exact: true }).first().click(); await page.locator('[data-opened]').filter({ hasText: 'TEST 5m' }).waitFor();
    await page.getByRole('button', { name: /^Notifications/ }).click(); await page.getByRole('button', { name: 'Open 5m chart', exact: true }).first().click(); assert.equal(await page.locator('[data-opened]').textContent(), 'TEST 5m');
    await open(); await page.getByRole('tab', { name: /List/ }).click(); await page.getByLabel('Pause technical alert for TEST').click(); await page.getByText('Paused by you', { exact: true }).waitFor();
    await page.reload(); await open(); await page.getByText('Paused by you', { exact: true }).waitFor(); await page.getByLabel('Resume technical alert for TEST').click();
    await page.getByLabel('Edit technical alert for TEST').click(); assert.equal(await page.getByLabel('Period', { exact: true }).inputValue(), '5');
    await choose('Indicator', 'RSI'); await page.getByLabel('RSI threshold').fill('50'); await page.getByRole('button', { name: 'Save technical alert' }).click(); await page.locator('.technical-rule').waitFor();
    assert.equal((await stored()).rules.length, 1); assert.equal((await stored()).rules[0].family, 'rsi'); assert.equal((await stored()).rules[0].lastBar, undefined, 'editing resets the old timeframe cursor');
    await page.getByLabel('Search alerts', { exact: true }).fill('RSI'); assert.equal(await page.locator('.technical-rule').count(), 1); await page.getByLabel('Clear alert search').click();
    console.log('Saved parameters, repeat mode, pause/resume and edits survive reload; Log opens the correct symbol/timeframe');
    await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'Switch account', exact: true }).click(); await open(); assert.equal(await page.locator('.technical-rule').count(), 0); await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    await page.getByRole('button', { name: 'Switch theme', exact: true }).click(); await open(); await page.locator('.technical-rule').waitFor(); await page.screenshot({ path: 'outputs/technical-alert-list-dark.png' });
    await page.getByLabel('Edit technical alert for TEST').click(); await page.getByRole('button', { name: 'Indicator', exact: true }).click(); await page.getByRole('option', { name: 'RSI', exact: true }).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Save technical alert' }).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: 'Alerts', exact: true }).waitFor();
    for (const width of [320, 390, 768, 1280]) { await page.setViewportSize({ width, height: 844 }); const box = await page.getByRole('dialog', { name: 'Alerts', exact: true }).boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1); await page.getByLabel('Edit technical alert for TEST').click(); const overflow = await page.locator('.price-alert-form').evaluate(el => el.scrollWidth > el.clientWidth + 1); assert.equal(overflow, false); await page.getByLabel('Close price actions').click(); }
    failFeed = true; await page.getByLabel('Close price actions').click(); await page.clock.fastForward(300000); await open(); await page.getByText('Waiting for candle data · retrying automatically', { exact: true }).waitFor(); assert.equal((await stored()).events.length, 2);
    failFeed = false; tail = [110, 80, 110, 80]; await page.clock.fastForward(30000); await page.waitForFunction(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa')).rules[0].lastBar > 0);
    await page.getByLabel('Delete technical alert for TEST').click(); await page.getByText('No active alerts', { exact: true }).waitFor(); await page.getByRole('tab', { name: /Log/ }).click(); assert.equal(await page.locator('.technical-event').count(), 2);
    console.log('Account isolation, honest feed errors, keyboard dismissal, dark theme, four responsive widths and retained history after deletion pass');
    assert.equal(errors.length, 0, errors.join('\n'));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
