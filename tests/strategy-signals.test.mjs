import assert from "node:assert/strict";
import test from "node:test";
import { strategyPlots } from "../lib/strategy-signals.ts";

const bar = (open, high, low, close) => ({ open, high, low, close });

test("inside candle marks a close through the mother candle and a 2R target", () => {
  const plots = strategyPlots([
    bar(10, 20, 10, 18),
    bar(16, 18, 12, 14),
    bar(18, 22, 17, 21),
    bar(21, 22, 20, 21),
  ], "zing-inside", { reward: 2, chase: 35 });
  assert.equal(plots.long[2], 21);
  assert.equal(plots.stop[2], 10);
  assert.equal(plots.target[2], 43);
  assert.equal(Number.isNaN(plots.long[3]), true);
});

test("inside candle skips a breakout that has already run more than 35%", () => {
  const plots = strategyPlots([
    bar(10, 20, 10, 18),
    bar(16, 18, 12, 14),
    bar(20, 26, 19, 24),
    bar(24, 25, 23, 24),
  ], "zing-inside", { reward: 2, chase: 35 });
  assert.equal(plots.long.some(Number.isFinite), false);
});

test("traffic light uses the pair range and the SMA side", () => {
  const plots = strategyPlots([
    bar(9, 11, 9, 10),
    bar(10, 10, 8, 9),
    bar(9, 13, 9, 12),
    bar(12, 13, 11, 12),
  ], "zing-traffic", { length: 2, reward: 1.2, buffer: 0.01 });
  assert.equal(plots.long[2], 12);
  assert.ok(Math.abs(plots.stop[2] - 8 * 0.9999) < 1e-9);
  assert.equal(plots.target[2], 15.6);
});

test("ema cross fires once, with a 10 point stop and a 12 point target", () => {
  const closes = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 10, 11, 13, 16, 20, 24, 28, 30];
  const candles = closes.map((close) => bar(close, close + 1, close - 1, close));
  candles.push(bar(30, 31, 29, 30));
  const plots = strategyPlots(candles, "zing-ema", { fast: 3, slow: 8, stop: 10, target: 12 });
  const index = plots.long.findIndex(Number.isFinite);
  assert.ok(index > 0);
  assert.equal(plots.stop[index], plots.long[index] - 10);
  assert.equal(plots.target[index], plots.long[index] + 12);
  assert.equal(plots.long.filter(Number.isFinite).length, 1);
});
