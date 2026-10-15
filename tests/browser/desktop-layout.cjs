/* eslint-disable @typescript-eslint/no-require-imports -- Optional browser runtime, as in news-dashboard.cjs. */
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const path = require('node:path');

// Run against a local preview with test data, never an authenticated production account.
const surfaces = {
  Home: '.home-workspace', Charts: '.workspace.section-trade',
  Holdings: '.holdings-modal', Orders: '.orders-modal',
  Watchlist: '.workspace.section-watchlist', News: '.news-workspace',
  IPOs: '.ipo-discovery-panel', Analysis: '.fundamental-workspace', 'P&L': '.pnl-modal',
};

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let revision = 0, holdIpos = true;
    const waitingIpos = [];
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const ipos = Array.from({ length: 18 }, (_, i) => ({
      id: `layout-${i}`, symbol: `LAYOUT${i}`, name: `Layout example company ${i + 1} IPO`,
      status: 'open', issueType: 'regular', isin: '', industry: 'Test fixture',
      issueSizeCrore: 500, minimumPrice: 100, maximumPrice: 120,
      biddingStartDate: today, biddingEndDate: tomorrow,
      totalSubscription: 2, gmpAmount: null, gmpPercent: null, gmpUpdatedAt: '',
    }));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/upstox/candles') {
        const start = Date.parse(`${today}T09:15:00+05:30`) / 1000;
        const candles = Array.from({ length: 76 }, (_, i) => { const open = 1300 + i * .5 + Math.sin(i / 6) * 5, close = open + (i % 3 ? 1 : -1); return { time: start + i * 300, open, close, high: Math.max(open,close) + 2, low: Math.min(open,close) - 2, volume: 100000 + i * 1000 }; });
        return route.fulfill({ json: { ok: true, candles, fetchedAt: new Date().toISOString() } });
      }
      // Populated market fixtures catch overflow that empty/loading cards cannot expose.
      if (url.pathname === '/api/market/india-pulse') {
        const session = Date.parse(`${today}T09:15:00+05:30`);
        const tape = Array.from({ length: 60 }, (_, i) => ({ t: session + i * 5 * 60000, advance: 1700 + Math.round(Math.sin(i / 6) * 120), decline: 1300 + Math.round(Math.cos(i / 6) * 130) }));
        const flows = Array.from({ length: 20 }, (_, i) => ({ date: new Date(Date.now() - (20 - i) * 86400000).toISOString().slice(0,10), label: `Day ${i}`, fii: (i % 3 ? -1 : 1) * (800 + i * 80), dii: 1100 + i * 65, nifty: 22000 + i * 25 }));
        return route.fulfill({ json: { ok: true, sessionLive: false, breadth: tape.at(-1), tape, flows, vix: { price: 14.2, change: -.6, changePercent: -4.05 }, vixCheckedAt: Date.now(), pcr: null } });
      }
      if (url.pathname === '/api/market/sector-heat') return route.fulfill({ json: { ok: true, sectors: ['Bank','PSU Bank','IT','Auto','Pharma','FMCG','Metal','Energy'].map((label,i) => ({ id: `sector${i}`, label, change: i % 2 ? .7 : -.8, watch: 'nifty50' })) } });
      if (url.pathname === '/api/market/movers') {
        const names = ['RELIANCE','HDFCBANK','TCS','INFY','ITC','TATAMOTORS','ICICIBANK','LT','MARUTI','SUNPHARMA'];
        const gainers = names.map((symbol,i) => ({ symbol, name: `${symbol} Industries`, change: 5 - i * .3, price: 1322 + i * 90, volume: 1250000 + i * 43000 }));
        return route.fulfill({ json: { ok: true, lists: { gainers, losers: gainers.map(row => ({ ...row, change: -row.change })), active: gainers, volume: gainers, high52: [], low52: [], upper: [], lower: [] } } });
      }
      if (url.pathname === '/api/market/equity-watch') return route.fulfill({ json: { ok: true, rows: Array.from({ length: 20 }, (_,i) => ({ symbol: `EQ${i}`, name: 'Fixture', price: 120, change: i % 3 ? 1 : -1, volume: 10000 })) } });
      if (url.pathname === '/api/upstox/quotes') return route.fulfill({ json: { ok: true, quotes: Object.fromEntries([['NSE_INDEX|Nifty 50',22622.7],['NSE_INDEX|Nifty Bank',55316],['BSE_INDEX|SENSEX',72781.89]].map(([key,price]) => [key,{instrumentKey:key,lastPrice:price,previousClose:price+90,netChange:-90,changePercent:-.4,lastTradeAt:new Date().toISOString(),updatedAt:new Date().toISOString()}])) } });
      if (url.pathname === '/api/market/news') {
        const items = Array.from({ length: 40 }, (_, i) => ({
          title: `RELIANCE business update ${i + 1}: quarterly results and market developments`,
          url: `https://example.com/news/${i}`, source: 'Layout fixture',
          publishedAt: new Date(Date.now() - i * 60000).toISOString(),
          sentiment: ['Positive', 'Negative', 'Neutral'][i % 3], importance: i % 2 ? 3 : 1,
        }));
        if (revision) items.unshift(...[0, 1].map(i => ({ ...items[0], url: `https://example.com/new/${i}`, title: `Fresh headline ${i}`, publishedAt: new Date(Date.now() + 1000).toISOString() })));
        return route.fulfill({ json: { items, updatedAt: new Date().toISOString(), checkedAt: new Date().toISOString(), unavailableSources: [], sourceCount: 4, stale: false } });
      }
      if (url.pathname === '/api/upstox/ipos') {
        if (holdIpos) await new Promise(resolve => waitingIpos.push(resolve));
        return route.fulfill({ json: { ok: true, ipos, partial: false } }).catch(() => {});
      }
      return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [], connected: false } });
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:4317');
    await page.locator('.main-nav').waitFor();
    const open = async name => {
      if (!await page.locator('.main-nav').isVisible()) await page.getByRole('button', { name: 'Open PaperTrade home', exact: true }).click();
      await page.locator('.main-nav button').filter({ hasText: new RegExp(`^${name}$`) }).click();
      await page.locator(surfaces[name]).waitFor();
    };
    const screenshot = async name => {
      if (process.env.DESKTOP_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.DESKTOP_SCREENSHOTS, `${name}.png`) });
    };

    for (const size of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      for (const [name, selector] of Object.entries(surfaces)) {
        await open(name);
        const fits = await page.locator(selector).evaluate(el => {
          const root = el.closest('.navigation-page-backdrop') || el;
          const rect = root.getBoundingClientRect(), nav = document.querySelector('.main-nav').getBoundingClientRect();
          return rect.left >= -1 && rect.top >= nav.bottom - 1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1
            && document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1
            && root.scrollWidth <= root.clientWidth + 1;
        });
        assert.ok(fits, `${name} stays below navigation and inside ${size.width} × ${size.height}`);
        if (name === 'Home') {
          await page.getByRole('tab', { name: 'Explore', exact: true }).click();
          await page.locator('.desktop-stock-row').first().waitFor();
          await page.getByRole('tab', { name: 'Losers', exact: true }).click();
          assert.ok(await page.locator('.desktop-stock-row .negative').count(), 'Mover tabs change the displayed list');
          await page.getByRole('tab', { name: 'Gainers', exact: true }).click();
          assert.equal(await page.locator('.home-sector-heat').isVisible(), false, 'Explore avoids unrelated panels');
          await page.getByRole('tab', { name: 'Breadth & sectors', exact: true }).click();
          assert.ok(await page.locator('.home-sector-heat').isVisible(), 'Breadth tab exposes sectors');
          assert.equal(await page.locator('.desktop-movers').isVisible(), false);
          await page.getByRole('tab', { name: 'F&O insights', exact: true }).click();
          assert.ok(await page.locator('.home-option-pulse').isVisible(), 'Options tools remain available');
          await page.getByRole('tab', { name: 'Flows & deals', exact: true }).click();
          await page.getByRole('button', { name: 'Chart timeline, 1M', exact: true }).click();
          assert.ok(await page.getByRole('listbox', { name: 'Chart timeline' }).evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Flow timeline choices fit the desktop window');
          await page.keyboard.press('Escape');
          for (const tab of ['Explore','Breadth & sectors','F&O insights','Flows & deals']) {
            await page.getByRole('tab', { name: tab, exact: true }).click();
            const nested = await page.locator('.home-dashboard-scroll').evaluate(root => [...root.querySelectorAll('*')].filter(el => el instanceof HTMLElement && el.clientHeight && el.getBoundingClientRect().width && ['auto','scroll'].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2).map(el => el.className));
            assert.deepEqual(nested, [], `${tab} uses only the main scroll at ${size.width}`);
            if (size.width === 1440) await screenshot(`Home-${tab.replace(/[^a-z]/gi,'')}`);
          }
          await page.getByRole('tab', { name: 'Explore', exact: true }).click();
        }
        if (name === 'Charts') {
          assert.equal(await page.locator('.order-ticket').isVisible(), false, 'Terminal opens with a full chart');
          await page.getByRole('button', { name: 'Toggle paper trade ticket' }).click();
          assert.ok(await page.locator('.order-ticket').isVisible(), 'Trade ticket can be opened');
          assert.ok(await page.locator('.chart-controls').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Chart toolbar fits with the order panel open');
          await page.getByRole('button', { name: 'Toggle paper trade ticket' }).click();
          await page.locator('.desktop-chart-rail').getByRole('button', { name: 'Watchlist', exact: true }).click();
          assert.ok(await page.locator('.workspace.section-trade .watchlist-panel').isVisible(), 'Chart watchlist opens without leaving the terminal');
          await page.getByRole('button', { name: 'Close chart watchlist' }).click();
        }
        if (name === 'IPOs') {
          const centered = await page.locator('.ipo-card-list').evaluate(el => {
            const area = el.getBoundingClientRect(), loader = el.querySelector('.welcome-candle-loader').getBoundingClientRect();
            return Math.abs(area.left + area.width / 2 - loader.left - loader.width / 2) < 10
              && Math.abs(area.top + area.height / 2 - loader.top - loader.height / 2) < 50;
          });
          assert.ok(centered, 'IPO loading spans and centres within the content panel');
        }
        if (size.width === 1440) await screenshot(name.replace(/[^a-z]/gi, ''));
      }
    }

    holdIpos = false; waitingIpos.forEach(resolve => resolve());
    await page.setViewportSize({ width: 1366, height: 768 });
    await open('IPOs');
    await page.locator('.ipo-compact-card').first().waitFor();
    await page.locator('.ipo-compact-card').last().scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.ipo-compact-card').last().evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Last IPO is reachable');
    await page.locator('.ipo-compact-card').last().locator('h3 button').click();
    await page.locator('.ipo-detail-studio').waitFor();
    await page.locator('.ipo-timeline-disclosure summary').click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('.ipo-detail-studio').evaluate(el => el.querySelector('.ipo-timeline-disclosure').getBoundingClientRect().bottom <= el.querySelector('.ipo-registrar').getBoundingClientRect().top), 'Expanded timeline does not overlap the registrar panel');
    await page.locator('.ipo-discovery-panel').evaluate(el => el.scrollTop = el.scrollHeight);
    await page.locator('.ipo-detail-studio .ipo-registrar').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.ipo-detail-studio .ipo-registrar').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Expanded IPO details are reachable');
    await screenshot('IPO-detail');
    await page.getByRole('button', { name: 'Back to IPOs' }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await screenshot('IPOs-populated');

    await open('News');
    await page.locator('.news-list article').first().waitFor();
    await page.locator('.news-workspace').evaluate(el => el.scrollTop = 500);
    await page.getByRole('button', { name: 'Positive', exact: true }).click();
    assert.equal(await page.locator('.news-workspace').evaluate(el => el.scrollTop), 0, 'Filter resets the desktop news page');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('.news-workspace').evaluate(el => el.scrollTop = 500);
    const anchor = await page.locator('.news-workspace').evaluate(el => {
      const node = [...el.querySelector('.news-list').children].find(item => item.getBoundingClientRect().top >= el.getBoundingClientRect().top);
      return { id: node.dataset.newsId, top: node.getBoundingClientRect().top };
    });
    revision = 1;
    await page.getByRole('button', { name: 'Refresh news' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.news-list article').length === 42);
    await page.waitForTimeout(100);
    const afterTop = await page.locator(`article[data-news-id="${anchor.id}"]`).evaluate(el => el.getBoundingClientRect().top);
    assert.ok(Math.abs(afterTop - anchor.top) < 8, 'Refreshing with new stories preserves desktop reading position');

    await open('Home');
    await page.locator('.desktop-stock-row').first().click();
    await page.locator('.workspace.section-trade').waitFor();
    assert.match(await page.locator('.desktop-symbol-trigger').innerText(), /RELIANCE/, 'Stock table opens its existing chart');
    await open('Home');
    await page.getByRole('button', { name: /Global markets/ }).click();
    assert.ok(await page.locator('.market-directory').evaluate(el => el.getBoundingClientRect().right <= document.querySelector('.home-main-grid').getBoundingClientRect().left), 'Global directory and portfolio have separate columns');
    await page.getByRole('button', { name: /Indian markets/ }).click();
    await page.locator('.theme-toggle').click();
    await screenshot('Home-dark');
    const nativeStyles = await page.evaluate(() => {
      const shell = document.querySelector('.terminal-shell'); shell.dataset.platform = 'android';
      const read = () => ['.topbar','.main-nav','.home-dashboard-scroll'].map(selector => { const el = document.querySelector(selector), style = getComputedStyle(el), r = el.getBoundingClientRect(); return [selector,style.display,style.gridTemplateColumns,style.padding,r.x,r.y,r.width,r.height]; });
      const before = read(), disabled = [];
      for (const sheet of document.styleSheets) { try { if ([...sheet.cssRules].some(rule => rule.cssText.includes('desktop-explore-tabs') && rule.cssText.includes('[data-platform="web"]'))) { sheet.disabled = true; disabled.push(sheet); } } catch {} }
      const after = read(); disabled.forEach(sheet => sheet.disabled = false); shell.dataset.platform = 'web'; return { before,after };
    });
    assert.deepEqual(nativeStyles.before,nativeStyles.after,'New desktop CSS does not style native app surfaces');
    // Atomic comparisons avoid quote updates or SVG animations between snapshots.
    for (const width of [390, 768, 940]) {
      await page.setViewportSize({ width, height: 844 });
      const comparison = await page.evaluate(() => {
        const snapshot = () => [...document.querySelectorAll('.terminal-shell *')]
          .filter(el => el instanceof HTMLElement && el.getBoundingClientRect().width && el.getBoundingClientRect().height)
          .map(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return [el.tagName, el.className, ...['x', 'y', 'width', 'height'].map(k => Math.round(r[k] * 100) / 100), s.display, s.padding, s.gridTemplateColumns, s.overflow]; });
        const before = snapshot(), disabled = [];
        for (const sheet of document.styleSheets) {
          try { if ([...sheet.cssRules].some(rule => rule.cssText.includes('--desktop-rail'))) { sheet.disabled = true; disabled.push(sheet); } } catch { /* External sheets are unchanged. */ }
        }
        const after = snapshot(); disabled.forEach(sheet => sheet.disabled = false);
        return { before, after };
      });
      assert.deepEqual(comparison.after, comparison.before, `Mobile/tablet layout unchanged at ${width}px`);
    }
    await page.setViewportSize({ width: 1024, height: 480 });
    await page.locator('.main-nav').getByRole('button', { name: 'P&L', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.main-nav').getByRole('button', { name: 'P&L', exact: true }).evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'Navigation remains reachable in a short window');
    assert.deepEqual(errors, []);
    console.log('PASS: desktop tabs and one main scroll, terminal ticket/watchlist, 36 surfaces, IPO loading/details, news anchoring, unchanged mobile widths and short-window navigation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
