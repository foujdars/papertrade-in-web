import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHART_STYLES,
  DEFAULT_CHART_STYLE,
  heikinAshi,
  isChartStyle,
  isProfileStyle,
  prepareStyleCandles,
  styleSeriesKind,
  toStyleSeriesPoint,
  volumeCandleColor,
} from "../lib/chart-style.ts";
import {
  COMPARE_COLORS,
  COMPARE_KEY_PATTERN,
  MAX_COMPARED_SYMBOLS,
  compareChangePercent,
  comparisonRequest,
  sanitizeComparedSymbols,
} from "../lib/chart-compare.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("TradingView chart types are all present with a candle default", () => {
  assert.equal(DEFAULT_CHART_STYLE, "candles");
  assert.deepEqual(CHART_STYLES.map((style) => style.id), [
    "bars", "candles", "hollow-candles", "volume-candles",
    "line", "line-markers", "step-line",
    "area", "hlc-area", "baseline",
    "columns", "high-low",
    "volume-footprint", "tpo", "session-volume-profile",
    "heikin-ashi",
  ]);
  assert.equal(styleSeriesKind("candles"), "candlestick");
  assert.equal(styleSeriesKind("bars"), "bar");
  assert.equal(styleSeriesKind("step-line"), "line");
  assert.equal(styleSeriesKind("hlc-area"), "area");
  assert.equal(styleSeriesKind("columns"), "histogram");
  assert.ok(isProfileStyle("volume-footprint"));
  assert.equal(isChartStyle("kagi"), false);
});

test("Heikin Ashi uses the standard recursive open and midpoint close", () => {
  const candles = [
    { time: 1, open: 10, high: 16, low: 8, close: 14, volume: 100 },
    { time: 2, open: 14, high: 18, low: 13, close: 17, volume: 80 },
  ];
  const [first, second] = heikinAshi(candles);
  assert.equal(first.close, 12);
  assert.equal(first.open, 12);
  assert.equal(first.high, 16);
  assert.equal(first.low, 8);
  assert.equal(second.open, 12);
  assert.equal(second.close, 15.5);
  assert.equal(prepareStyleCandles(candles, "candles")[0].close, 14);
});

test("volume candles darken with relative volume and series points follow the style", () => {
  const quiet = { time: 1, open: 10, high: 11, low: 9, close: 11, volume: 10 };
  const loud = { time: 2, open: 11, high: 14, low: 10, close: 13, volume: 100 };
  const loudColor = volumeCandleColor(loud, [quiet, loud]);
  const quietColor = volumeCandleColor(quiet, [quiet, loud]);
  assert.notEqual(loudColor, quietColor);
  assert.match(loudColor, /^#[0-9a-f]{6}$/i);
  const volumePoint = toStyleSeriesPoint(loud, [quiet, loud], 1, "volume-candles", 2);
  assert.equal(volumePoint.color, loudColor);
  const line = toStyleSeriesPoint(loud, [quiet, loud], 1, "line", 2);
  assert.equal(line.value, 13);
  const highLow = toStyleSeriesPoint(loud, [quiet, loud], 1, "high-low", 2);
  assert.equal(highLow.open, 10);
  assert.equal(highLow.close, 14);
});

test("compare overlays sanitize keys and route global symbols to Delta candles", () => {
  assert.ok(COMPARE_KEY_PATTERN.test("NSE_INDEX|Nifty 50"));
  assert.ok(COMPARE_KEY_PATTERN.test("DELTA|SPYXUSD"));
  assert.deepEqual(sanitizeComparedSymbols([
    { instrumentKey: "NSE_INDEX|Nifty 50", symbol: "NIFTY", name: "Nifty 50", exchange: "NSE" },
    { instrumentKey: "javascript:alert(1)", symbol: "X", name: "X", exchange: "NSE" },
    { instrumentKey: "DELTA|SPYXUSD", symbol: "SPYXUSD", name: "S&P 500", exchange: "DELTA" },
    { instrumentKey: "NSE_INDEX|Nifty 50", symbol: "NIFTY", name: "dup", exchange: "NSE" },
  ]).map((item) => item.instrumentKey), ["NSE_INDEX|Nifty 50", "DELTA|SPYXUSD"]);
  assert.equal(sanitizeComparedSymbols(Array.from({ length: 12 }, (_, i) => ({ instrumentKey: `NSE_EQ|INE${i}`, symbol: `S${i}`, name: "S", exchange: "NSE" }))).length, MAX_COMPARED_SYMBOLS);
  assert.match(comparisonRequest("DELTA|SPYXUSD", "1D"), /\/api\/global-markets\?.*mode=candles/);
  assert.match(comparisonRequest("NSE_INDEX|Nifty 50", "5m"), /\/api\/upstox\/candles\?/);
  assert.match(comparisonRequest("TVC|UKOIL", "1H"), /symbol=BRENT/);
  assert.equal(Math.round(compareChangePercent([{ time: 1, open: 100, high: 100, low: 100, close: 100, volume: 1 }, { time: 2, open: 110, high: 110, low: 110, close: 110, volume: 1 }])), 10);
  assert.equal(COMPARE_COLORS.length, 6);
  assert.equal(sanitizeComparedSymbols([{ instrumentKey: "NSE_EQ|INE002A01018", symbol: "RELIANCE", color: "#e91e63" }])[0].color, "#e91e63");
  assert.equal(sanitizeComparedSymbols([{ instrumentKey: "NSE_EQ|INE002A01018", symbol: "RELIANCE", color: "red;evil" }])[0].color, undefined);
});

test("chart workspaces expose type and compare menus without restyling the shell", async () => {
  const [dashboard, chart, advanced, fno, global, layout] = await Promise.all([
    source("components/TradingDashboard.tsx"),
    source("components/MarketChart.tsx"),
    source("components/AdvancedChartWorkspace.tsx"),
    source("components/FnoChartWorkspace.tsx"),
    source("components/GlobalMarketsWorkspace.tsx"),
    source("app/layout.tsx"),
  ]);
  assert.match(layout, /chart-style.css/);
  assert.match(dashboard, /<ChartStyleMenu/);
  assert.match(dashboard, /<CompareSymbolPicker/);
  assert.match(dashboard, /Compare symbols/);
  assert.match(chart, /overlayCompared/);
  assert.match(chart, /PriceScaleMode.Percentage/);
  assert.match(chart, /heikin-ashi|prepareStyleCandles/);
  assert.match(chart, /ChartProfileOverlay/);
  assert.match(advanced, /CompareSymbolPicker/);
  assert.match(fno, /Chart type/);
  assert.match(global, /CompareSymbolPicker/);
});
