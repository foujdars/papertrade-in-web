import test from "node:test";
import assert from "node:assert/strict";
import { datedSentiment, screenFundamentals, scoreHeadline, rankResearch, researchFactors, buildDailyResearch, marketRegime } from "../lib/research.ts";
const now = Date.parse("2026-10-02T11:00:00Z"), day = 86400000;
const headline = (title, at = now - day, url = "https://example.com/news") => ({ title, publishedAt: at, url, source: "Test" });
const candles = (growth = .1, length = 100) => Array.from({ length }, (_, i) => ({ time: Math.floor(now / 1000) - (length - i) * 86400, open: 100 + i * growth, high: 101 + i * growth, low: 99 + i * growth, close: 100 + i * growth, volume: i === length - 1 ? 400 : 100 }));
test("news excludes undated, future, stale and duplicate headlines without inventing neutral evidence", () => {
  const r = datedSentiment([headline("Strong profit growth"), headline("Strong profit growth", now - 1000, "https://example.com/copy"), headline("Fraud probe", now + 1), headline("Upgrade", 0), headline("Losses", now - 6 * day)], now);
  assert.equal(r.count, 1); assert.equal(r.excluded, 4); assert.ok(r.score > 0 && r.score < 1);
  assert.equal(datedSentiment([], now).score, null);
  assert.equal(scoreHeadline("Results not strong; weak margins"), -1);
});
test("fundamental missing/stale information is unknown; bank leverage is context", () => {
  const data = { pe: 20, roe: 15, debtEquity: 10, currentRatio: .5, revenueGrowth: 12, profitMargin: 10, sector: "Financial Services", asOf: now, financialPeriod: now - 90 * day, source: "Test", sourceUrl: "https://example.com" };
  assert.equal(screenFundamentals(data, now).status, "pass");
  assert.equal(screenFundamentals({ ...data, sector: "Industrials" }, now).status, "flag");
  assert.equal(screenFundamentals({ ...data, asOf: now - 31 * day }, now).status, "unknown");
  assert.equal(screenFundamentals({ ...data, asOf: now + 1 }, now).status, "unknown");
  assert.equal(screenFundamentals(null, now).score, null);
});
test("ranking is tied fairly, omits missing factors, and explains percentiles", () => {
  const rows = rankResearch([{ symbol: "A", raw: { momentum: 1, trend: 1 } }, { symbol: "B", raw: { momentum: 0 } }, { symbol: "C", raw: { momentum: 1 } }]);
  assert.equal(rows.find(r => r.symbol === "A").factors.momentum, 75);
  assert.equal(rows.find(r => r.symbol === "C").factors.momentum, 75);
  assert.equal(rows.find(r => r.symbol === "B").factors.trend, undefined);
  assert.equal(rows.find(r => r.symbol === "B").score, 0);
});
test("strength compares matching dates and volume excludes the signal bar from its average", () => {
  const result = researchFactors(candles(.2), candles(.1));
  assert.ok(result.relativeStrength > 0); assert.equal(result.volume, 4);
  assert.equal(researchFactors(candles(.2), candles(.1).map(c => ({ ...c, time: c.time + 1 }))).relativeStrength, undefined);
});
test("daily scan reports partial coverage and a future price shock cannot affect prior input", () => {
  const input = { symbol: "A", name: "A", sector: "Test", candles: candles(), fundamentals: null, headlines: [], errors: ["Fundamentals unavailable"] };
  const a = buildDailyResearch([input], candles(), null, now, 2);
  const future = { time: now / 1000 + 86400, open: 900, close: 999, high: 1000, low: 800, volume: 10000 };
  const b = buildDailyResearch([{ ...input, candles: [...input.candles, future] }], candles(), null, now, 2);
  assert.deepEqual(a, b); assert.equal(a.partial, true); assert.equal(a.scanned, 1);
  assert.equal(marketRegime(candles(), [candles(), candles(), candles()], 40).state, "stress");
});
