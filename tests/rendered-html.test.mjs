import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PaperTrade IN terminal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /PaperTrade IN/);
  assert.match(html, /Interactive TradingView Lightweight Charts candlestick chart/);
  assert.match(html, /Functions/);
  assert.match(html, /pill-count">0</);
  assert.doesNotMatch(html, /EMA 5|EMA 21|RSI 14/);
  assert.match(html, /Broker API/);
  assert.match(html, /No real money/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships project assets and removes the starter preview", async () => {
  const [page, styles, dashboard, chart, functionMenu, advancedChart, market, paperTrading, serverAdapter, candleRoute, quoteRoute, instrumentRoute, volumeBreakoutRoute, volumeBreakout, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ChartFunctionMenu.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AdvancedChartWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/market.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/paper-trading.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/upstox-server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstox/candles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstox/quotes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstox/instruments/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/volume-breakouts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/volume-breakout.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<TradingDashboard \/>/);
  assert.match(dashboard, /calculatePosition/);
  assert.match(advancedChart, /LIVE P&amp;L/);
  assert.match(advancedChart, /exitPosition/);
  assert.match(advancedChart, /Exit quantity/);
  assert.doesNotMatch(advancedChart, /> Candles</);
  assert.match(dashboard, /INTRADAY CLOSED/);
  assert.match(dashboard, /UPSTOX_AUTO_SQUARE_OFF_MINUTES/);
  assert.match(dashboard, /fetchSquareOffPrice/);
  assert.match(dashboard, /corrected from Upstox 3:00 PM candles/);
  assert.match(dashboard, /mini-order-symbol/);
  assert.match(dashboard, /order-symbol-link/);
  assert.doesNotMatch(dashboard, /Auto 3:20/);
  assert.match(dashboard, /5× Volume Watchlist/);
  assert.match(dashboard, /Daily Volume &gt; 5 × SMA\(Volume, 20\)/);
  assert.doesNotMatch(dashboard, /Top Gainers/);
  assert.match(paperTrading, /papertrade-orders/);
  assert.match(paperTrading, /unrealizedPnl/);
  assert.match(dashboard, /Fibonacci/);
  assert.match(dashboard, /Upstox market data/);
  assert.match(chart, /import\("lightweight-charts"\)/);
  assert.match(chart, /attributionLogo: true/);
  assert.doesNotMatch(chart, /Charts by TradingView/);
  assert.match(chart, /lightweight-charts-drawing/);
  assert.match(chart, /DRAWING_TOOL_CATALOG/);
  assert.match(chart, /DrawingManager/);
  assert.match(chart, /function fitStudyPanes/);
  assert.match(chart, /requestedMacdPane = next\.rsi \? 2 : 1/);
  assert.match(styles, /height: calc\(100svh - 122px/);
  assert.match(functionMenu, /EMA 200/);
  assert.match(functionMenu, /VWAP/);
  assert.match(functionMenu, /MACD/);
  assert.match(functionMenu, /Supertrend/);
  assert.match(functionMenu, /Classic Pivots/);
  assert.match(market, /function vwap/);
  assert.match(market, /function macd/);
  assert.match(market, /function supertrend/);
  assert.match(market, /function classicPivotPoints/);
  const catalogSource = chart.slice(chart.indexOf("export const DRAWING_TOOL_CATALOG"), chart.indexOf("] as const;"));
  assert.equal((catalogSource.match(/\{ id:/g) ?? []).length, 67);
  assert.match(chart, /api\/upstox\/candles/);
  assert.match(chart, /scope: "intraday"/);
  assert.match(chart, /timeframe === "1W"/);
  assert.doesNotMatch(chart, /open: last\.close/);
  assert.match(serverAdapter, /process\.env\.UPSTOX_ACCESS_TOKEN/);
  assert.match(candleRoute, /historical-candle\/intraday/);
  assert.match(candleRoute, /Promise\.allSettled/);
  assert.match(candleRoute, /"1W".*weeks/);
  assert.match(candleRoute, /"1M".*months/);
  assert.match(candleRoute, /aggregateAnnualCandles/);
  assert.match(candleRoute, /volume: Number\(item\[5\]/);
  assert.match(instrumentRoute, /NSE\.json\.gz/);
  assert.match(instrumentRoute, /ind_nifty500list\.csv/);
  assert.match(volumeBreakoutRoute, /sec_bhavdata_full_/);
  assert.match(volumeBreakoutRoute, /market-quote\/quotes/);
  assert.match(volumeBreakout, /candidate\.todayVolume > sma20Volume \* VOLUME_BREAKOUT_MULTIPLIER/);
  assert.match(volumeBreakout, /VOLUME_BREAKOUT_LIMIT = 15/);
  assert.match(dashboard, /Load 60 more/);
  assert.match(dashboard, /mobile-indicator-control/);
  assert.match(dashboard, /mobile-scroll-tail/);
  assert.match(dashboard, /quantityInput/);
  assert.match(dashboard, /setQuantityInput\(event\.target\.value\.replace/);
  assert.doesNotMatch(dashboard, /name="accessToken"/);
  assert.match(quoteRoute, /Cache-Control.*no-store/);
  assert.match(readme, /TradingView Lightweight Charts/);
  await access(new URL("../public/papertrade-social.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
