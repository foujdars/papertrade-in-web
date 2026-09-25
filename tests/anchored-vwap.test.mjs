import assert from "node:assert/strict";
import test from "node:test";
import { anchoredVwap } from "../lib/anchored-vwap.ts";

const bar = (time, high, low, close, volume) => ({ time, high, low, close, volume, open: close });

test("anchored VWAP starts at the chosen candle and ignores earlier volume", () => {
  const candles = [bar(1, 12, 8, 10, 100), bar(2, 16, 10, 14, 100), bar(3, 18, 12, 15, 200)];
  const points = anchoredVwap(candles, 2);
  assert.deepEqual(points.map((point) => point.time), [2, 3]);
  assert.ok(Math.abs(points[0].value - (16 + 10 + 14) / 3) < 1e-9);
  const secondTypical = (18 + 12 + 15) / 3;
  const expected = (points[0].value * 100 + secondTypical * 200) / 300;
  assert.ok(Math.abs(points[1].value - expected) < 1e-9);
});

test("a later candle does not change the anchored value behind it", () => {
  const candles = [bar(1, 12, 8, 10, 50), bar(2, 20, 10, 16, 50)];
  const first = anchoredVwap(candles.slice(0, 1), 1);
  const full = anchoredVwap(candles, 1);
  assert.equal(full[0].value, first[0].value);
});

test("candles without traded volume do not invent an anchored VWAP", () => {
  assert.deepEqual(anchoredVwap([bar(1, 12, 8, 10, 0)], 1), []);
});
