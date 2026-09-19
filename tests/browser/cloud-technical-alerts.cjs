const fs = require('fs'), http = require('http'), esbuild = require('esbuild'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const bundle = await esbuild.build({ entryPoints: ['tests/browser/technical-alerts.fixture.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'test-auth', setup(b) {
    b.onResolve({ filter: /supabase-client$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getSupabaseBrowserClient = () => ({auth:{getSession:async()=>({data:{session:{user:{id:'qa'},access_token:'fixture-only'}}})}});`, loader: 'js' }));
  } }] });
  const css = [...fs.readFileSync('app/layout.tsx', 'utf8').matchAll(/import "\.\/(.+\.css)"/g)].map(([, f]) => fs.readFileSync('app/' + f, 'utf8')).join('\n').replace(/@import[^;]+;/g, '');
  let store = { version: 1, rules: [], events: [] }, candleCalls = 0, revision = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/technical-alerts') {
      assert.equal(req.headers.authorization, 'Bearer fixture-only');
      if (req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const command = JSON.parse(Buffer.concat(chunks)); const previous = store.rules.find(r => r.id === command.id);
        if (command.action === 'save') {
          const rule = { ...command.config, instrument: command.instrument, delivery: 'server', id: previous?.id ?? 'server-rule', revision: `v${++revision}`, createdAt: Date.now(), armedAt: Date.now(), expiresAt: Date.now() + 86400000, status: 'active' };
          store.rules = [rule, ...store.rules.filter(r => r.id !== rule.id)];
        } else if (command.action === 'delete') store.rules = store.rules.filter(r => r.id !== command.id);
        else { previous.status = command.action === 'pause' ? 'paused' : 'active'; previous.revision = `v${++revision}`; }
      }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, ready: true, message: 'Server monitoring online', store }));
    }
    if (req.url.startsWith('/api/upstox/candles')) candleCalls++;
    if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: true, candles: [] })); }
    res.setHeader('Content-Type', req.url === '/qa.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/qa.js' ? bundle.outputFiles[0].text : `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script src="/qa.js"></script>`);
  }).listen(3229, '127.0.0.1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-09-18T13:00:10+05:30') }); await page.goto('http://127.0.0.1:3229');
    const choose = async (name, option) => { await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
    const open = () => page.getByRole('button', { name: /Open alerts/ }).click();
    await page.getByRole('button', { name: 'New alert', exact: true }).click(); await page.getByRole('button', { name: 'Technical', exact: true }).click();
    await choose('Monitoring', /Even when app is closed/); await choose('Indicator', 'Volume'); await choose('Trigger condition', 'High-volume bearish close');
    await page.getByRole('button', { name: 'Create technical alert', exact: true }).click(); await page.locator('.technical-rule').waitFor();
    assert.equal(store.rules[0].delivery, 'server'); assert.equal(store.rules[0].condition, 'bearish');
    await page.getByLabel('Close price actions').click(); await page.clock.fastForward(90000);
    assert.equal(candleCalls, 0, 'server rules must never be evaluated again by the foreground monitor');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('papertrade-technical-alerts-v1:qa') || '{"rules":[]}').rules.length), 0);
    await page.reload(); await open(); await page.locator('.technical-rule').waitFor();
    await page.getByLabel('Pause technical alert for TEST').click(); await page.getByText('Paused by you', { exact: true }).waitFor();
    await page.reload(); await open(); await page.getByText('Paused by you', { exact: true }).waitFor();
    await page.getByLabel('Resume technical alert for TEST').click(); await page.getByLabel('Pause technical alert for TEST').waitFor();
    await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'Switch account', exact: true }).click(); await open(); assert.equal(await page.locator('.technical-rule').count(), 0);
    await page.getByLabel('Close price actions').click(); await page.getByRole('button', { name: 'Switch account', exact: true }).click();
    const rule = store.rules[0];
    store.events = [{ id: 'server-event', ruleId: rule.id, instrument: rule.instrument, timeframe: rule.timeframe, description: 'Volume spike', barTime: Date.parse('2026-09-18T12:55:00+05:30') / 1000, createdAt: await page.evaluate(() => Date.now()), price: 110, detail: 'Confirmed close', kind: 'trigger' }];
    await page.reload(); await open(); await page.getByRole('tab', { name: /Log/ }).click(); await page.locator('.technical-event').waitFor();
    await page.getByRole('button', { name: 'Open chart', exact: true }).click(); assert.equal(await page.locator('[data-opened]').textContent(), 'TEST 5m');
    await open(); await page.getByRole('tab', { name: /List/ }).click(); await page.getByLabel('Delete technical alert for TEST').click(); await page.getByText('No active alerts', { exact: true }).waitFor();
    await page.getByRole('tab', { name: /Log/ }).click(); assert.equal(await page.locator('.technical-event').count(), 1);
    await page.getByLabel('Close price actions').click();
    await page.getByRole('button', {name:'New alert',exact:true}).click();
    await choose('Monitoring',/Even when app is closed/);
    await page.getByLabel('Alert price (₹)').fill('125.50');
    await page.getByRole('button',{name:'Create alert',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.price-action-sheet'));
    assert.equal(store.rules[0].family,'price');assert.equal(store.rules[0].threshold,125.5);assert.equal(store.rules[0].delivery,'server');
    await open();await page.getByRole('tab',{name:/List/}).click();await page.getByRole('button',{name:'Price',exact:true}).click();await page.locator('.technical-rule').waitFor();
    assert.match(await page.locator('.technical-rule').innerText(),/Price · server/);
    await page.getByLabel('Edit technical alert for TEST').click();
    await page.getByLabel('Alert price (₹)').fill('130');await page.getByRole('button',{name:'Save technical alert',exact:true}).click();
    assert.equal(store.rules[0].threshold,130);assert.equal(candleCalls,0);
    assert.deepEqual(errors, []); console.log('Cloud technical and price forms, server-only monitoring, persistence, edit/pause/resume, isolation, Log and navigation pass with mocked server/auth');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
