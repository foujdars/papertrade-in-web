/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS runner accepts externally installed browser packages. */
const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const esbuild = require('esbuild');
(async () => {
  const { runBackgroundAccount } = await import('../../lib/paper-bot-background.ts');
  const owner = '11111111-1111-4111-8111-111111111111', base = 1800000000000;
  let now = base + 1000, record = null, healthy = true, outage = false, conflict = false, saves = 0;
  const clone = value => structuredClone(value);
  const market = async (symbol, frame) => {
    const spec = { symbol, lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
    const quote = { symbol, last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
    const seconds = { '1m': 60, '5m': 300, '15m': 900 }[frame] ?? 300;
    const current = Math.floor(now / 1000 / seconds) * seconds;
    const candles = Array.from({ length: 35 }, (_, i) => {
      const time = current - (34 - i) * seconds, close = time === base / 1000 && now > base + 60000 ? 110 : 100;
      return { time, open: close, high: close + .5, low: close - .5, close, volume: 100 };
    });
    return { ok: true, kind: 'perpetual', spec, quote, candles, fetchedAt: now };
  };
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/background-bot.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-session', setup(build) {
    build.onResolve({ filter: /supabase-client$/ }, () => ({ path: 'test-session', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getSupabaseBrowserClient = () => ({auth:{getSession:async()=>({data:{session:{access_token:'test-session',user:{id:'${owner}'}}}})}});`, loader: 'js' }));
  } }] });
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, file]) => fs.readFileSync('app/' + file, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
      if (url.pathname === '/api/paper-bot') {
        assert.equal(req.headers.authorization, 'Bearer test-session');
        if (outage) return json({ error: 'Background service unavailable' }, 503);
        if (req.method === 'GET') return json({ configured: true, ready: healthy, message: healthy ? 'Background server online' : 'Scheduler offline', record });
        let text = ''; for await (const chunk of req) text += chunk;
        const body = JSON.parse(text);
        if (body.action === 'enable') { record ??= { user_id: owner, account: body.account, version: 1, last_checked_at: 0, last_error: '' }; return json({ record, ready: healthy }); }
        if (conflict) { conflict = false; record = { ...record, version: record.version + 1, account: { ...record.account, wallet: record.account.wallet + 2 } }; return json({ error: 'Conflict' }, 409); }
        if (body.version !== record.version) return json({ error: 'Conflict' }, 409);
        saves++; record = { ...record, version: record.version + 1, account: body.account }; return json({ record });
      }
      if (url.pathname === '/api/global-markets') return json(await market(url.searchParams.get('symbol'), url.searchParams.get('timeframe')));
      res.setHeader('Content-Type', url.pathname === '/qa.js' ? 'application/javascript' : 'text/html');
      res.end(url.pathname === '/qa.js' ? bundle.outputFiles[0].text : `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
    } catch (error) { res.writeHead(500); res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    let launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) { const pkg = require(process.env.CHROMIUM_PACKAGE); const c = pkg.default || pkg; launch = { ...launch, executablePath: await c.executablePath(), args: c.args }; }
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    let page = await context.newPage();
    await page.clock.install({ time: new Date(now) });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.getByRole('button', { name: 'Enable background', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Strategy', exact: true }).click();
    await page.getByRole('option', { name: 'Range breakout', exact: true }).click();
    await page.getByLabel('Entry timeframe 1m', { exact: true }).check();
    await page.getByLabel('Entry timeframe 5m', { exact: true }).uncheck();
    await page.getByLabel('Breakout lookback').fill('10');
    await page.getByRole('button', { name: 'Start bot', exact: true }).click();
    await page.waitForFunction(() => window.botState.background.mode === 'cloud' && window.botState.account.bots?.[0]?.enabled);
    assert.ok(record.account.bots[0].enabled);
    const atStart = saves;
    await page.clock.fastForward(10000);
    await page.waitForTimeout(200);
    assert.equal(saves, atStart, 'The browser does not automatically advance the cloud wallet');
    await page.close(); // Actual page teardown; the server runs with no browser client.
    now = base + 67000;
    const save = async (current, account, checked, message) => {
      if (record.version !== current.version) return null;
      record = { ...record, version: record.version + 1, account, last_checked_at: checked, last_error: message }; return clone(record);
    };
    await runBackgroundAccount(clone(record), { now: () => now, market, save });
    assert.equal(record.account.positions.length, 1, 'Server entry occurred after closing the app');
    page = await context.newPage(); await page.clock.install({ time: new Date(now) }); await page.goto(url);
    await page.waitForFunction(() => window.botState.account?.positions.length === 1 && window.botState.background.mode === 'cloud');
    assert.equal(await page.getByRole('button', { name: 'Enable background', exact: true }).count(), 0);
    const previousWallet = record.account.wallet; conflict = true;
    await page.getByRole('button', { name: 'Test wallet edit', exact: true }).click();
    await page.waitForFunction(value => window.botState.account.wallet === value, previousWallet + 3);
    assert.equal(record.account.wallet, previousWallet + 3, 'A version conflict retries on the current wallet, preserving the concurrent edit');
    healthy = false;
    await page.clock.fastForward(5500);
    await page.getByText('Background scheduler offline · entries waiting', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Pause all', exact: true }).click();
    await page.waitForFunction(() => !window.botState.account.bots?.[0]?.enabled);
    assert.equal(record.account.positions.length, 1, 'Pausing keeps the open position protected');
    outage = true; const beforeOutage = saves;
    await page.clock.fastForward(5500);
    await page.waitForFunction(() => window.botState.background.mode === 'blocked');
    await page.clock.fastForward(20000);
    assert.equal(saves, beforeOutage, 'Offline cloud mode never falls back to local writes');
    outage = false; healthy = true;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => window.botState.background.mode === 'cloud');
    assert.equal(record.account.bots[0].enabled, false, 'Reconnect does not restart a paused bot');
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.locator('.bot-workspace').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `Bot fits ${width}px`);
      assert.equal(await page.locator('.bot-workspace select').count(), 0, 'Bot uses modern lists');
      assert.equal(await page.locator('.bot-assets').evaluate(el => new Set([...el.children].map(child => child.getBoundingClientRect().top)).size), 1, 'Four assets share one row');
      assert.equal(await page.locator('.bot-monitor').evaluate(el => new Set([...el.children].map(child => child.getBoundingClientRect().top)).size), 1, 'Status and trade share one row');
      assert.equal(await page.locator('.bot-form-actions').evaluate(el => new Set([...el.children].map(child => child.getBoundingClientRect().top)).size), 1, 'Preview and start share one row');
      await page.getByRole('button', { name: 'Trade direction', exact: true }).click();
      await page.getByRole('option', { name: 'Long only', exact: true }).click();
      assert.match(await page.getByRole('button', { name: 'Trade direction', exact: true }).innerText(), /Long only/);
    }
    if (process.env.BOT_BACKGROUND_SCREENSHOT) { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: process.env.BOT_BACKGROUND_SCREENSHOT }); }
    assert.deepEqual(errors, []);
    console.log('Background bot verified: authenticated transfer, no browser execution, entry with page closed, reopening server wallet, version conflict retry, pause during scheduler outage, no local fallback, reconnect and responsive controls.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
