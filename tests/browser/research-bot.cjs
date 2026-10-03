// Real production pages with deterministic public-feed mocks and isolated wallet storage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
(async () => {
  let launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const module = require(process.env.CHROMIUM_PACKAGE), packaged = module.default || module;
    launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], walletKey = "papertrade-perpetual-wallet-v1:guest";
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*.supabase.co/**", r => r.abort());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()), now = Date.now();
      if (url.pathname === "/api/research/daily") return route.fulfill({ json: { ok: true, stale: false, data: JSON.parse(fs.readFileSync("public/research/daily.json")) } });
      if (url.pathname !== "/api/global-markets") return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [] } });
      const symbol = url.searchParams.get("symbol"), seconds = url.searchParams.get("timeframe") === "1m" ? 60 : 300;
      const current = Math.floor(now / 1000 / seconds) * seconds;
      const spec = { symbol, lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
      const quote = { symbol, last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
      const candles = Array.from({ length: 180 }, (_, i) => { const close = 100 + Math.sin(i / 5) * 5; return { time: current - (180 - i) * seconds, open: close, high: close + 1, low: close - 1, close, volume: 100 }; });
      return route.fulfill({ json: { ok: true, kind: "perpetual", spec, quote, candles, fetchedAt: now } });
    });
    await page.goto(process.env.TEST_BASE_URL || "http://localhost:3232");
    await page.locator(".mobile-bottom-nav").waitFor();
    await page.getByRole("button", { name: "Bot", exact: true }).last().click();
    await page.getByRole("heading", { name: "Paper trading bot" }).waitFor();
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.wallet, walletKey);
    await page.getByText("Wallet risk limits · Off", { exact: true }).click();
    await page.getByLabel("Apply limits to bot and manual perpetual entries").check();
    await page.getByRole("button", { name: "Save wallet limits", exact: true }).click();
    await page.getByText("Wallet risk limits · On", { exact: true }).waitFor();
    await page.getByText("Risk sizing, market filters & automatic exits", { exact: true }).click();
    await page.getByLabel("Size method", { exact: true }).selectOption("risk");
    await page.getByLabel("Stop method", { exact: true }).selectOption("atr");
    await page.getByLabel("First partial exit (%)", { exact: true }).fill("35");
    await page.getByLabel("Second partial exit (%)", { exact: true }).fill("35");
    await page.getByLabel("Move to breakeven at R (0 off)", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Save & start bot", exact: true }).click();
    await page.getByRole("button", { name: "Pause this bot", exact: true }).click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), walletKey);
    assert.equal(saved.bots[0].sizingMode, "risk"); assert.equal(saved.bots[0].stopMode, "atr"); assert.equal(saved.bots[0].firstExitPercent, 35);
    await page.getByText("Backtest & compare this strategy", { exact: true }).click();
    await page.getByRole("button", { name: "Run historical comparison", exact: true }).click();
    await page.getByRole("columnheader", { name: "These settings", exact: true }).waitFor();
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), walletKey);
    assert.deepEqual(after.events, saved.events); assert.equal(after.wallet, saved.wallet); assert.deepEqual(after.positions, saved.positions);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.locator(".bot-workspace").evaluate(e => e.scrollWidth <= e.clientWidth + 1), `Bot fits ${width}px`);
    }
    await page.reload();
    await page.getByRole("button", { name: "Bot", exact: true }).last().click();
    await page.getByText("Wallet risk limits · On", { exact: true }).waitFor();
    await page.getByText("Risk sizing, market filters & automatic exits", { exact: true }).click();
    assert.equal(await page.getByLabel("Size method", { exact: true }).inputValue(), "risk");
    await page.getByRole("button", { name: "View Global P&L", exact: true }).click();
    await page.locator(".pnl-analytics .equity-history").waitFor();
    await page.goto((process.env.TEST_BASE_URL || "http://localhost:3232") + "/research");
    await page.locator(".research-stock").first().waitFor();
    assert.equal(await page.locator(".research-stock").count(), 20);
    await page.getByLabel("Find stock or sector").fill("RELIANCE");
    assert.equal(await page.locator(".research-stock").count(), 1);
    await page.locator(".research-stock summary").click();
    await page.getByRole("heading", { name: "Dated news sentiment" }).waitFor();
    assert.ok(await page.locator(".research-news a").count() > 0);
    assert.match(await page.locator(".research-stock-body").innerText(), /Screener reports/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Research fits ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".research-news li").last().scrollIntoViewIfNeeded();
    assert.ok(await page.locator(".research-news li").last().evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), "Mobile research scroll reaches the last dated headline");
    await page.locator(".research-workspace").evaluate(e => { e.scrollTop = 0; });
    if (process.env.RESEARCH_SCREENSHOT) await page.screenshot({ path: process.env.RESEARCH_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Research browser checks pass: risk persistence, advanced strategy controls, isolated backtest, equity, dated fundamentals/news, filters and four viewport widths.");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
