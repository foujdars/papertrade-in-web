import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups } from "../lib/psbb.ts";

const bar = (time, high, low, close = (high + low) / 2) => ({ time, open: close, high, low, close });
const flat = (count) => Array.from({ length: count }, (_, time) => bar(time, 120, 110, 115));

test("positive divergence uses the later swing high as entry and the higher low as the stop", () => {
  const candles = flat(28);
  candles[5] = bar(5, 112, 100, 108);
  candles[12] = bar(12, 110, 95, 104);
  candles[16] = bar(16, 122, 112, 118);
  for (const time of [18, 19, 21, 22]) candles[time] = bar(time, 121, 118, 119);
  candles[20] = bar(20, 120, 116, 118);
  const rsi = Array.from({ length: 28 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const setup = psbbSetups(candles, rsi, { left: 2, oversold: 30, overbought: 70, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(setup.side, "long");
  assert.equal(setup.firstPrice, 100);
  assert.equal(setup.secondPrice, 95);
  assert.equal(setup.entry, 122);
  assert.equal(setup.stop, 116);
  assert.equal(setup.shifted, false);
  assert.equal(setup.target1, 128);
  assert.equal(setup.target2, 131);
  candles[24] = bar(24, 124, 121, 123);
  assert.equal(psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1).shifted, true);
});

test("negative divergence mirrors the structure: entry is the swing low and stop is the lower high", () => {
  const candles = flat(28);
  candles[5] = bar(5, 130, 118, 124);
  candles[12] = bar(12, 140, 124, 136);
  candles[16] = bar(16, 128, 108, 112);
  for (const time of [18, 19, 21, 22]) candles[time] = bar(time, 118, 110, 114);
  candles[20] = bar(20, 124, 112, 120);
  const rsi = Array.from({ length: 28 }, () => 50);
  rsi[5] = 78;
  rsi[12] = 66;
  const setup = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(setup.side, "short");
  assert.equal(setup.entry, 108);
  assert.equal(setup.stop, 124);
  assert.equal(setup.target1, 92);
  assert.equal(setup.target2, 84);
});

test("a lower low whose RSI never reached 30 is not a positive divergence", () => {
  const candles = flat(18);
  candles[5] = bar(5, 112, 100, 108);
  candles[12] = bar(12, 110, 95, 104);
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 40;
  rsi[12] = 45;
  assert.equal(psbbSetups(candles, rsi, { left: 2, oversold: 30 }).length, 0);
});
