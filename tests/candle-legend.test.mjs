import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { candleChangePercent, formatCandleChange, selectCandleLegend } from "../lib/candle-legend.ts";

const candle = (time, close, open = close) => ({ time, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close, volume: 100 });
const bars = [candle(100, 100), candle(200, 110, 112), candle(300, 99, 98)];

test("hovered OHLC and percentage use the same candle and its previous close", () => {
  const result = selectCandleLegend(bars, 200);
  assert.equal(result.candle, bars[1]);
  assert.equal(result.changePercent, 10);
  // A red candle can still be above the previous close following a gap up.
  assert.notEqual(result.changePercent, (110 - 112) / 112 * 100);
  assert.equal(selectCandleLegend(bars, 300).changePercent, -10);
});

test("no cursor, empty space to the right and leaving the chart use the rightmost candle", () => {
  for (const time of [null, undefined, 400, 1000, NaN]) {
    const result = selectCandleLegend(bars, time);
    assert.equal(result.candle, bars[2]);
    assert.equal(result.changePercent, -10);
  }
});

test("first candle or missing previous close is unavailable, not a fabricated zero", () => {
  assert.equal(selectCandleLegend([], 100), null);
  assert.equal(selectCandleLegend(bars, 100).changePercent, null);
  assert.equal(selectCandleLegend([bars[0]]).changePercent, null);
  for (const previous of [undefined, NaN, Infinity, 0, -10]) assert.equal(candleChangePercent(100, previous), null);
  assert.equal(candleChangePercent(Infinity, 100), null);
  assert.equal(candleChangePercent(100, 100), 0);
});

test("live updates refresh latest percentage without replacing a hovered historical candle", () => {
  const current = [...bars];
  current[2] = candle(300, 121);
  assert.equal(selectCandleLegend(current).changePercent, 10);
  assert.equal(selectCandleLegend(current, 200).candle.close, 110);
  current.push(candle(400, 133.1));
  assert.ok(Math.abs(selectCandleLegend(current).changePercent - 10) < 0.00001);
  assert.equal(selectCandleLegend(current, 200).changePercent, 10);
});

test("time-based lookup survives prepended history and dropped old bars", () => {
  assert.equal(selectCandleLegend([candle(50, 90), ...bars], 200).changePercent, 10);
  assert.equal(selectCandleLegend(bars.slice(1), 200).changePercent, null);
  assert.equal(selectCandleLegend(bars.slice(1), 100).candle.time, 300);
});

test("all chart intervals use adjacent candles, not a fixed daily percentage", () => {
  for (const [timeframe, seconds] of Object.entries({ "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "3H": 10800, "4H": 14400, "1D": 86400, "1W": 604800, "1M": 2678400, "1Y": 31536000 })) {
    const data = [candle(1000, 200), candle(1000 + seconds, 205), candle(1000 + seconds * 2, 190)];
    assert.equal(selectCandleLegend(data, 1000 + seconds).changePercent, 2.5, timeframe);
    assert.ok(Math.abs(selectCandleLegend(data).changePercent - ((190 - 205) / 205 * 100)) < 0.00001, timeframe);
  }
});

test("signed percentage text handles gains, losses and zero without negative zero", () => {
  assert.equal(formatCandleChange(2.5), "+2.50%");
  assert.equal(formatCandleChange(-2.5), "-2.50%");
  assert.equal(formatCandleChange(0), "0.00%");
  assert.equal(formatCandleChange(-0.00001), "0.00%");
  assert.equal(formatCandleChange(null), "—");
});

test("crosshair subscriptions are cleaned up and do not change trading prices", async () => {
  const chart = await readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8");
  assert.match(chart, /chart.subscribeCrosshairMove\(crosshairMove\)/);
  assert.match(chart, /unsubscribeCrosshairMove\(crosshairMove\)/);
  const handler = chart.split("crosshairMove = (event) => {")[1].split("chart.subscribeCrosshairMove")[0];
  assert.match(handler, /event.seriesData.get\(series\)/);
  assert.match(handler, /usesIntradayAxisShift\(timeframe\) \? IST_OFFSET_SECONDS : 0/);
  assert.doesNotMatch(handler, /setLatestCandle|onPriceRef|setData|\.update\(/);
  assert.match(chart, /latestCandle\?\.close.toFixed\(2\)/);
  assert.match(chart, /hoveredCandle\?\.scope === legendScope/);
});

test("candle stats remain visible on desktop, mobile and compact F&O charts", async () => {
  const style = await readFile(new URL("../app/candle-legend.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /import "\.\/candle-legend.css"/);
  assert.match(style, /\.chart-symbol-legend\.lightweight-symbol-legend { display: flex/);
  assert.match(style, /\.fno-clean-chart \.chart-symbol-legend\.lightweight-symbol-legend { display: flex !important/);
  assert.match(style, /flex-wrap: wrap/);
});
