const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const AT = Date.parse('2026-10-16T09:30:00+05:30');
const RUN_KEY = 'papertrade-algo-run-v1:runner-test';
const LEASE_KEY = `${RUN_KEY}:writer`;

(async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: false, cacheDir: 'node_modules/.vite-algo-runner-qa', root: process.cwd(),
    appType: 'custom', define: { 'process.env': '{}' }, resolve: { alias: { '@': process.cwd() } },
    server: { host: '127.0.0.1', port: 3292, strictPort: true, watch: { ignored: ['**/*'] } },
    plugins: [
      { name: 'runner-native-events', enforce: 'pre',
        resolveId(id) { if (id === '@capacitor/app') return '\0runner-native-app'; },
        load(id) { if (id === '\0runner-native-app') return `
          const listeners = new Set();
          window.nativeRunnerEvents = {
            emit(isActive) { for (const listener of listeners) listener({ isActive }); },
            count() { return listeners.size; }
          };
          export const App = { addListener: async (name, listener) => {
            if (name === 'appStateChange') listeners.add(listener);
            return { remove: async () => { listeners.delete(listener); } };
          } };`; },
      },
      { name: 'runner-fixture', configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url !== '/') return next();
          const html = await server.transformIndexHtml('/', '<meta charset="utf-8"><div id="root"></div><script type="module" src="/tests/browser/algo-runner.fixture.jsx"></script>');
          res.setHeader('Content-Type', 'text/html'); res.end(html);
        });
      } },
    ],
  });
  await vite.listen();
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const context = await browser.newContext();
  const errors = [], realOrders = [], models = new Map();
  await context.addInitScript(now => {
    const OriginalDate = Date;
    window.Date = class FixedDate extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    // Headless window focus must not accidentally decide the lifecycle scenario.
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
    window.runnerVisibility = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  }, AT);
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url()), page = route.request().frame().page();
    const model = models.get(page);
    if (/orders|trade/.test(url.pathname)) realOrders.push(url.pathname);
    if (url.pathname === '/api/market/session') return route.fulfill({ json: { session: {
      date: '2026-10-16', checkedAt: AT, status: 'NORMAL_OPEN', source: 'controlled regression fixture',
      sessions: [{ start: Date.parse('2026-10-16T09:15:00+05:30'), end: Date.parse('2026-10-16T15:30:00+05:30') }],
    } } });
    if (url.pathname === '/api/upstox/quotes') {
      model.requests++;
      if (model.hold) { model.held = route; return; }
      return route.fulfill({ json: quotePayload(model) });
    }
    throw new Error(`Unexpected endpoint in scheduled market run: ${url.pathname}`);
  });
  function quotePayload(model) {
    return { ok: true, quotes: { 'NSE_EQ|TEST': {
      instrumentKey: 'NSE_EQ|TEST', lastPrice: model.price,
      updatedAt: new Date(AT - (model.staleObservation ? 30_000 : 0)).toISOString(),
      lastTradeAt: new Date(AT - (model.staleTrade ? 61_000 : 0)).toISOString(),
    } } };
  }
  async function open() {
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    models.set(page, { price: 100, requests: 0 });
    await page.goto('http://127.0.0.1:3292/');
    await page.waitForFunction(() => window.runner && !window.runner.loading);
    return page;
  }
  const state = page => page.evaluate(() => window.runner.session);
  const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), RUN_KEY);
  const waitState = (page, expression) => page.waitForFunction(expression);
  async function nextTick(page) {
    const before = (await state(page)).cursor;
    await page.waitForFunction(cursor => window.runner.session.cursor > cursor, before);
  }
  let a, b;
  try {
    a = await open(); const aModel = models.get(a);
    await a.getByRole('button', { name: 'Start market', exact: true }).click();
    await waitState(a, () => window.runner.session?.positions.length === 1);
    assert.equal((await state(a)).positions[0].entryPrice, 100.1);
    assert.equal((await state(a)).netPnl, -3);

    aModel.staleTrade = true; aModel.price = 1000;
    await nextTick(a);
    assert.equal((await state(a)).positions[0].markPrice, 100, 'fresh receipt does not refresh an old trade');
    assert.match((await state(a)).message, /fresh, matching quotes/);
    await a.getByRole('button', { name: 'Stop', exact: true }).click();
    await waitState(a, () => window.runner.session.status === 'stopping');
    await nextTick(a);
    assert.equal((await state(a)).trades.length, 0, 'stop waits instead of inventing an exit from stale prices');
    aModel.staleTrade = false; aModel.staleObservation = true;
    await nextTick(a);
    assert.equal((await state(a)).positions.length, 1, 'old observation also blocks a fill');
    aModel.staleObservation = false; aModel.price = 110;
    await waitState(a, () => window.runner.session.status === 'stopped');
    assert.equal((await state(a)).trades.length, 1);
    assert.equal((await state(a)).netPnl, 93.9, 'exit slippage and fees are charged once');
    console.log('Market quotes: fresh entry, old-trade/old-observation rejection and stop awaiting fresh exit passed.');

    aModel.price = 100;
    await a.getByRole('button', { name: 'Start market', exact: true }).click();
    await waitState(a, () => window.runner.session?.positions.length === 1);
    const runId = (await state(a)).id;
    await a.reload(); await waitState(a, () => window.runner && !window.runner.loading);
    assert.equal((await state(a)).id, runId); assert.equal((await state(a)).status, 'paused');
    const requestsAfterReload = aModel.requests;
    await a.waitForTimeout(3300);
    assert.equal(aModel.requests, requestsAfterReload, 'reload does not auto-resume market polling');
    await a.getByRole('button', { name: 'Resume', exact: true }).click();
    await waitState(a, () => window.runner.session.status === 'running');
    await a.evaluate(() => window.nativeRunnerEvents.emit(false));
    await waitState(a, () => window.runner.session.status === 'paused');
    await a.evaluate(() => window.nativeRunnerEvents.emit(true));
    assert.equal((await state(a)).status, 'paused', 'native foreground does not auto-resume');
    assert.equal(await a.evaluate(() => window.nativeRunnerEvents.count()), 1);
    await a.getByRole('button', { name: 'Resume', exact: true }).click();
    await a.evaluate(() => window.runnerVisibility(true));
    await waitState(a, () => window.runner.session.status === 'paused');
    await a.evaluate(() => window.runnerVisibility(false));
    assert.equal((await state(a)).status, 'paused', 'returning to a visible document requires explicit resume');
    await a.getByRole('button', { name: 'Resume', exact: true }).click();
    console.log('Lifecycle: reload, native inactivity and hidden document pause without automatic resumption passed.');

    b = await open(); const bModel = models.get(b); bModel.price = 105;
    assert.equal((await state(b)).status, 'paused');
    await b.getByRole('button', { name: 'Resume', exact: true }).click();
    await waitState(a, () => window.runner.session.status === 'paused');
    await waitState(b, () => window.runner.session.positions[0]?.markPrice === 105);
    const secondLease = await b.evaluate(key => localStorage.getItem(key), LEASE_KEY);
    await a.getByRole('button', { name: 'Stop', exact: true }).click();
    assert.equal((await state(a)).status, 'paused');
    assert.match(await a.getByTestId('notice').innerText(), /another tab/);
    assert.equal((await saved(a)).session.status, 'running', 'non-owner stop does not overwrite the active run');
    assert.equal(await a.evaluate(key => localStorage.getItem(key), LEASE_KEY), secondLease);
    const requestsBeforeRefusedStop = aModel.requests;
    await a.waitForTimeout(3300);
    assert.equal(aModel.requests, requestsBeforeRefusedStop, 'refused stop cannot reactivate old-owner polling');

    // Hold A's first request: its visible state must immediately use B's latest saved mark.
    aModel.hold = true;
    await a.getByRole('button', { name: 'Resume', exact: true }).click();
    await waitState(a, () => window.runner.session.status === 'running');
    assert.equal((await state(a)).positions[0].markPrice, 105, 'resume loads latest owner state, not its stale local copy');
    await waitState(b, () => window.runner.session.status === 'paused');
    for (let i = 0; !aModel.held && i < 40; i++) await a.waitForTimeout(100);
    assert.ok(aModel.held, 'a production polling request is in flight');
    // B takes over while A's response is in flight; response completion must not mutate storage.
    await b.getByRole('button', { name: 'Resume', exact: true }).click();
    await waitState(a, () => window.runner.session.status === 'paused');
    aModel.price = 999; aModel.hold = false;
    await aModel.held.fulfill({ json: quotePayload(aModel) }); aModel.held = null;
    await a.waitForTimeout(200);
    assert.equal((await state(a)).status, 'paused');
    assert.equal((await saved(b)).session.positions[0].markPrice, 105, 'lost-owner response cannot overwrite latest saved state');
    await b.getByRole('button', { name: 'Stop', exact: true }).click();
    await waitState(b, () => window.runner.session.status === 'stopped');
    assert.equal((await state(b)).trades.length, 1);
    assert.equal((await saved(b)).session.trades.length, 1);
    console.log('Cross-tab: takeover, refused stale-owner stop, latest-state resume and in-flight ownership loss passed.');
    assert.deepEqual(realOrders, [], 'paper workflow never requests a broker order endpoint');
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('PASS: actual useAlgoPaperSession browser regression.');
  } catch (error) {
    for (const [name, page] of [['a', a], ['b', b]]) if (page && !page.isClosed()) console.error(name, await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); await browser.close(); await vite.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
