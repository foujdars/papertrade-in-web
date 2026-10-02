// Runs the real dashboard and wallet hook with isolated storage and public-feed mocks.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = 1800000000000;
const walletKey = "papertrade-perpetual-wallet-v1:guest";
(async () => {
  let launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const module = require(process.env.CHROMIUM_PACKAGE), packaged = module.default || module;
    launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args };
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*.supabase.co/**", r => r.abort());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/global-markets") return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [] } });
      const symbol = url.searchParams.get("symbol");
      const now = await page.evaluate(() => Date.now());
      const spec = { symbol, lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
      const quote = { symbol, last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
      const seconds = url.searchParams.get("timeframe") === "1m" ? 60 : 300;
      const current = Math.floor(now / 1000 / seconds) * seconds;
      const candles = Array.from({ length: 35 }, (_, i) => {
        const time = current - (34 - i) * seconds;
        const close = now > base + 60000 && time === base / 1000 ? 110 : 100;
        return { time, open: close, high: close + .5, low: close - .5, close, volume: 100 };
      });
      return route.fulfill({ json: { ok: true, kind: "perpetual", spec, quote, candles, fetchedAt: now } });
    });
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(process.env.TEST_BASE_URL || "http://localhost:3232"); break; }
      catch (e) { if (attempt >= 59) throw e; await page.waitForTimeout(1000); }
    }
    await page.locator(".mobile-bottom-nav").waitFor({ timeout: 60000 });
    console.log("Dashboard loaded");
    assert.deepEqual(await page.locator(".mobile-bottom-nav button").allTextContents(), ["Home", "Charts", "F&O", "Watchlist", "IPO", "P&L", "Bot"]);
    await page.getByRole("button", { name: "Bot", exact: true }).last().click();
    await page.getByRole("heading", { name: "Paper trading bot" }).waitFor();
    console.log("Bot workspace opened");
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.wallet, walletKey);
    assert.equal(await page.locator(".bot-assets button").count(), 4);
    await page.clock.install({ time: new Date(base + 1000) });
    await page.getByLabel("Strategy", { exact: true }).selectOption("breakout");
    await page.getByLabel("Candle timeframe").selectOption("1m");
    await page.getByLabel("Breakout lookback").fill("10");
    await page.getByRole("button", { name: "Save & start bot" }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.bots?.[0]?.enabled, walletKey);
    console.log("Bot enabled");
    await page.clock.fastForward(61000);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.positions?.length === 1, walletKey);
    console.log("Automatic entry saved");
    const opened = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), walletKey);
    assert.equal(opened.positions[0].botId, "BTCUSD");
    assert.equal(opened.positions[0].protection.stopLoss.trigger, 108.9);
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).events.filter(e => e.kind === "OPEN").length, walletKey), 1);
    await page.getByRole("button", { name: "Pause this bot" }).click();
    await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key)).bots[0].enabled, walletKey);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).positions.length, walletKey), 1);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.locator(".bot-workspace").evaluate(e => e.scrollWidth <= e.clientWidth + 1), `Bot fits ${width}px`);
      const nav = width < 761 ? ".mobile-bottom-nav" : ".main-nav";
      assert.equal(await page.locator(`${nav} button`).last().innerText(), "Bot");
    }
    if (process.env.BOT_SCREENSHOT) await page.screenshot({ path: process.env.BOT_SCREENSHOT, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator(".mobile-bottom-nav").waitFor();
    await page.getByRole("button", { name: "Bot", exact: true }).last().click();
    assert.equal(await page.getByLabel("Strategy", { exact: true }).inputValue(), "breakout");
    await page.getByRole("button", { name: "Close position & pause" }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).positions.length === 0, walletKey);
    await page.getByRole("button", { name: "View Global P&L" }).click();
    await page.locator(".pnl-analytics").waitFor();
    assert.match(await page.locator(".pnl-analytics").innerText(), /\$/);
    assert.deepEqual(errors, []);
    console.log("Bot browser checks pass: last-tab placement, four assets, automatic protected entry, duplicate prevention, pause, four widths, persistence, close and USD P&L.");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
