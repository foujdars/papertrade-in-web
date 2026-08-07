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
  assert.match(html, /0 active/);
  assert.doesNotMatch(html, /EMA 5|EMA 21|RSI 14/);
  assert.match(html, /Broker API/);
  assert.match(html, /No real money/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships project assets and removes the starter preview", async () => {
  const [page, styles, dashboard, authProvider, supabaseClient, authMigration, setupGuide, androidManifest, chart, functionMenu, advancedChart, market, paperTrading, serverAdapter, candleRoute, quoteRoute, instrumentRoute, volumeBreakoutRoute, volumeBreakout, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AuthProvider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/supabase-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/0001_auth_and_trading_state.sql", import.meta.url), "utf8"),
    readFile(new URL("../SETUP_FROM_SCRATCH.md", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
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
  const [marketsWorkspace, fnoListsWorkspace, optionChainSheet, fnoChartWorkspace, fnoRoute, optionChainRoute, fnoTypes, fnoClient, chartToolbar] = await Promise.all([
    readFile(new URL("../components/MarketsWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FnoListsWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/OptionChainSheet.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FnoChartWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstox/fno-underlyings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/upstox/option-chain/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/fno.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/fno-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/ChartDrawingToolbar.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<TradingDashboard \/>/);
  assert.match(page, /<AuthProvider>/);
  assert.match(authProvider, /provider: "google"/);
  assert.match(authProvider, /in\.papertrade\.app:\/\/auth\/callback/);
  assert.match(authProvider, /skipBrowserRedirect: true/);
  assert.match(authProvider, /Browser\.open/);
  assert.match(authProvider, /trading_states/);
  assert.match(authProvider, /CLOUD_STORAGE_KEYS/);
  assert.match(authProvider, /Welcome back/);
  assert.match(authProvider, /Getting your trading desk ready/);
  assert.match(supabaseClient, /flowType: "pkce"/);
  assert.match(authMigration, /enable row level security/);
  assert.match(authMigration, /auth\.uid\(\) = user_id/);
  assert.match(androidManifest, /android:scheme="in\.papertrade\.app"/);
  assert.match(setupGuide, /12 testers/);
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
  assert.match(marketsWorkspace, /<h2>Volume Stocker<\/h2>/);
  assert.doesNotMatch(dashboard, /Top 15 stocks where/);
  assert.doesNotMatch(dashboard, /Top Gainers/);
  assert.match(paperTrading, /papertrade-orders/);
  assert.match(paperTrading, /unrealizedPnl/);
  assert.match(chartToolbar, /Fibonacci/);
  assert.match(dashboard, /Upstox market data/);
  assert.match(chart, /import\("lightweight-charts"\)/);
  assert.match(chart, /attributionLogo: true/);
  assert.match(chart, /right-axis marker should contain only the price/);
  assert.match(chart, /title: ""/);
  assert.doesNotMatch(chart, /Charts by TradingView/);
  assert.match(chart, /lightweight-charts-drawing/);
  assert.match(chart, /DRAWING_TOOL_CATALOG/);
  assert.match(chart, /DrawingManager/);
  assert.match(chart, /chart-risk-tool/);
  assert.match(chart, /entireTextOnly: true/);
  assert.match(chart, /beginRiskDrag/);
  assert.match(chart, /visibleCoordinate/);
  assert.match(chart, /chart-live-pnl/);
  assert.doesNotMatch(chart, /<span>TARGET<\/span>|<span>STOP<\/span>|ENTRY<\/span>/);
  assert.match(dashboard, /LIVE_INDEX_TICKERS/);
  assert.match(dashboard, /NSE_INDEX\|Nifty 50/);
  assert.match(dashboard, /NSE_INDEX\|Nifty Bank/);
  assert.match(dashboard, /BSE_INDEX\|SENSEX/);
  assert.match(dashboard, /live-index-strip/);
  assert.match(dashboard, /papertrade-theme/);
  assert.match(dashboard, /Neon dark theme/);
  assert.match(dashboard, /papertrade-last-chart/);
  assert.match(dashboard, /repairRatnaveerSimulationTrade/);
  assert.match(dashboard, /Live Upstox price unavailable\. Paper order was not placed/);
  assert.match(dashboard, /quoteIsFresh/);
  assert.match(dashboard, /chart-trade-footer/);
  assert.match(dashboard, /orderSheetOpen/);
  assert.match(dashboard, /deleteClosedTrade/);
  assert.match(dashboard, /Delete trade/);
  assert.match(dashboard, /MAX_VIRTUAL_BALANCE = 100_000_000/);
  assert.match(dashboard, /FnoChartWorkspace/);
  assert.match(fnoChartWorkspace, /fno-focus-workspace/);
  assert.match(fnoChartWorkspace, /fno-window-slider/);
  assert.match(fnoChartWorkspace, /1-Tap Market/);
  assert.match(fnoChartWorkspace, /Limit\/Trigger on Chart/);
  assert.match(fnoChartWorkspace, /Option Chain/);
  assert.match(fnoChartWorkspace, /FNO_TIMEFRAME_GROUPS/);
  assert.match(fnoChartWorkspace, />Tools</);
  assert.doesNotMatch(fnoChartWorkspace, />Settings</);
  assert.match(fnoChartWorkspace, /onToggleTopMode/);
  assert.match(fnoChartWorkspace, /onToggleOptionType/);
  assert.match(fnoChartWorkspace, /className="sell"/);
  assert.match(fnoChartWorkspace, /className="buy"/);
  assert.match(fnoChartWorkspace, /ChartDrawingToolbar/);
  assert.match(fnoChartWorkspace, /orderTool=\{orderTool\}/);
  assert.match(fnoChartWorkspace, /toolbarCollapsed/);
  assert.match(fnoChartWorkspace, /useState\(true\)/);
  assert.match(dashboard, /tradeToolbarCollapsed, setTradeToolbarCollapsed\] = useState\(true\)/);
  assert.match(chartToolbar, /Hide drawing toolbar/);
  assert.match(chartToolbar, /Show drawing toolbar/);
  assert.match(dashboard, /openFnoUnderlying/);
  assert.match(dashboard, /openFnoNormalChart/);
  assert.match(dashboard, /chart-derivatives-link/);
  assert.match(dashboard, /FnoListsWorkspace/);
  assert.match(dashboard, /toggleFnoOptionType/);
  assert.match(dashboard, /CapacitorApp\.addListener\("backButton"/);
  assert.match(dashboard, /LAST_CASH_CHART_STORAGE_KEY/);
  assert.match(dashboard, /savedChart\.symbol\?\.toUpperCase\(\) \?\? params\.get\("symbol"\)/);
  assert.match(dashboard, /else if \(savedChart\.instrument\?\.instrumentKey\)/);
  assert.match(dashboard, /workspaceMode, fnoTopMode/);
  assert.match(dashboard, /quantityStep/);
  assert.doesNotMatch(marketsWorkspace, /fno-symbol-row|Indices|F&amp;O/);
  assert.match(fnoListsWorkspace, /fno-symbol-row/);
  assert.match(fnoListsWorkspace, /Indices &amp; F&amp;O/);
  assert.doesNotMatch(marketsWorkspace, /openingUnderlyingKey/);
  assert.match(optionChainSheet, /option-sheet-handle/);
  assert.match(optionChainSheet, />CALL</);
  assert.match(optionChainSheet, />PUT</);
  assert.match(fnoClient, /nearestAtmRow/);
  assert.match(fnoRoute, /segment !== "NSE_FO"/);
  assert.match(fnoRoute, /item\.instrument_type === "FUT"/);
  assert.match(fnoRoute, /tradingSymbol: item\.trading_symbol/);
  assert.match(fnoRoute, /normalizeExpiry/);
  assert.match(fnoRoute, /String\(a\.expiry\)\.localeCompare/);
  assert.match(optionChainRoute, /\/v2\/option\/chain/);
  assert.match(optionChainRoute, /\/v2\/option\/contract/);
  assert.match(optionChainRoute, /normalizeExpiry/);
  assert.match(fnoTypes, /optionToInstrument/);
  assert.match(fnoTypes, /futureToInstrument/);
  assert.match(dashboard, /Add virtual money/);
  assert.match(styles, /terminal-shell\[data-theme="neon"\]/);
  assert.match(styles, /drawing-toolbar\.collapsed/);
  assert.match(styles, /chart-symbol-legend[^}]+background: transparent/);
  assert.match(styles, /chart-trade-buttons/);
  assert.match(chart, /function fitStudyPanes/);
  assert.match(chart, /legendSafeTop/);
  assert.doesNotMatch(chart, /clampToChart/);
  assert.match(chart, /minimumWidth: 58/);
  assert.match(chart, /minimumFractionDigits: 0, maximumFractionDigits: 2/);
  assert.match(chart, /requestedMacdPane = next\.rsi \? 2 : 1/);
  assert.match(styles, /height: calc\(100svh - 136px/);
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
  assert.doesNotMatch(chart, /generateCandles/);
  assert.match(chart, /No simulation · retrying/);
  assert.match(chart, /scope: "intraday"/);
  assert.match(chart, /timeframe === "1W"/);
  assert.doesNotMatch(chart, /open: last\.close/);
  assert.match(serverAdapter, /process\.env\.UPSTOX_ACCESS_TOKEN/);
  assert.match(serverAdapter, /inFlightRequests/);
  assert.match(serverAdapter, /Retry-After/);
  assert.match(serverAdapter, /staleMs: 5_000/);
  assert.match(candleRoute, /historical-candle\/intraday/);
  assert.match(candleRoute, /Promise\.allSettled/);
  assert.match(candleRoute, /"2m".*interval: "2"/);
  assert.match(candleRoute, /"30m".*interval: "30"/);
  assert.match(candleRoute, /"1W".*weeks/);
  assert.match(candleRoute, /"1M".*months/);
  assert.match(candleRoute, /aggregateAnnualCandles/);
  assert.match(candleRoute, /volume: Number\(item\[5\]/);
  assert.match(instrumentRoute, /NSE\.json\.gz/);
  assert.match(instrumentRoute, /ind_nifty500list\.csv/);
  assert.match(volumeBreakoutRoute, /historical-candle/);
  assert.match(volumeBreakoutRoute, /market-quote\/quotes/);
  assert.match(volumeBreakout, /candidate\.todayVolume > sma20Volume \* VOLUME_BREAKOUT_MULTIPLIER/);
  assert.match(volumeBreakout, /VOLUME_BREAKOUT_LIMIT = 15/);
  assert.match(dashboard, /Load 60 more/);
  assert.match(dashboard, /label="Functions"/);
  assert.doesNotMatch(dashboard, /mobile-scroll-tail/);
  assert.match(styles, /chart-trade-footer \{ flex: 0 0 59px; display: grid; grid-template-rows: 36px 15px; gap: 2px; padding: 3px 10px; \}/);
  assert.match(dashboard, /quantityInput/);
  assert.match(dashboard, /activeRiskToolEnabled/);
  assert.match(dashboard, /setRiskToolEnabled\(true\)/);
  assert.match(dashboard, /setQuantityInput\(event\.target\.value\.replace/);
  assert.doesNotMatch(dashboard, /name="accessToken"/);
  assert.match(quoteRoute, /Cache-Control.*no-store/);
  assert.match(readme, /TradingView Lightweight Charts/);
  await access(new URL("../public/papertrade-social.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("uses popup selectors and a focused default candle range", async () => {
  const [dashboard, selectors, chart] = await Promise.all([
    readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CompactSelectors.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(selectors, /Choose chart timeframe/);
  assert.match(selectors, /Minutes/);
  assert.match(selectors, /Days & longer/);
  assert.doesNotMatch(selectors, /Chart menu sections|Drawings|Settings/);
  assert.match(selectors, /Choose watchlist/);
  assert.match(dashboard, /<ChartTimeframeMenu/);
  assert.match(dashboard, /<WatchlistSelector/);
  assert.doesNotMatch(dashboard, /periods\.map/);
  assert.doesNotMatch(dashboard, /className="watchlist-tabs"/);
  assert.doesNotMatch(dashboard, /<span>Positions<\/span>/);
  assert.match(chart, /visibleBars = 22/);
  assert.match(chart, /onChartTapRef/);
  assert.match(dashboard, /workspaceMode/);
  assert.match(dashboard, /<span>F&amp;O<\/span>/);
  assert.match(dashboard, /Brand onClick/);
  assert.match(dashboard, /trade-footer-hidden/);
  assert.match(dashboard, /setFnoTradeDockOpen\(\(value\) => !value\)/);
});
