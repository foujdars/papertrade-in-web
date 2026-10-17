import test from 'node:test';
import assert from 'node:assert/strict';
import { algoPaperSignalReady } from '../lib/algo-paper-signal.ts';

const start = Date.parse('2026-10-16T09:15:00+05:30');
const config = (timeframe = '1m', direction = 'bullish') => ({ instrumentKey: 'NSE_EQ|TEST', fast: 2, slow: 3, direction, timeframe });
const bars = (values, seconds = 60) => values.map((close, i) => ({ time: start / 1000 + i * seconds, open: close, high: close, low: close, close, volume: 100 }));

test('EMA paper entry excludes an unfinished crossover and arbitrary future candle prices', () => {
  const candles = bars([100, 100, 100, 110, 1, 99999]);
  assert.equal(algoPaperSignalReady(candles, config(), start + 3.5 * 60_000), false);
  assert.equal(algoPaperSignalReady(candles, config(), start + 4 * 60_000), false, 'one-second close settlement is required');
  assert.equal(algoPaperSignalReady(candles, config(), start + 4 * 60_000 + 1000), true);
  const changedFuture = bars([100, 100, 100, 110, 99999, 1]);
  assert.equal(algoPaperSignalReady(changedFuture, config(), start + 4 * 60_000 + 1000), true, 'future bars cannot alter a closed-candle signal');
});

test('bearish EMA uses chronological closed bars and rejects an old crossover', () => {
  const candles = bars([100, 100, 100, 90]).reverse();
  assert.equal(algoPaperSignalReady(candles, config('1m', 'bearish'), start + 4 * 60_000 + 1000), true);
  assert.equal(algoPaperSignalReady(candles, config('1m', 'bullish'), start + 4 * 60_000 + 1000), false);
  assert.equal(algoPaperSignalReady(candles, config('1m', 'bearish'), start + 5 * 60_000 + 11_000), false, 'a stale latest completed bar cannot open a new paper trade');
});

test('every supported interval needs enough history and its own completed candle boundary', () => {
  for (const [timeframe, seconds] of [['1m', 60], ['5m', 300], ['15m', 900]]) {
    assert.equal(algoPaperSignalReady(bars([100, 100, 110], seconds), config(timeframe), start + 3 * seconds * 1000 + 1000), false, `${timeframe} warm-up`);
    assert.equal(algoPaperSignalReady(bars([100, 100, 100, 110], seconds), config(timeframe), start + 4 * seconds * 1000 + 1000), true, `${timeframe} closed crossover`);
  }
});
