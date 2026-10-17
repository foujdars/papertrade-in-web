const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const output = path.resolve(process.env.ALGO_QA_OUTPUT_DIR || 'work/algo-browser-qa'); fs.mkdirSync(output, { recursive: true });
(async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-algo-qa', root: process.cwd(), appType: 'custom', define: { 'process.env': '{}' }, resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: 3290, strictPort: true, watch: { ignored: ['**/*'] } }, plugins: [{ name: 'qa-native', enforce: 'pre', resolveId(id) { if (id === '@capacitor/app') return '\0native-app'; }, load(id) { if (id === '\0native-app') return `export const App={addListener:async()=>({remove:async()=>{}}),getState:async()=>({isActive:true}),getLaunchUrl:async()=>undefined,exitApp:async()=>{}}`; } }, { name: 'algo-qa', configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/' && !req.url?.startsWith('/?')) return next();
    const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, name]) => fs.readFileSync('app/' + name, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
    const html = await server.transformIndexHtml('/', `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script type="module" src="/tests/browser/algo-trading.fixture.jsx"></script>`);
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  }); } }] });
  await vite.listen(); const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    for (const [name, width, native, theme] of [['desktop', 1440, false, 'light'], ['mobile', 390, false, 'light'], ['small', 320, false, 'light'], ['tablet', 768, false, 'neon'], ['native', 390, true, 'neon']]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 800, hasTouch: width < 800, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [], realOrders = [], historyRequests = []; let historyFailure = true; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
      await page.route('**/api/**', route => {
        const url = new URL(route.request().url()); if (/orders|trade/.test(url.pathname)) realOrders.push(url.pathname);
        if (url.pathname === '/api/upstox/option-chain') { const side = (optionType) => ({ instrumentKey: `NSE_FO|${optionType === 'CE' ? 1001 : 1002}`, tradingSymbol: `NIFTY 22 OCT 25000 ${optionType}`, optionType, lotSize: 75, marketData: { ltp: 120, closePrice: 115 }, greeks: {} }); return route.fulfill({ json: url.searchParams.has('expiry') ? { ok: true, expiries: ['2026-10-22'], rows: [{ expiry: '2026-10-22', strikePrice: 25000, call: side('CE'), put: side('PE') }] } : { ok: true, expiries: ['2026-10-22'] } }); }
        if (url.pathname === '/api/upstox/candles') { historyRequests.push(url); return historyFailure ? route.fulfill({ status: 503, json: { ok: false, error: { message: 'Test provider unavailable. No historical prices.' } } }) : route.fulfill({ json: { ok: true, candles: Array.from({ length: 75 }, (_, i) => ({ time: Date.parse('2026-10-16T09:15:00+05:30') / 1000 + i * 300, open: 100 + i * .1, high: 101 + i * .1, low: 99 + i * .1, close: 100.2 + i * .1, volume: 100 })) } }); }
        return route.fulfill({ json: { ok: true, quotes: {}, session: null } });
      });
      await page.goto(`http://127.0.0.1:3290/?theme=${theme}${native ? '&native=1' : ''}`);
      await page.getByRole('heading', { name: 'Algo Trading', exact: true }).waitFor();
      await page.getByLabel('Strategy name', { exact: true }).fill('Browser QA strategy');
      await page.getByRole('button', { name: 'Save strategy', exact: true }).click();
      await page.getByRole('tab', { name: /Saved strategies/ }).click();
      await page.getByRole('button', { name: 'Load strategy', exact: true }).click();
      assert.equal(await page.getByLabel('Strategy name', { exact: true }).inputValue(), 'Browser QA strategy');
      await page.getByRole('button', { name: 'Add leg', exact: true }).click();
      await page.getByRole('button', { name: 'Option contracts', exact: true }).click();
      await page.getByLabel('Expiry', { exact: true }).selectOption('2026-10-22');
      await page.getByRole('button', { name: 'Add 25000 call', exact: true }).click();
      assert.equal(await page.getByLabel('Units for leg 2', { exact: true }).inputValue(), '75');
      await page.getByRole('button', { name: 'Choose instrument for leg 2', exact: true }).click();
      await page.evaluate(() => window.dispatchEvent(new Event('papertrade:dismiss-layer', { cancelable: true })));
      await page.getByRole('dialog', { name: 'Select strategy instrument' }).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Choose instrument for leg 2');
      assert.equal(await page.evaluate(() => window.closedAlgo), undefined);
      await page.evaluate(() => { document.querySelectorAll('div,section,main').forEach(n => n.scrollTop = 0); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, `algo-builder-${name}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits viewport`);
      if (!process.env.ALGO_SKIP_BACKTEST) {
      await page.getByRole('button', { name: 'Try demo', exact: true }).click();
      await page.getByRole('heading', { name: 'Equity curve', exact: true }).waitFor();
      assert.ok(await page.getByRole('img', { name: /^Equity curve/ }).count());
      await page.evaluate(() => { document.querySelectorAll('div,section,main').forEach(n => n.scrollTop = 0); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, `algo-results-${name}.png`), fullPage: true });
      await page.getByRole('tab', { name: 'Strategy builder', exact: true }).click();
      await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Test provider unavailable' }).waitFor();
      historyFailure = false;
      await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
      await page.getByText(/Upstox · historical market candles/).waitFor();
      assert.ok(historyRequests.every(url => url.searchParams.get('strict') === '1'), 'History is requested without fallback');
      await page.getByRole('row').filter({ hasText: 'NIFTY 22 OCT 25000 CE' }).getByRole('cell', { name: '75', exact: true }).waitFor();
      if (name === 'desktop') {
        await page.getByRole('tab', { name: 'Strategy builder', exact: true }).click();
        await page.getByLabel('Entry rule', { exact: true }).selectOption('ema');
        await page.getByLabel('Fast EMA', { exact: true }).fill('2');
        await page.getByLabel('Slow EMA', { exact: true }).fill('4');
        await page.getByLabel('Price data', { exact: true }).selectOption('demo');
        await page.getByRole('button', { name: 'Run backtest', exact: true }).click();
        await page.getByRole('heading', { name: 'Equity curve', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'Browser QA strategy', exact: true }).waitFor();
        await page.getByRole('tab', { name: 'Strategy builder', exact: true }).click();
        await page.getByLabel('Entry rule', { exact: true }).selectOption('scheduled');
      }
      }
      await page.getByRole('tab', { name: 'Forward test', exact: true }).click();
      await page.getByRole('button', { name: 'Start paper run', exact: true }).click();
      await page.getByText(/simulated legs? opened|Monitoring stops/).first().waitFor();
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.evaluate(() => { document.querySelectorAll('div,section,main').forEach(n => n.scrollTop = 0); window.scrollTo(0, 0); });
      await page.screenshot({ path: path.join(output, `algo-forward-${name}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Stop & close', exact: true }).click();
      await page.getByText('Paper run complete. All simulated legs are closed.').first().waitFor();
      assert.deepEqual(realOrders, [], 'Paper flow never calls broker order endpoints');
      assert.deepEqual(errors, []);
      await page.reload(); await page.getByRole('tab', { name: /Saved strategies/ }).click(); await page.getByRole('heading', { name: 'Browser QA strategy', exact: true }).waitFor();
      await page.goto(`http://127.0.0.1:3290/?owner=another-user&theme=${theme}`); await page.getByRole('tab', { name: 'Saved strategies', exact: true }).click(); await page.getByRole('heading', { name: 'Keep your tested strategies', exact: true }).waitFor();
      await context.close(); console.log(`${name}: builder, exact options, ${process.env.ALGO_SKIP_BACKTEST ? "backtest skipped, " : "demo backtest, provider failure, "}forward paper lifecycle, owner storage and responsive layout passed.`);
    }
  } catch (e) { const page = browser.contexts()[0]?.pages()[0]; console.error(await page?.locator('body').innerText()); await page?.screenshot({ path: path.join(output, 'algo-debug.png'), fullPage: true }); throw e; } finally { await browser.close(); await vite.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
