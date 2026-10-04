/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner loads optional browser packages by filesystem path. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const server = process.env.START_TEST_SERVER ? require('node:child_process').spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3237', '--hostname', '127.0.0.1'], { stdio: 'pipe' }) : null;
  let browser;
  try {
    if (server) for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3237')).ok) break; } catch {}
      if (attempt === 59) throw new Error('Production test server did not start');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    let launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) {
      const mod = require(process.env.CHROMIUM_PACKAGE), packaged = mod.default || mod;
      launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
    }
    browser = await chromium.launch(launch);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [], requests = [];
    let outage = false, revision = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-04T13:30:00Z') });
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.route('https://assets.upstox.com/**', route => route.abort());
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/market/news') {
        requests.push(url);
        if (outage) return route.fulfill({ status: 503, json: { error: 'News is temporarily unavailable. Retrying automatically.' } });
        const now = await page.evaluate(() => Date.now());
        const items = Array.from({ length: 45 }, (_, index) => ({ title: index === 0 ? 'RELIANCE wins new contract for energy expansion' : `Market update ${index}: company results and business developments`, url: `https://example.com/news/${index}`, source: index % 2 ? 'Mint Markets' : 'Economic Times', publishedAt: new Date(now - index * 60000).toISOString(), sentiment: ['Positive', 'Negative', 'Neutral'][index % 3], importance: index % 3 === 0 ? 3 : 1 }));
        if (revision) items.unshift({ ...items[0], title: `Fresh headline ${revision}`, url: `https://example.com/fresh/${revision}`, publishedAt: new Date(now + 1000).toISOString(), importance: 1, sentiment: 'Neutral' });
        return route.fulfill({ json: { items, updatedAt: new Date(now).toISOString(), checkedAt: new Date(now).toISOString(), stale: false, unavailableSources: ['Moneycontrol'], sourceCount: 4 } });
      }
      return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [], connected: false } });
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3237');
    const open = async () => {
      const nav = page.viewportSize().width <= 940 ? '.mobile-bottom-nav' : '.main-nav';
      await page.locator(nav).getByRole('button', { name: 'News', exact: true }).click();
      await page.locator('.news-list article').first().waitFor();
    };
    await open();
    const workspace = page.getByRole('region', { name: 'Market news', exact: true });
    const refresh = workspace.getByRole('button', { name: 'Refresh news', exact: true });
    await refresh.waitFor();
    assert.equal(await workspace.locator('article').count(), 45);
    assert.doesNotMatch(await workspace.innerText(), /ranked by|impact signals|prediction of stock returns|no verified stock match|Some news sources/);
    assert.match(await workspace.innerText(), /3\/4 feeds/);
    await workspace.getByRole('button', { name: 'Important', exact: true }).click();
    assert.equal(await workspace.locator('article').count(), 15);
    await workspace.getByRole('button', { name: 'Negative', exact: true }).click();
    await workspace.getByText('No recent headlines match this filter.', { exact: true }).waitFor();
    await workspace.getByRole('button', { name: 'Latest', exact: true }).click();
    assert.equal(await workspace.locator('article').count(), 15);
    await workspace.getByRole('button', { name: 'All', exact: true }).click();

    // The last story must be reachable by touch scrolling, above the bottom navigation.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 650 }] });
    for (const y of [570, 490, 410, 330, 250]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('.news-workspace').scrollTop > 100);
    await workspace.locator('article').last().scrollIntoViewIfNeeded();
    assert.ok(await workspace.locator('article').last().evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top + 1));
    console.log('News filters and touch scrolling verified.');

    // Polling must add fresh headlines without resetting the reader to the start.
    await workspace.evaluate(el => { el.scrollTop = 850; });
    await page.waitForTimeout(200);
    const anchor = await workspace.locator('article').evaluateAll(nodes => {
      const top = document.querySelector('.news-workspace').getBoundingClientRect().top;
      const node = nodes.find(item => item.getBoundingClientRect().top >= top);
      return { url: node.dataset.newsId, top: node.getBoundingClientRect().top };
    });
    const beforePoll = requests.length;
    revision = 1;
    await page.clock.fastForward(30050);
    await page.waitForFunction(() => document.querySelector('.news-list h2').textContent.includes('Fresh headline 1'));
    assert.ok(requests.length > beforePoll, 'A visible feed refreshes every 30 seconds');
    assert.ok(await workspace.evaluate(el => el.scrollTop > 800));
    const afterTop = await workspace.locator(`article[data-news-id="${anchor.url}"]`).evaluate(el => el.getBoundingClientRect().top);
    assert.ok(Math.abs(afterTop - anchor.top) < 8, 'Incoming stories preserve the reading position');
    await workspace.evaluate(el => { el.scrollTop = 0; });
    await refresh.click();
    await page.waitForFunction(() => !document.querySelector('.news-header button').disabled);
    assert.equal(requests.at(-1).searchParams.get('refresh'), '1');

    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const beforeHidden = requests.length;
    await page.clock.fastForward(30050);
    assert.equal(requests.length, beforeHidden, 'Hidden tabs do not poll');
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => !document.querySelector('.news-header button').disabled);
    assert.ok(requests.length > beforeHidden, 'Returning to News refreshes immediately');
    outage = true;
    await refresh.click();
    await workspace.getByText('Refresh unavailable · saved news', { exact: true }).waitFor();
    assert.equal(await workspace.locator('article').count(), 46);
    outage = false; revision = 2;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => document.querySelector('.news-list h2').textContent.includes('Fresh headline 2'));
    assert.equal(await workspace.getByText('Refresh unavailable · saved news', { exact: true }).count(), 0);
    console.log('News auto/manual refresh, return-to-app refresh, saved fallback and recovery verified.');

    for (const width of [320, 390, 768, 940, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await workspace.evaluate(el => { el.scrollTop = 0; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page fits ${width}px`);
      assert.ok(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight > el.clientHeight), `Scrollable feed fits ${width}px`);
      await workspace.locator('article').last().scrollIntoViewIfNeeded();
      assert.ok(await workspace.locator('article').last().evaluate(el => { const rect = el.getBoundingClientRect(); const pane = document.querySelector('.news-workspace').getBoundingClientRect(); return rect.bottom <= pane.bottom + 1; }), `Last headline reachable at ${width}px`);
      await workspace.evaluate(el => { el.scrollTop = 0; });
      if (process.env.NEWS_SCREENSHOT && width === 390) await page.screenshot({ path: process.env.NEWS_SCREENSHOT });
    }
    await page.getByRole('button', { name: 'Use neon dark theme', exact: true }).click();
    if (process.env.NEWS_SCREENSHOT) await page.screenshot({ path: process.env.NEWS_SCREENSHOT.replace('.png', '-dark.png') });
    await workspace.getByRole('button', { name: 'Open RELIANCE chart', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.terminal-shell').dataset.section === 'trade' && new URL(location.href).searchParams.get('symbol') === 'RELIANCE');
    assert.deepEqual(errors, []);
    console.log('News verified: compact UI, touch scrolling, filters, fresh-first ordering, 30-second refresh, scroll anchoring, visibility/reconnect recovery, five viewport sizes, light/dark and stock chart handoff.');
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
