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
    const apiFixture=async route => {
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
    };
    await page.route('**/api/**',apiFixture);
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3264');
    await page.locator('.main-nav').waitFor();
    await page.locator('.main-nav').getByRole('button',{name:'Trade',exact:true}).count().then(async n=>{if(n)await page.locator('.main-nav').getByRole('button',{name:'Trade',exact:true}).click();else await page.locator('.main-nav button').filter({hasText:/^Charts$/}).click();});
    await page.locator('.workspace.section-trade').waitFor();
    await page.waitForTimeout(1200);
    const styleLink='link[href*="tradingview-desktop.css"]';await page.locator(styleLink).waitFor({state:'attached'});
    const styles=(target=page)=>target.locator('.terminal-shell').evaluate(root=>Array.from(root.querySelectorAll('*')).filter(e=>e instanceof HTMLElement&&e.getClientRects().length).map(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,cls:e.className,rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100),style:['display','position','color','backgroundColor','fontFamily','fontSize','fontWeight','padding','margin','gap','border','borderRadius','overflow','flexDirection','gridTemplateColumns','width','height','minHeight','maxWidth'].map(k=>c[k])};}));
    const setSheet=async(disabled,target=page)=>{await target.locator(styleLink).evaluate((el,v)=>el.sheet.disabled=v,disabled);await target.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
    async function assertUnchanged(label,target=page){await setSheet(true,target);const baseline=await styles(target);await setSheet(false,target);assert.deepEqual(await styles(target),baseline,label+' keeps existing computed layout/colors');}
    for(const width of [941,1024,1366,1440,1920]){
      await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
      const boxes=await page.evaluate(()=>['.topbar','.workspace.section-trade','.chart-controls','.desktop-chart-rail'].map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,x:r.x,y:r.y,w:r.width,h:r.height,scroll:e.scrollWidth,client:e.clientWidth};}));
      for(const b of boxes){assert.ok(b.x>=-1&&b.x+b.w<=width+1,JSON.stringify({width,...b}));assert.ok(b.scroll<=b.client+2,JSON.stringify({width,...b}));}
      assert.equal(await page.getByRole('button',{name:'Functions',exact:true}).isVisible(),true);
      await page.getByRole('button',{name:'Toggle paper trade ticket'}).click();await page.locator('.order-ticket').waitFor();const ticket=await page.locator('.order-ticket').boundingBox();assert.ok(ticket.x>=0&&ticket.x+ticket.width<=width+1&&ticket.y+ticket.height<=901,'Ticket fits '+width);await page.getByRole('button',{name:'Toggle paper trade ticket'}).click();
      const watch=page.locator('.desktop-chart-rail').getByRole('button',{name:'Watchlist',exact:true});await watch.click();await page.locator('.watchlist-panel.mobile-open').waitFor();const watchBox=await page.locator('.watchlist-panel.mobile-open').boundingBox();assert.ok(watchBox.x>=0&&watchBox.x+watchBox.width<=width+1,'Watchlist fits '+width);if(width===1440)await page.screenshot({path:'outputs/tradingview-desktop-light.png'});await watch.click();
    }
    await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'Use neon dark theme',exact:true}).click();await page.waitForTimeout(150);assert.equal(await page.locator('.terminal-shell').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(15, 15, 15)');await page.locator('.desktop-chart-rail').getByRole('button',{name:'Watchlist',exact:true}).click();await page.screenshot({path:'outputs/tradingview-desktop-dark.png'});await page.locator('.desktop-chart-rail').getByRole('button',{name:'Watchlist',exact:true}).click();
    await page.getByRole('button',{name:'Functions',exact:true}).click();await page.getByRole('dialog',{name:'Functions',exact:true}).getByRole('button',{name:'Pine Editor',exact:true}).click();await page.getByRole('dialog',{name:'Pine Editor',exact:true}).waitFor();await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Open drawing tools',exact:true}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
    // Whole-page CSS comparison below the existing mobile boundary, in both themes.
    for(const width of [390,768,940]){await page.setViewportSize({width,height:900});await page.waitForTimeout(180);await assertUnchanged('Mobile '+width);if(width===390){await page.screenshot({path:'outputs/tradingview-mobile-preserved.png'});await page.locator('.theme-toggle').evaluate(e=>e.click());await assertUnchanged('Mobile light');await page.locator('.theme-toggle').evaluate(e=>e.click());}}
    // Native host remains outside the desktop theme even with a wide fine-pointer viewport.
    await page.setViewportSize({width:1440,height:900});await page.locator('.terminal-shell').evaluate(e=>e.dataset.platform='android');await page.waitForTimeout(150);await assertUnchanged('Native wide');await page.locator('.theme-toggle').evaluate(e=>e.click());await assertUnchanged('Native wide light');await page.locator('.theme-toggle').evaluate(e=>e.click());await page.screenshot({path:'outputs/tradingview-native-preserved.png'});await page.locator('.terminal-shell').evaluate(e=>e.dataset.platform='web');
    await page.locator('.main-nav').getByRole('button',{name:'Home',exact:true}).click();await page.locator('.home-workspace').waitFor();await assertUnchanged('Home desktop');
    const touch=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true,isMobile:true});await touch.route('**/api/**',apiFixture);await touch.addInitScript(()=>{try{localStorage.setItem('papertrade-theme','neon')}catch{}});await touch.goto(process.env.TEST_BASE_URL||'http://localhost:3264');await touch.locator('.main-nav').waitFor();await touch.locator('.main-nav button').filter({hasText:/^Charts$/}).click();await touch.locator('.workspace.section-trade').waitFor();await touch.waitForTimeout(1200);assert.equal(await touch.evaluate(()=>matchMedia('(hover: hover) and (pointer: fine)').matches),false);await assertUnchanged('Wide touch-only browser',touch);await touch.close();
    assert.deepEqual(errors,[]);console.log('Desktop TradingView theme checks passed:941–1920 layouts, order ticket, Functions/Pine/drawing tools, light/dark; exact CSS isolation at390/768/940/native-wide/Home.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
