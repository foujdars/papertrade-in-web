import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups } from "../lib/psbb.ts";

const bar = (time, high, low, close = (high + low) / 2) => ({ time, open: close, high, low, close });
const flat = (count) => Array.from({ length: count }, (_, time) => bar(time, 120, 110, 115));

test("positive divergence has no entry until price closes through the high between the two lows", () => {
  const candles = flat(20);
  candles[5] = bar(5, 112, 100, 108);
  candles[8] = bar(8, 130, 112, 122);
  candles[12] = bar(12, 110, 95, 104);
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const waiting = psbbSetups(candles, rsi, { left: 2, oversold: 30, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(waiting.shifted, false);
  assert.equal(waiting.entry, 130);
  assert.equal(waiting.stop, 95);
  assert.equal(waiting.extended, false);
  candles[16] = bar(16, 134, 120, 132);
  const shifted = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(shifted.shifted, true);
  assert.equal(shifted.target1, 165);
  assert.equal(shifted.target2, 182.5);
});

test("negative divergence is not a trade when the low between the highs never breaks", () => {
  const candles = flat(18);
  candles[5] = bar(5, 130, 118, 124);
  candles[8] = bar(8, 118, 100, 108);
  candles[12] = bar(12, 140, 124, 136);
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 78;
  rsi[12] = 66;
  const setup = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(setup.side, "short");
  assert.equal(setup.entry, 100);
  assert.equal(setup.stop, 140);
  assert.equal(setup.shifted, false);
});

test("a third push in the same direction is the lower-probability divergence", () => {
  const candles = flat(28);
  candles[4] = bar(4, 130, 118, 124);
  candles[6] = bar(6, 122, 100, 108);
  candles[10] = bar(10, 136, 120, 128);
  candles[12] = bar(12, 124, 102, 110);
  candles[16] = bar(16, 142, 128, 136);
  candles[18] = bar(18, 126, 104, 112);
  const rsi = Array.from({ length: 28 }, () => 55);
  rsi[4] = 80;
  rsi[10] = 74;
  rsi[16] = 68;
  const setup = psbbSetups(candles, rsi, { left: 2, overbought: 70 }).at(-1);
  assert.equal(setup.extended, true);
  assert.equal(setup.shifted, false);
});
