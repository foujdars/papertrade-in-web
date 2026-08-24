import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNimbleCandles, NIMBLE_STRATEGIES } from "../lib/nimble-scanner.ts";

function candlesFrom(prices) {
  return prices.map((close, index) => ({
    timestamp: Date.UTC(2026, 7, 8, 3, 45 + index * 5),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100_000 + index * 1_000,
  }));
}

test("exposes every requested NimbleScan strategy", () => {
  assert.deepEqual(Object.keys(NIMBLE_STRATEGIES), [
    "ema-retest",
    "ema-breakdown",
    "rsi-divergence-break",
    "ema-5-reversal",
    "weekly-fakeout-mtf",
    "bollinger-double-reversal",
    "ema-30-50-200",
    "rsi-divergence-daily",
  ]);
});

test("daily RSI divergence is a buy-side oversold strategy", () => {
  const strategy = NIMBLE_STRATEGIES["rsi-divergence-daily"];
  assert.equal(strategy.timeframe, "1D");
  assert.match(strategy.description, /buy-side/i);
  assert.match(strategy.description, /below RSI 30/i);
});

test("detects a completed candle below EMA 21", () => {
  const match = analyzeNimbleCandles(candlesFrom([...Array.from({ length: 24 }, (_, index) => 100 + index), 90]), "ema-breakdown", 5);
  assert.equal(match?.signal, "breakdown");
  assert.ok((match?.ema21 ?? 0) > 90);
});

test("creates a 5 EMA reversal alert using completed candles", () => {
  const candles = candlesFrom(Array(24).fill(100));
  candles.push({ timestamp: Date.UTC(2026, 7, 8, 6), open: 110, high: 112, low: 109, close: 111, volume: 200_000 });
  const match = analyzeNimbleCandles(candles, "ema-5-reversal", 5);
  assert.equal(match?.signal, "short");
  assert.equal(match?.setupStatus, "alert");
  assert.equal(match?.entry, 109);
  assert.equal(match?.stopLoss, 112);
});
