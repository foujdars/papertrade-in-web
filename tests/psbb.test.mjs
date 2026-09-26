import assert from "node:assert/strict";
import test from "node:test";
import { psbbFromRsi, psbbPlots } from "../lib/psbb.ts";

const flat = (count) => Array.from({ length: count }, () => ({ open: 115, high: 120, low: 110, close: 115 }));

test("PSBB marks a bullish divergence only after the swing high closes broken", () => {
  const candles = flat(18);
  candles[5] = { open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { open: 118, high: 130, low: 112, close: 122 };
  candles[16] = { open: 120, high: 134, low: 118, close: 131 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const plots = psbbFromRsi(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 2, window: 30 });
  assert.equal(plots.long[16], 131);
  assert.equal(plots.stop[16], 95);
  assert.equal(plots.target1[16], 167);
  assert.equal(plots.target2[16], 203);
  assert.equal(Number.isNaN(plots.long[17]), true);
});

test("PSBB ignores a lower low whose RSI is still above 30", () => {
  const candles = flat(18);
  candles[5] = { open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { open: 118, high: 130, low: 112, close: 122 };
  candles[16] = { open: 120, high: 134, low: 118, close: 131 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 40;
  rsi[12] = 45;
  const plots = psbbFromRsi(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 2, window: 30 });
  assert.equal(plots.long.some(Number.isFinite), false);
});

test("PSBB calculation runs on a short candle series", () => {
  const plots = psbbPlots(flat(40), { length: 14, left: 3 });
  assert.equal(plots.entry.length, 40);
});
