// Runs the real dashboard and wallet hook with isolated storage and public-feed mocks.
/* eslint-disable @typescript-eslint/no-require-imports -- This executable browser harness loads runtime-selected CommonJS packages. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = 1800000000000;
const walletKey = "papertrade-perpetual-wallet-v1:guest";
(async () => {
  let launch = { headless: true };
  if (process.env.CHROMIUM_PACKAGE) {
    const browserPackage = require(process.env.CHROMIUM_PACKAGE), packaged = browserPackage.default || browserPackage;
    launch = { ...launch, executablePath: await packaged.executablePath(), args: packaged.args.filter(arg => arg !== "--single-process") };
  }
  const browser = await chromium.launch(launch);
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(15000);
    const errors = [];
    let emaMode = false;
    let mark = 110;
    let stallHistory = false;
    const stalledRoutes = [];
    const requestedFrames = new Set();
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*.supabase.co/**", r => r.abort());
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/api/global-markets") return route.fulfill({ json: { ok: true, quotes: {}, candles: [], underlyings: [], instruments: [] } });
      const symbol = url.searchParams.get("symbol");
      if (stallHistory && url.searchParams.get("mode") === "candles") { stalledRoutes.push(route); return; }
      const now = await page.evaluate(() => Date.now());
      const spec = { symbol, lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
      const quote = { symbol, last: mark, mark, index: mark, bid: mark - .01, ask: mark, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
      const frame = url.searchParams.get("timeframe") || "5m";
      if (url.searchParams.get("mode") === "candles") requestedFrames.add(frame);
      const seconds = { "1m": 60, "3m": 180, "5m": 300, "15m": 900, "1H": 3600 }[frame];
      const current = Math.floor(now / 1000 / seconds) * seconds;
      const candles = Array.from({ length: 35 }, (_, i) => {
        const time = current - (34 - i) * seconds;
        const signal = emaMode ? time === (frame === "1H" ? base / 1000 - 3600 : base / 1000 + 900 - seconds) : now > base + 60000 && time === base / 1000;
        const close = signal ? 110 : 100;
        return emaMode && signal ? { time, open: 105, high: 112, low: 104, close, volume: 100 } : { time, open: close, high: close + .5, low: close - .5, close, volume: 100 };
      });
      return route.fulfill({ json: { ok: true, kind: "perpetual", spec, quote, candles, fetchedAt: now } });
    });
    for (let attempt = 0; ; attempt++) {
      try { await page.goto(process.env.TEST_BASE_URL || "http://localhost:3232"); break; }
      catch (e) { if (attempt >= 59) throw e; await page.waitForTimeout(1000); }
    }
    await page.locator(".mobile-bottom-nav").waitFor({ timeout: 60000 });
    console.log("Dashboard loaded");
    assert.deepEqual(await page.locator(".mobile-bottom-nav button").allTextContents(), ["Home", "Charts", "Watchlist", "News", "IPO", "Analysis", "P&L"]);
    await page.getByRole("button", { name: "Bot", exact: true }).first().click();
    await page.getByRole("heading", { name: "Trading bot" }).waitFor();
    console.log("Bot workspace opened");
    await page.waitForFunction(key => !!JSON.parse(localStorage.getItem(key))?.wallet, walletKey);
    assert.equal(await page.locator(".bot-assets button").count(), 4);
    await page.clock.install({ time: new Date(base + 1000) });
    await page.getByLabel("Strategy", { exact: true }).selectOption("breakout");
    await page.getByLabel("Entry timeframe 1m", { exact: true }).check();
    await page.getByLabel("Entry timeframe 5m", { exact: true }).uncheck();
    await page.getByLabel("Breakout lookback").fill("10");
    await page.getByRole("button", { name: "Start bot" }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.bots?.[0]?.enabled, walletKey);
    console.log("Bot enabled");
    await page.clock.fastForward(61000);
    await page.clock.runFor(10000);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.positions?.length === 1, walletKey);
    console.log("Automatic entry saved");
    const opened = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), walletKey);
    assert.equal(opened.positions[0].botId, "BTCUSD");
    assert.equal(opened.positions[0].protection.stopLoss.trigger, 108.9);
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).events.filter(e => e.kind === "OPEN").length, walletKey), 1);
    await page.getByRole("button", { name: "Pause entries" }).click();
    await page.waitForFunction(key => !JSON.parse(localStorage.getItem(key)).bots[0].enabled, walletKey);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).positions.length, walletKey), 1);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      if (!(await page.locator(".bot-workspace").evaluate(e => e.scrollWidth <= e.clientWidth + 1))) {
        await page.screenshot({path:'/tmp/bot-overflow.png', fullPage:true});
        console.log(await page.locator('.bot-workspace').evaluate(e => [...e.querySelectorAll('*')].filter(c=>c.getBoundingClientRect().right>e.getBoundingClientRect().right).slice(0,15).map(c=>({tag:c.tagName,cls:c.className,width:c.getBoundingClientRect().width,text:c.textContent.slice(0,40)}))));
      }
      assert.ok(await page.locator(".bot-workspace").evaluate(e => e.scrollWidth <= e.clientWidth + 1), `Bot fits ${width}px`);

    }
    if (process.env.BOT_SCREENSHOT) { await page.locator(".bot-workspace").evaluate(el => el.scrollTop = 0); await page.screenshot({ path: process.env.BOT_SCREENSHOT, fullPage: true }); }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.locator(".mobile-bottom-nav").waitFor();
    await page.getByRole("button", { name: "Bot", exact: true }).first().click();
    assert.equal(await page.getByLabel("Strategy", { exact: true }).inputValue(), "breakout");
    await page.getByRole("button", { name: "Exit trade & pause" }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).positions.length === 0, walletKey);
    emaMode = true;
    await page.getByRole("button", { name: "EMA 21", exact: true }).click();
    assert.equal(await page.getByLabel("Strategy", { exact: true }).inputValue(), "ema21");
    await page.getByRole("button", { name: "EMA 5 reversal", exact: true }).click();
    assert.equal(await page.getByLabel("Trade direction").inputValue(), "long");
    assert.equal(await page.getByLabel("Exit plan").inputValue(), "signal");
    assert.ok(await page.getByLabel("Entry timeframe 5m", { exact: true }).isChecked());
    assert.ok(await page.getByLabel("Entry timeframe 15m", { exact: true }).isChecked());
    await page.getByLabel("Entry timeframe 1m", { exact: true }).check();
    await page.getByLabel("Entry timeframe 3m", { exact: true }).check();
    assert.ok(await page.getByLabel("Entry timeframe 30m", { exact: true }).isDisabled());
    await page.getByLabel("Entry timeframe 1m", { exact: true }).uncheck();
    await page.getByLabel("Entry timeframe 3m", { exact: true }).uncheck();
    await page.getByText("Trend filter", { exact: true }).click();
    await page.getByLabel("Trend timeframe").selectOption("1H");
    await page.getByLabel("Trade sizing").selectOption("risk");
    await page.getByLabel("Planned stop risk per trade (USD)").fill("5");
    await page.getByRole("button", { name: "Check latest setup" }).click();
    await page.getByLabel("Latest setup preview").waitFor();
    assert.equal(await page.getByLabel("Latest setup preview").locator("li").count(), 2);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).positions.length, walletKey), 0);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).bots[0].enabled, walletKey), false);
    await page.getByRole("button", { name: "Start bot" }).click();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).bots[0].strategy === "ema5" && JSON.parse(localStorage.getItem(key)).bots[0].enabled, walletKey);
    const savedAt = await page.evaluate(() => Date.now());
    await page.clock.fastForward(base + 906000 - savedAt);
    await page.clock.runFor(15000);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).positions.length === 1, walletKey);
    const emaEntry = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), walletKey);
    assert.equal(emaEntry.positions[0].contracts, 83);
    assert.equal(emaEntry.positions[0].protection.stopLoss.trigger, 103.99);
    assert.equal(emaEntry.positions[0].protection.takeProfit.trigger, 122.02);
    assert.deepEqual(emaEntry.bots[0].timeframes, ["5m", "15m"]);
    assert.equal(emaEntry.bots[0].trendTimeframe, "1H");
    assert.ok(emaEntry.bots[0].decisions.some(d => d.timeframe === "15m" && d.outcome === "entered"));
    assert.ok(emaEntry.bots[0].decisions.some(d => d.timeframe === "5m" && d.outcome === "skipped"));
    assert.ok(["5m", "15m", "1H"].every(frame => requestedFrames.has(frame)));
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).events.filter(e => e.kind === "OPEN").length, walletKey), 2);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.locator(".bot-workspace").evaluate(e => e.scrollWidth <= e.clientWidth + 1), `EMA strategy fits ${width}px`);
    }
    stallHistory = true;
    await page.clock.runFor(11000);
    mark = 125;
    await page.clock.runFor(6000);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).positions.length === 0, walletKey);
    const targetExit = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).events.at(-1), walletKey);
    assert.equal(targetExit.botId, "BTCUSD");
    assert.equal(targetExit.kind, "CLOSE");
    assert.match(targetExit.detail, /take.?profit|target/i);
    console.log("Automatic target exited while candle requests were stalled");
    stallHistory = false;
    for (const route of stalledRoutes) await route.abort().catch(() => {});
    await page.reload();
    await page.locator(".main-nav").waitFor();
    await page.getByRole("button", { name: "Bot", exact: true }).first().click();
    assert.equal(await page.getByLabel("Strategy", { exact: true }).inputValue(), "ema5");
    assert.equal(await page.getByLabel("Trade sizing").inputValue(), "risk");
    assert.equal(await page.getByLabel("Trend timeframe").inputValue(), "1H");
    if (process.env.BOT_SCREENSHOT) { await page.locator(".bot-workspace").evaluate(el => el.scrollTop = 0); await page.screenshot({ path: process.env.BOT_SCREENSHOT, fullPage: true }); }
    await page.getByRole("button", { name: "Trade history" }).click();
    await page.locator(".pnl-analytics").waitFor();
    assert.match(await page.locator(".pnl-analytics").innerText(), /\$/);
    assert.deepEqual(errors, []);
    console.log("Bot browser checks pass: presets, multi-timeframe entry and priority, HTF filter, risk sizing, preview without orders, four-frame limit, decision log, duplicate prevention, pause, four widths, persistence, close and USD P&L.");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
