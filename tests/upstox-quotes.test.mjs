import assert from "node:assert/strict";
import test from "node:test";
import { derivePreviousClose, isSupportedChartInstrumentKey, isSupportedNseInstrumentKey } from "../lib/upstox.ts";

test('GIFT charts accept only the documented global key without widening Indian trading validation', () => {
  assert.equal(isSupportedChartInstrumentKey('GLOBAL_INDEX|SGX NIFTY'), true);
  assert.equal(isSupportedChartInstrumentKey('GLOBAL_INDEX|OTHER'), false);
  assert.equal(isSupportedNseInstrumentKey('GLOBAL_INDEX|SGX NIFTY'), false);
  assert.equal(isSupportedChartInstrumentKey('NSE_FO|123'), true);
});

test("derives the previous close from Upstox LTP and net change", () => {
  const lastPrice = 1_105.05;
  const netChange = 184.15;
  const previousClose = derivePreviousClose(lastPrice, netChange, lastPrice);

  assert.ok(Math.abs(previousClose - 920.9) < 0.000001);
  assert.equal(Number(((netChange / previousClose) * 100).toFixed(2)), 20);
});

test("falls back safely when Upstox does not provide a usable net change", () => {
  assert.equal(derivePreviousClose(100, Number.NaN, 95), 95);
  assert.equal(derivePreviousClose(100, Number.NaN, Number.NaN), 100);
});
