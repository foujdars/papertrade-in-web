import assert from "node:assert/strict";
import test from "node:test";
import { applyQuoteTick, derivePreviousClose, isNormalizedQuoteFresh, isSupportedChartInstrumentKey, isSupportedNseInstrumentKey, marketTimestamp, mergeNormalizedQuote, normalizeUpstoxQuote } from "../lib/upstox.ts";

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

const key = 'NSE_EQ|INE002A01018';
const today = Date.parse('2026-10-16T05:00:00Z');
const raw = (overrides = {}) => ({ instrument_token: key, symbol: 'TEST', last_price: 109, net_change: 9,
  timestamp: new Date(today).toISOString(), last_trade_time: String(today), ohlc: { open: 101, high: 111, low: 100, close: 100 }, ...overrides });

test('normalized full quotes agree on price, daily close, absolute change and percentage', () => {
  const quote = normalizeUpstoxQuote(raw({ ohlc: { close: 109 } }));
  assert.equal(quote.previousClose, 100, 'Use documented absolute net_change even when OHLC close has rolled');
  assert.equal(quote.netChange, 9);
  assert.equal(quote.changePercent, 9);
  assert.equal(quote.changeAvailable, true);
  assert.equal(quote.lastTradeAt, new Date(today).toISOString());
  const fallback = normalizeUpstoxQuote(raw({ net_change: 999 }));
  assert.equal(fallback.previousClose, 100);
  assert.equal(fallback.netChange, 9, 'Invalid net change must be recomputed from the fallback, not displayed alongside it');
  assert.equal(fallback.changePercent, 9);
});

test('missing changes and timestamps are unavailable and never fabricated as now', () => {
  for (const missing of [undefined, null, '']) {
    const quote = normalizeUpstoxQuote(raw({ net_change: missing, ohlc: {}, timestamp: missing, last_trade_time: missing }));
    assert.equal(quote.changeAvailable, false);
    assert.equal(quote.previousClose, 0);
    assert.equal(quote.lastTradeAt, '');
    assert.equal(quote.updatedAt, '');
    assert.equal(isNormalizedQuoteFresh(quote, today, today), false);
  }
  assert.equal(normalizeUpstoxQuote(raw({ last_price: null })), null);
  assert.equal(normalizeUpstoxQuote(raw({ last_price: -5 })), null);
  assert.equal(normalizeUpstoxQuote(raw({ last_price: '109', net_change: '9' })).changePercent, 9);
});

test('provider dates support documented ISO/milliseconds without invalid-date crashes', () => {
  for (const value of [today, String(today), today / 1000, today * 1000, new Date(today).toISOString()]) {
    assert.equal(marketTimestamp(value), new Date(today).toISOString());
  }
  for (const value of [undefined, null, '', 'invalid', 0, -1, Infinity, 1e99]) assert.equal(marketTimestamp(value), '');
});

test('stream previous close corrects a 17% old-session comparison to the actual 9%', () => {
  const old = normalizeUpstoxQuote(raw({ timestamp: new Date(today - 86_400_000).toISOString(), last_trade_time: String(today - 86_400_000), last_price: 100, net_change: 100 - 109 / 1.17 }));
  const corrected = applyQuoteTick(old, key, 'TEST', { price: 109, timestampMs: today, previousClose: 100 });
  assert.equal(corrected.changePercent, 9);
  assert.equal(corrected.previousClose, 100);
  assert.equal(corrected.high, 109, 'Do not retain yesterday\'s session range');
  const unknown = applyQuoteTick(old, key, 'TEST', { price: 109, timestampMs: today });
  assert.equal(unknown.changeAvailable, false, 'No reuse of yesterday\'s comparison close after session rollover');
  assert.equal(unknown.previousClose, 0);
  const initial = applyQuoteTick(undefined, key, 'TEST', { price: 109, timestampMs: today });
  assert.equal(initial.changeAvailable, false, 'An instrument catalogue estimate is not a live daily close');
});

test('a current-session REST comparison repairs newer ticks without rolling their price back', () => {
  const tick = applyQuoteTick(undefined, key, 'TEST', { price: 109, timestampMs: today + 5000 });
  const snapshot = normalizeUpstoxQuote(raw({ last_price: 108, net_change: 8 }));
  const merged = mergeNormalizedQuote(tick, snapshot);
  assert.equal(merged.lastPrice, 109);
  assert.equal(merged.lastTradeAt, tick.lastTradeAt);
  assert.equal(merged.changePercent, 9);
  const old = normalizeUpstoxQuote(raw({ timestamp: new Date(today - 86_400_000).toISOString(), last_trade_time: String(today - 86_400_000), net_change: 17 }));
  assert.equal(mergeNormalizedQuote(merged, old), merged, 'An older session cannot poison a corrected comparison');
  assert.equal(applyQuoteTick(merged, key, 'TEST', { price: 107, timestampMs: today - 1000, previousClose: 90 }), merged);
});

test('same-session missing close retains verified context and full quote volume', () => {
  const original = normalizeUpstoxQuote(raw({ volume: 12345 }));
  const next = applyQuoteTick(original, key, 'TEST', { price: 110, timestampMs: today + 1000 });
  assert.equal(next.changePercent, 10);
  assert.equal(next.volume, 12345);
  assert.equal(next.previousCloseAt, original.previousCloseAt);
  const noClose = normalizeUpstoxQuote(raw({ last_price: 111, net_change: null, ohlc: {}, last_trade_time: String(today + 2000) }));
  assert.equal(mergeNormalizedQuote(next, noClose).changePercent, 11);
});

test('equal last-trade timestamps still respect the newer provider observation', () => {
  const latest = normalizeUpstoxQuote(raw({ timestamp: new Date(today + 10_000).toISOString() }));
  const old = normalizeUpstoxQuote(raw({ last_price: 108, net_change: 8 }));
  assert.equal(mergeNormalizedQuote(latest, old), latest);
  assert.equal(applyQuoteTick(latest, key, 'TEST', { price: 108, timestampMs: today, updatedAtMs: today, previousClose: 100 }), latest);
  const otherExchange = applyQuoteTick({ ...latest, instrumentKey: 'BSE_EQ|INE002A01018' }, key, 'TEST', { price: 110, timestampMs: today + 20_000 });
  assert.equal(otherExchange.changeAvailable, false, 'A matching symbol in a different venue cannot supply the daily base');
});

test('freshness requires a recent provider observation as well as a recent receipt', () => {
  const quote = normalizeUpstoxQuote(raw());
  assert.equal(isNormalizedQuoteFresh(quote, today, today + 5000), true);
  assert.equal(isNormalizedQuoteFresh(quote, today + 60_000, today + 60_000), false, 'Re-fetching an old payload is not a new market update');
  assert.equal(isNormalizedQuoteFresh(quote, today, today + 60_000), false);
  assert.equal(isNormalizedQuoteFresh({ ...quote, updatedAt: new Date(today + 60_000).toISOString() }, today, today), false);
  const illiquid = { ...quote, lastTradeAt: new Date(today - 60 * 60_000).toISOString() };
  assert.equal(isNormalizedQuoteFresh(illiquid, today, today), true, 'A fresh full-quote observation can verify an older last trade');
});
