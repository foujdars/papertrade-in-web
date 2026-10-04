const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const server = process.env.START_TEST_SERVER ? require('node:child_process').spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3228', '--hostname', '127.0.0.1'], { stdio: 'pipe' }) : null;
  if (server) {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { const response = await fetch('http://127.0.0.1:3228'); if (response.ok) break; } catch {}
      if (attempt === 59) { server.kill(); throw new Error('Production test server did not start.'); }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  let browser;
  try {
    let launch = { headless: true };
    if (process.env.CHROMIUM_PACKAGE) {
      const mod = require(process.env.CHROMIUM_PACKAGE), packaged = mod.default || mod;
      launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
    }
    browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = [], historyRequests = [];
    if(process.env.TRACE_BACK) {
      page.on('console',m=>{if(m.text().startsWith('BACK'))console.log(m.text());});
      await page.addInitScript(()=>{
        for(const name of ['pushState','replaceState']){const original=history[name].bind(history);history[name]=(...args)=>{console.log('BACK '+name+' '+JSON.stringify(args[0]));return original(...args);};}
        window.addEventListener('popstate',e=>console.log('BACK pop '+JSON.stringify(e.state)),true);
      });
    }
    page.on('pageerror', error => { errors.push(error.message); console.error(error.stack); });
    await page.route('**/*.supabase.co/**', route => route.abort());
    await page.route('https://assets.upstox.com/**', route => route.abort());
    await page.route('**/api/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/market/psbb-scan') {
        const date = new Date(Date.now() + 19800_000).toISOString().slice(0, 10);
        const stamp = Date.parse(`${date}T10:00:00+05:30`) / 1000;
        return route.fulfill({ json: { ok: true, report: { instrumentKey: url.searchParams.get('instrumentKey'), timeframe: url.searchParams.get('timeframe'), date, rows: [{ id: '1', side: 'long', firstTime: stamp - 3600, secondTime: stamp, confirmedTime: stamp + 300 }], lastCandleAt: stamp + 300, coverage: 'available', scannedAt: Date.now() } } });
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
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='watchlist');
    assert.deepEqual(await page.locator('.market-section-tabs').filter({ visible: true }).locator('button').allTextContents(), ['Watchlist', 'Trading', 'Investment']);
    const watchlists = page.getByRole('tablist', { name: 'Watchlists', exact: true });
    assert.ok(await watchlists.isVisible());
    assert.equal(await page.getByRole('button', { name: /^Current watchlist:/ }).count(), 0);
    assert.deepEqual(await watchlists.getByRole('tab').locator('span').allTextContents(), ['NIFTY 50', 'Trading watchlist', 'Indices', 'F&O stocks', 'BANK NIFTY', 'NIFTY 500', 'ALL NSE']);
    await page.getByPlaceholder('Search all NSE stocks').fill('SENSEX');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.search-box input')?.value==='');
    assert.equal(await page.locator('.terminal-shell').getAttribute('data-section'),'watchlist','Back clears search first');
    await watchlists.getByRole('tab').filter({ has: page.locator('span', { hasText: /^Trading watchlist$/ }) }).click();
    await page.getByRole('button',{name:'Refresh 5m',exact:true}).first().click();
    await page.locator('.tw-row').first().waitFor();
    await page.getByLabel('Trading stock universe').selectOption('Indices');
    await page.getByRole('button',{name:'Refresh 5m',exact:true}).first().click();
    await page.getByRole('status').filter({ hasText: '3/3 stocks scanned' }).waitFor();
    await page.getByRole('tab', { name: '4H', exact: true }).click();
    await page.getByRole('button',{name:'Refresh 4H',exact:true}).first().click();
    await page.getByRole('status').filter({ hasText: '3/3 stocks scanned' }).waitFor();
    const last = page.getByRole('button', { name: 'Open SENSEX 4H divergence chart' });
    await last.scrollIntoViewIfNeeded();
    assert.ok(await last.isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Full dashboard fits mobile');
    if (process.env.WATCHLIST_DASHBOARD_SCREENSHOT) await page.screenshot({ path: process.env.WATCHLIST_DASHBOARD_SCREENSHOT });
    await last.click();
    await page.waitForFunction(() => document.querySelector('.terminal-shell')?.dataset.section === 'trade');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('timeframe') === '4H');
    await page.waitForTimeout(700);
    assert.ok(historyRequests.some(request => request.instrumentKey === 'BSE_INDEX|SENSEX' && request.date), 'Chart requests the selected setup date');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='watchlist');
    assert.equal(await page.getByLabel('Trading stock universe').inputValue(),'Indices');
    assert.equal(await page.getByRole('tab',{name:'4H',exact:true}).getAttribute('aria-selected'),'true');
    await page.getByPlaceholder('Search all NSE stocks').fill('SENSEX');
    await last.click();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='trade');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='watchlist');
    assert.equal(await page.getByPlaceholder('Search all NSE stocks').inputValue(),'SENSEX');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.search-box input')?.value==='');
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='markets');
    const marketTabs=page.locator('.market-section-tabs').filter({visible:true});
    await marketTabs.getByRole('button',{name:'Investment',exact:true}).click();
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.market-section-tabs button.active')?.textContent?.includes('Trading'));
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='home');
    await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Charts',exact:true}).click();
    await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Watchlist',exact:true}).click();
    await page.goBack();
    await page.waitForFunction(()=>document.querySelector('.terminal-shell')?.dataset.section==='trade');
    assert.deepEqual(errors, []);
    console.log('Dashboard: Watchlist comes first with visible list tabs, search Back stays in Watchlist, stock-chart Back restores category/timeframe/search, then returns to scanners.');
  } finally { await browser?.close(); server?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
