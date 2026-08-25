import test from "node:test";
import assert from "node:assert/strict";
import { analyzeNimbleCandles, isActiveBullishOversoldDivergence, isBullishOversoldDivergence, NIMBLE_STRATEGIES } from "../lib/nimble-scanner.ts";

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
    "macd-orb",
    "adx-golden-cross",
    "macd-triple-ema",
    "ema-30-50-100",
    "rsi-divergence-daily",
  ]);
});

test("new intraday NIFTY 500 scanners expose their intended intervals", () => {
  assert.equal(NIMBLE_STRATEGIES["macd-orb"].timeframe, 5);
  assert.equal(NIMBLE_STRATEGIES["adx-golden-cross"].timeframe, 15);
  assert.equal(NIMBLE_STRATEGIES["macd-triple-ema"].timeframe, 5);
  assert.match(NIMBLE_STRATEGIES["macd-orb"].description, /MACD/i);
  assert.match(NIMBLE_STRATEGIES["adx-golden-cross"].description, /ADX above 25/i);
  assert.match(NIMBLE_STRATEGIES["macd-triple-ema"].description, /EMA 9\/21\/50/i);
});

test("daily RSI divergence is a buy-side oversold strategy", () => {
  const strategy = NIMBLE_STRATEGIES["rsi-divergence-daily"];
  assert.equal(strategy.timeframe, "1D");
  assert.match(strategy.description, /bullish/i);
  assert.match(strategy.description, /first RSI low falls below 30/i);
});

test("investment EMA strategy uses 30, 50 and 100 on daily candles", () => {
  const strategy = NIMBLE_STRATEGIES["ema-30-50-100"];
  assert.equal(strategy.label, "30/50/100 EMA");
  assert.equal(strategy.timeframe, "1D");
  const candles = candlesFrom(Array.from({ length: 140 }, (_, index) => 100 + index * 0.8));
  const match = analyzeNimbleCandles(candles, "ema-30-50-100", "1D");
  assert.equal(match?.signal, "long");
  assert.equal(match?.setupStatus, "triggered");
});

test("daily RSI scanner detects a bullish NIFTY 500 buy-side divergence below RSI 30", () => {
  const prices = [
    ...Array.from({ length: 25 }, (_, index) => 120 - index * 0.15),
    ...Array.from({ length: 10 }, (_, index) => 115.4 - index),
    ...Array.from({ length: 8 }, (_, index) => 106.9 + index * 0.5),
    ...Array.from({ length: 18 }, (_, index) => 110.1 - index * 0.3),
    105.05,
    105.1,
    105.15,
  ];
  const match = analyzeNimbleCandles(candlesFrom(prices), "rsi-divergence-daily", "1D");
  assert.equal(match?.signal, "long");
  assert.equal(match?.setupStatus, "alert");
  assert.ok((match?.indicatorValue ?? 100) < 30);
  assert.ok((match?.target1 ?? 0) > (match?.entry ?? Number.POSITIVE_INFINITY));
});

test("daily bullish divergence allows the second RSI low above 30", () => {
  assert.equal(isBullishOversoldDivergence(100, 96, 24, 34), true);
  assert.equal(isBullishOversoldDivergence(100, 96, 31, 36), false);
  assert.equal(isBullishOversoldDivergence(100, 101, 24, 34), false);
  assert.equal(isBullishOversoldDivergence(100, 96, 24, 23), false);
});

test("daily bullish divergence stays active above 30 but expires at neutral RSI", () => {
  assert.equal(isActiveBullishOversoldDivergence(100, 96, 24, 34, 34.24), true);
  assert.equal(isActiveBullishOversoldDivergence(100, 96, 24, 34, 59.68), false);
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
