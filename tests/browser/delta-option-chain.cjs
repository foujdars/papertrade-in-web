/* eslint-disable @typescript-eslint/no-require-imports -- Browser harness uses an external Playwright package. */
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const origin = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const expiries = ["2034-11-28T12:00:00.000Z", "2034-12-05T12:00:00.000Z"];
const strikes = Array.from({ length: 25 }, (_, index) => 57_000 + index * 200);
const listings = expiries.flatMap((expiry, index) => strikes.flatMap(strike => ["CE", "PE"].map(optionType => {
  const symbol = (optionType === "CE" ? "C" : "P") + "-BTC-" + strike + "-" + (index ? "051234" : "281134");
  return { symbol, name: symbol, exchange: "DELTA", instrumentKey: "DELTA|" + symbol, assetType: "OPTION",
    optionType, expiry, strikePrice: strike, underlyingSymbol: "BTC", categories: ["GLOBAL", "CRYPTO"], price: 100, change: 0 };
})));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const [width, height] of [[320, 568], [390, 844], [768, 900], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900 });
      page.setDefaultTimeout(12_000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/**", route => {
        const { searchParams } = new URL(route.request().url());
        const mode = searchParams.get("mode");
        const send = data => route.fulfill({ json: { ok: true, ...data } });
        if (mode === "catalog") return send({ instruments: listings });
        if (mode === "crypto-option-roots") return send({ roots: ["BTC"] });
        if (mode === "token-option-roots") return send({ roots: [] });
        if (mode === "spread-chain") {
          const series = searchParams.get("series");
          if (!series) return send({ series: expiries.map(id => ({ id, expiry: id })) });
          return send({ reference: 59_400, contracts: listings.filter(listing => listing.expiry === series).map(listing => ({
            id: listing.symbol, strike: listing.strikePrice, kind: listing.optionType, series,
            bid: 98.5, ask: 101.25, last: 100, multiplier: .001,
          })) });
        }
        return send({ quotes: {}, candles: [], instruments: [], roots: [], underlyings: [], connected: false });
      });
      const selected = listings.find(row => row.strikePrice === 59_400 && row.optionType === "CE");
      await page.addInitScript(instrument => localStorage.setItem("papertrade-last-chart", JSON.stringify({
        instrument, symbol: instrument.symbol, workspaceMode: "trade", timeframe: "5m",
      })), selected);
      const insets = width === 320 ? { top: 30, bottom: 24 } : { top: 16, bottom: 12 };
      if (width === 320) {
        const session = await page.context().newCDPSession(page);
        await session.send("Emulation.setSafeAreaInsetsOverride", { insets });
      }
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      if (width === 390) await page.getByRole("button", { name: "Use neon dark theme" }).click();
      const nav = page.locator(width < 941 ? ".mobile-bottom-nav" : ".main-nav");
      await nav.getByRole("button", { name: "Charts", exact: true }).click();
      const trigger = page.getByRole("button", { name: /Open .* option charts/ }).first();
      await trigger.click();

      const dialog = page.getByRole("dialog", { name: "Delta option chain" });
      const close = dialog.getByRole("button", { name: "Close option chain" });
      const book = dialog.getByRole("region", { name: "Option chain prices" });
      await dialog.getByRole("button", { name: "Buy 59,400 call at 101.25" }).waitFor();
      assert.ok(await close.evaluate(el => document.activeElement === el));
      const expiry = dialog.getByLabel("Expiry (IST)", { exact: true });
      assert.match(await expiry.locator("option").first().textContent(), /28 Nov 34, 17:30/);
      assert.ok(await expiry.evaluate(el => {
        const text = document.createElement("canvas").getContext("2d");
        const style = getComputedStyle(el);
        text.font = [style.fontWeight, style.fontSize, style.fontFamily].join(" ");
        return text.measureText(el.selectedOptions[0].text).width <= el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      }), "The selected expiry and time fit in the control");
      assert.ok(await dialog.evaluate((el, insets) => {
        const box = el.getBoundingClientRect();
        return box.top >= insets.top && box.bottom <= innerHeight - insets.bottom && Math.abs(box.left - (innerWidth - box.right)) < 1
          && el.scrollWidth <= el.clientWidth + 1;
      }, insets), `The option chain is centered and clear of the viewport edges at ${width}px`);
      assert.ok(await book.evaluate(el => {
        const row = el.querySelector('tr[data-atm="true"]').getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        return el.clientHeight >= 220 && row.top >= bounds.top && row.bottom <= bounds.bottom && el.scrollWidth <= el.clientWidth + 1;
      }), `ATM is visible in a contained order book at ${width}px`);
      assert.equal(await dialog.getByRole("button", { name: "Open 59,400 call chart" }).getAttribute("aria-pressed"), "true");
      const columns = book.getByRole("columnheader");
      assert.deepEqual(await columns.allTextContents(), ["CallsBuy ask · Sell bid", "Strike USD", "PutsBuy ask · Sell bid"]);
      await book.evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.ok(await book.evaluate(el => {
        const header = el.querySelector("thead th").getBoundingClientRect();
        const lastRow = el.querySelector("tbody tr:last-child").getBoundingClientRect();
        const bounds = el.getBoundingClientRect();
        return Math.abs(header.top - bounds.top) < 2 && lastRow.bottom <= bounds.bottom + 1;
      }), "Column headings remain sticky and the last row is reachable");
      await expiry.selectOption(expiries[1]);
      await dialog.getByRole("button", { name: "Sell 59,400 put at 98.5" }).waitFor();
      const refreshed = page.waitForResponse(response => response.url().includes("mode=spread-chain") && response.ok());
      await dialog.getByRole("button", { name: "Refresh option quotes" }).click();
      await refreshed;
      const strategy = dialog.getByRole("button", { name: "Open Strategy Builder" });
      await strategy.click();
      const builder = page.getByRole("dialog", { name: "Option Strategy Builder" });
      await builder.waitFor();
      await page.keyboard.press("Escape");
      await builder.waitFor({ state: "hidden" });
      assert.ok(await strategy.evaluate(el => document.activeElement === el));
      await dialog.getByRole("button", { name: "Open 59,400 put chart" }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS: Delta option dialog placement, alignment, scrolling, expiry, refresh, Strategy Builder and chart selection at 320–1440px.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
