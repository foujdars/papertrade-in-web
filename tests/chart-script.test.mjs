import test from "node:test";
import assert from "node:assert/strict";
import { runChartScript } from "../lib/chart-script.ts";

const candles = Array.from({ length: 30 }, (_, index) => ({ time: index, open: index, high: index + 2, low: index - 1, close: index + 1, volume: 10 }));

test("a chart script plots on the candles and rejects unknown calls", () => {
  const overlay = runChartScript('overlay\nfast = ema(close, 9)\nplot(sma(close, 5))\nplot(fast, "fast")', candles);
  assert.equal(overlay.error, null);
  assert.equal(overlay.overlay, true);
  assert.equal(overlay.plots.length, 2);
  assert.equal(overlay.plots[1].name, "fast");
  assert.ok(overlay.plots[0].values.filter(Number.isFinite).length > 10);
  const oscillator = runChartScript("plot(rsi(close, 14))\nhline(70)", candles);
  assert.equal(oscillator.overlay, false);
  assert.deepEqual(oscillator.levels, [70]);
  assert.match(runChartScript("plot(foo(close))", candles).error ?? "", /Unknown function/);
});
