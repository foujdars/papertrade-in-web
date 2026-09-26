import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups } from "../lib/psbb.ts";

const flat = (count) => Array.from({ length: count }, (_, time) => ({ time, open: 115, high: 120, low: 110, close: 115 }));

test("a bullish PSBB setup is visible when the divergence forms", () => {
  const candles = flat(18);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const [setup] = psbbSetups(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 2 });
  assert.equal(setup.status, "formed");
  assert.equal(setup.trigger, 130);
  assert.equal(setup.stop, 95);
  assert.equal(setup.target1, 165);
  assert.equal(setup.start, 12);
});

test("PSBB marks success when target 1 is reached and failed when the stop is hit first", () => {
  const candles = flat(20);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  candles[16] = { time: 16, open: 128, high: 166, low: 120, close: 160 };
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 2 })[0].status, "success");
  candles[16] = { time: 16, open: 100, high: 110, low: 94, close: 96 };
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 2 })[0].status, "failed");
});

test("RSI still above 30 does not form a setup", () => {
  const candles = flat(18);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 40;
  rsi[12] = 45;
  assert.equal(psbbSetups(candles, rsi, { left: 2, oversold: 30 }).length, 0);
});
