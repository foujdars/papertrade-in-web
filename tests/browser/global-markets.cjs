const assert = require("node:assert/strict");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*.supabase.co/**", (r) => r.abort());
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/global-markets") {
        const symbol = url.searchParams.get("symbol"),
          prices = { BTCUSD: 100000, ETHUSD: 4000, SOLUSD: 180, XAUTUSD: 4000 },
          ticks = { BTCUSD: 0.5, ETHUSD: 0.05, SOLUSD: 0.0001, XAUTUSD: 0.01 },
          lots = { BTCUSD: 0.001, ETHUSD: 0.01, SOLUSD: 1, XAUTUSD: 0.001 },
          price = prices[symbol] ?? 100000,
          now = Date.now();
        const spec = {
          symbol,
          lot: lots[symbol] ?? 0.001,
          tick: ticks[symbol] ?? 0.5,
          initial: symbol === "BTCUSD" ? 0.005 : 0.01,
          maintenance: symbol === "BTCUSD" ? 0.0025 : 0.005,
          initialScale: 0.000000025,
          maintenanceScale: 0.0000000125,
          scalingThreshold: 100000,
          maxNotional: 5000000,
          maker: 0.0002,
          taker: 0.0005,
          liquidation: 0.0005,
          fundingSeconds: symbol === "XAUTUSD" ? 14400 : 28800,
          operational: true,
          fetchedAt: now,
        };
        const quote = {
          symbol,
          last: price,
          mark: price,
          bid: price - 0.5,
          ask: price,
          bidSize: 10000,
          askSize: 10000,
          funding: 0.0001,
          change: 1,
          at: now,
          operational: true,
        };
        const start = Math.floor(now / 1000 / 300) * 300 - 300 * 100;
        const candles = Array.from({ length: 101 }, (_, i) => ({
          time: start + i * 300,
          open: price - 10 + Math.sin(i) * 5,
          high: price + 10,
          low: price - 20,
          close: price - 5 + Math.sin(i) * 5,
          volume: 100 + i,
        }));
        return route.fulfill({ json: { ok: true, spec, quote, candles } });
      }
      return route.fulfill({
        json: {
          ok: true,
          quotes: {},
          candles: [],
          instruments: [],
          underlyings: [],
        },
      });
    });
    await page.route(
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js",
      (r) =>
        r.fulfill({
          contentType: "application/javascript",
          body: 'document.currentScript.parentElement.dataset.widget="loaded";',
        }),
    );
    await page.goto(process.env.GLOBAL_APP_URL || "http://localhost:3231");
    await page
      .getByRole("heading", { name: "Your trading day" })
      .waitFor({ timeout: 30000 });
    const initial = await page.evaluate(() => [
      localStorage.getItem("papertrade-orders"),
      localStorage.getItem("papertrade-balance"),
    ]);
    await page.getByRole("button", { name: /Bitcoin · Gold · Brent/ }).click();
    await page
      .getByRole("dialog", { name: "Global markets", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Review long order", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Global chart timeframe", exact: true })
      .click();
    await page.getByRole("option", { name: "15m", exact: true }).click();
    await page
      .getByRole("button", { name: "Global chart timeframe", exact: true })
      .click();
    await page.getByRole("option", { name: "5m", exact: true }).click();
    await page.getByRole("button", { name: "Order type", exact: true }).click();
    await page.getByRole("option", { name: /Limit Wait/ }).click();
    await page.getByLabel("Limit price", { exact: true }).fill("99000");
    await page
      .getByRole("button", { name: "Review long order", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm paper order", exact: true })
      .click();
    await page
      .locator(".global-tabs")
      .getByRole("button", { name: "Orders (1)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel order", exact: true })
      .click();
    await page.getByText("No pending orders.", { exact: true }).waitFor();
    await page
      .locator(".global-tabs")
      .getByRole("button", { name: "Chart", exact: true })
      .click();
    await page.getByRole("button", { name: "Order type", exact: true }).click();
    await page.getByRole("option", { name: /Market Use/ }).click();
    await page.getByLabel("Contracts", { exact: true }).fill("2");
    await page.getByLabel("Leverage", { exact: true }).fill("10");
    await page
      .getByRole("button", { name: "Review long order", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm paper order", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem("papertrade-perpetual-wallet-v1:guest") || "{}",
        ).positions?.length === 1,
    );
    await page.getByRole("button", { name: "Positions", exact: true }).click();
    await page.getByText("BTCUSD · Long", { exact: true }).waitFor();
    await page.getByLabel("Close quantity BTCUSD").fill("1");
    await page
      .getByRole("button", {
        name: "Close position · reduce only",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("papertrade-perpetual-wallet-v1:guest"))
          .positions[0].contracts === 1,
    );
    await page
      .locator(".global-tabs")
      .getByRole("button", { name: "P&L", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Crypto & gold · practice P&L" })
      .waitFor();
    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await page.getByRole("button", { name: "Indicators", exact: true }).click();
    await page.getByLabel("Search indicators").fill("RSI");
    await page
      .getByRole("button", {
        name: "Apply Relative Strength Index",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Close functions" }).click();
    await page
      .getByRole("button", { name: "Save instrument", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Price & technical alerts/ })
      .click();
    await page.getByLabel("Global alert threshold").fill("90000");
    await page
      .getByRole("button", { name: "Create global alert", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        JSON.parse(
          localStorage.getItem("papertrade-global-alerts-v1:guest") || "[]",
        ).some((r) => r.triggeredAt),
      {},
      { timeout: 45000 },
    );
    await page
      .getByRole("button", { name: "Gold Perpetual", exact: true })
      .click();
    await page.getByText("Gold · Tether Gold", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Brent Watch only", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /Review .* order/ }).count(),
      0,
    );
    await page.locator('.global-brent-chart[data-widget="loaded"]').waitFor();
    assert.ok(await page.locator('.global-brent-frame').evaluate(e=>e.clientHeight>=500),'Brent has a usable chart height');
    assert.match(
      await page.locator(".global-brent").innerText(),
      /TVC:UKOIL Brent CFD reference/,
    );
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page
          .locator(".global-markets")
          .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        `Overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Bitcoin Perpetual", exact: true })
      .click();
    await page.locator(".global-markets").evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: "outputs/global-markets-mobile.png" });
    await page
      .getByRole("button", { name: "Close global markets", exact: true })
      .click();
    await page
      .getByLabel("Search stocks and indices", { exact: true })
      .fill("gold");
    await page
      .getByRole("button", { name: "Open XAUTUSD chart", exact: true })
      .click();
    await page.getByText("Gold · Tether Gold", { exact: true }).waitFor();
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: "P&L", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Global markets", exact: true })
      .waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Crypto & gold practice P&L", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Crypto & gold · practice P&L" })
      .waitFor();
    assert.deepEqual(
      await page.evaluate(() => [
        localStorage.getItem("papertrade-orders"),
        localStorage.getItem("papertrade-balance"),
      ]),
      initial,
      "Existing portfolio untouched",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Global markets: entry, order, partial close, history, indicators, alert, gold, Brent watch-only, search, navigation, four widths and unchanged NSE stores pass",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
