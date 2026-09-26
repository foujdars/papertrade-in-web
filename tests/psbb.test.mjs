import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups } from "../lib/psbb.ts";

const flat = (count) => Array.from({ length: count }, (_, time) => ({ time, open: 115, high: 120, low: 110, close: 115 }));

test("a bullish PSBB setup stays ACTIVE until the structure breaks", () => {
  const candles = flat(18);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const setup = psbbSetups(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 2 }).at(-1);
  assert.equal(setup.status, "active");
  assert.equal(setup.trigger, 130);
  assert.equal(setup.stop, 95);
  assert.equal(setup.target1, 165);
});

test("PSBB is FORMED on the structure break, PASSED if the target is hit, and FAILED if it is missed", () => {
  const candles = flat(20);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  candles[16] = { time: 16, open: 128, high: 140, low: 120, close: 132 };
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 2 }).at(-1).status, "formed");
  candles[16] = { time: 16, open: 128, high: 166, low: 120, close: 160 };
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 2 }).at(-1).status, "passed");
  candles[16] = { time: 16, open: 128, high: 140, low: 120, close: 132 };
  candles[17] = { time: 17, open: 100, high: 110, low: 94, close: 96 };
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 2 }).at(-1).status, "failed");
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
