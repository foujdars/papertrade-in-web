import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups } from "../lib/psbb.ts";

const flat = (count) => Array.from({ length: count }, (_, time) => ({ time, open: 115, high: 120, low: 110, close: 115 }));

test("positive divergence waits for the structure shift, then uses a 1:1 and 1:1.5 target", () => {
  const candles = flat(18);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const setup = psbbSetups(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(setup.side, "long");
  assert.equal(setup.status, "active");
  assert.equal(setup.shifted, false);
  assert.equal(setup.firstPrice, 100);
  assert.equal(setup.secondPrice, 95);
  assert.equal(setup.entry, 130);
  assert.equal(setup.stop, 95);
  assert.equal(setup.target1, 165);
  assert.equal(setup.target2, 182.5);
});

test("negative divergence puts the stop on the swing high and the entry on the shift", () => {
  const candles = flat(20);
  candles[5] = { time: 5, open: 118, high: 130, low: 116, close: 124 };
  candles[8] = { time: 8, open: 112, high: 118, low: 100, close: 108 };
  candles[12] = { time: 12, open: 128, high: 140, low: 124, close: 136 };
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 78;
  rsi[12] = 66;
  const waiting = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(waiting.side, "short");
  assert.equal(waiting.stop, 140);
  assert.equal(waiting.entry, 100);
  assert.equal(waiting.shifted, false);
  candles[16] = { time: 16, open: 108, high: 112, low: 96, close: 98 };
  const shifted = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(shifted.shifted, true);
  assert.equal(shifted.target1, 60);
  assert.equal(shifted.target2, 40);
  candles[17] = { time: 17, open: 110, high: 141, low: 108, close: 136 };
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1).status, "failed");
});

test("RSI that never reaches 30 or 70 does not draw a divergence", () => {
  const candles = flat(18);
  candles[5] = { time: 5, open: 108, high: 112, low: 100, close: 108 };
  candles[12] = { time: 12, open: 104, high: 110, low: 95, close: 104 };
  candles[8] = { time: 8, open: 118, high: 130, low: 112, close: 122 };
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 40;
  rsi[12] = 45;
  assert.equal(psbbSetups(candles, rsi, { left: 2, oversold: 30 }).length, 0);
});
