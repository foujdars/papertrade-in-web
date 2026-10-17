import test from 'node:test';
import assert from 'node:assert/strict';
import { runAlgoBacktest, validateAlgoStrategy, calculateAlgoEma } from '../lib/algo-engine.ts';
import { createAlgoDemo, ALGO_DEMO_STRATEGIES } from '../lib/algo-demo.ts';

const start = Date.parse('2026-10-16T09:15:00+05:30') / 1000;
const bar = (minute, open = 100, high = open, low = open, close = open, extra = {}) => ({ time: start + minute * 60, open, high, low, close, volume: 100, ...extra });
const leg = (extra = {}) => ({ id: 'long', name: 'Exact stock', instrumentKey: 'NSE_EQ|EXACT', side: 'BUY', quantity: 1, lotSize: 1, stopLossPct: null, targetPct: null, ...extra });
const strategy = (extra = {}) => ({ id: 'test', name: 'Test strategy', capital: 100_000, entryTime: '09:15', exitTime: '09:18', entryCondition: { type: 'scheduled' }, legs: [leg()], maxLoss: null, profitTarget: null, feePerOrder: 0, slippageBps: 0, ...extra });
const run = (bars, extra = {}, options = {}) => runAlgoBacktest(strategy(extra), { 'NSE_EQ|EXACT': bars }, options);
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-6, `${value} != ${expected}`);

test('long and short trades use whole lots, adverse slippage, and both order fees', () => {
  const bars = [bar(0, 100), bar(1, 105), bar(2, 110), bar(3, 110)];
  const long = run(bars, { legs: [leg({ quantity: 2, lotSize: 25 })], slippageBps: 10, feePerOrder: 20 });
  near(long.trades[0].entryPrice, 100.1);
  near(long.trades[0].exitPrice, 109.89);
  near(long.summary.grossPnl, 489.5);
  near(long.summary.totalFees, 40);
  near(long.summary.netPnl, 449.5);
  near(long.summary.finalEquity, 100449.5);
  assert.equal(long.trades[0].units, 50);
  const short = run(bars, { legs: [leg({ side: 'SELL', quantity: 2 })], slippageBps: 10, feePerOrder: 2 });
  near(short.trades[0].entryPrice, 99.9);
  near(short.trades[0].exitPrice, 110.11);
  near(short.summary.netPnl, -24.42);
});

test('timed exits use the observed exit-time open, including a gap', () => {
  const result = run([bar(0, 100), bar(1, 100), bar(2, 100), bar(3, 80)]);
  assert.equal(result.trades[0].exitTime, start + 180);
  assert.equal(result.trades[0].exitPrice, 80);
  assert.equal(result.trades[0].exitReason, 'session_exit');
});

test('a long stop wins when both stop and target touch in one OHLC bar', () => {
  const result = run([bar(0, 100, 110, 90, 106), bar(1, 106)], { legs: [leg({ stopLossPct: 5, targetPct: 5 })] });
  assert.equal(result.trades[0].exitPrice, 95);
  assert.equal(result.trades[0].exitReason, 'stop_loss');
  assert.equal(result.summary.netPnl, -5);
});

test('a short stop also wins on an ambiguous bar', () => {
  const result = run([bar(0, 100, 110, 90, 94)], { legs: [leg({ side: 'SELL', stopLossPct: 5, targetPct: 5 })] });
  assert.equal(result.trades[0].exitPrice, 105);
  assert.equal(result.trades[0].exitReason, 'stop_loss');
});

test('stop gaps execute at the worse observed open, not the old threshold', () => {
  const result = run([bar(0, 100), bar(1, 80)], { legs: [leg({ stopLossPct: 5 })], slippageBps: 10 });
  near(result.trades[0].exitPrice, 79.92);
  assert.equal(result.trades[0].exitTime, start + 60);
  assert.ok(result.summary.netPnl < -20);
});

test('target gaps execute at the observed open and apply adverse exit slippage', () => {
  const result = run([bar(0, 100), bar(1, 90)], { legs: [leg({ side: 'SELL', targetPct: 5 })], slippageBps: 10 });
  near(result.trades[0].exitPrice, 90.09);
  assert.equal(result.trades[0].exitReason, 'target');
});

test('basket profit limits use net synchronized marks and close all open legs', () => {
  const plan = strategy({ legs: [leg({ quantity: 10 }), leg({ id: 'short', instrumentKey: 'NSE_FO|EXACT', side: 'SELL', quantity: 10 })], profitTarget: 100, feePerOrder: 1 });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0, 100), bar(1, 110)], 'NSE_FO|EXACT': [bar(0, 50), bar(1, 40)] });
  assert.equal(result.trades.length, 2);
  assert.ok(result.trades.every(trade => trade.exitReason === 'basket_target'));
  assert.equal(result.summary.netPnl, 196);
  assert.equal(result.summary.totalFees, 4);
});

test('basket stop includes realized results from a previously stopped leg', () => {
  const plan = strategy({ maxLoss: 8, legs: [leg({ stopLossPct: 5 }), leg({ id: 'hedge', instrumentKey: 'NSE_FO|EXACT' })] });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0, 100, 100, 95, 96), bar(1, 96)], 'NSE_FO|EXACT': [bar(0, 50), bar(1, 45)] });
  assert.equal(result.trades[0].exitReason, 'stop_loss');
  assert.equal(result.trades[1].exitReason, 'basket_stop');
  assert.equal(result.summary.netPnl, -10);
});

test('basket risk never sums different legs intrabar extremes as simultaneous', () => {
  const plan = strategy({ maxLoss: 10, legs: [leg(), leg({ id: 'hedge', instrumentKey: 'NSE_FO|EXACT' })] });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0, 100, 110, 80, 100), bar(1, 100)], 'NSE_FO|EXACT': [bar(0, 50, 80, 30, 50), bar(1, 50)] });
  assert.ok(result.trades.every(trade => trade.exitReason === 'data_end'));
  assert.equal(result.summary.netPnl, 0);
});

test('missing leg candles delay the whole basket rather than invent a price', () => {
  const plan = strategy({ legs: [leg(), leg({ id: 'second', instrumentKey: 'NSE_FO|EXACT' })] });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0, 100), bar(1, 105), bar(2, 106)], 'NSE_FO|EXACT': [bar(1, 50), bar(2, 51)] });
  assert.equal(result.trades.length, 2);
  assert.ok(result.trades.every(trade => trade.entryTime === start + 60));
  assert.equal(result.trades[0].entryPrice, 105);
  assert.match(result.warnings.join(' '), /lacked a candle/);
});

test('missing exact instrument data is an error, never a demo or another key', () => {
  assert.throws(() => runAlgoBacktest(strategy(), { 'NSE_EQ|OTHER': [bar(0)] }), /No historical candles/);
  assert.throws(() => runAlgoBacktest(strategy(), {}), /No substitute data/);
});

test('zero-volume carry-forward bars cannot execute an entry', () => {
  const result = run([bar(0, 100, 100, 100, 100, { volume: 0 }), bar(1, 110), bar(2, 111)]);
  assert.equal(result.trades[0].entryTime, start + 60);
  assert.equal(result.trades[0].entryPrice, 110);
  assert.match(result.warnings.join(' '), /zero-volume/);
});

test('one basket per IST date, even after a stop, with fresh entries the next day', () => {
  const first = [bar(0, 100, 100, 90, 95), bar(1, 100, 100, 90, 95)];
  const next = first.map(candle => ({ ...candle, time: candle.time + 3 * 86400 })); // Monday
  const result = run([...first, ...next], { legs: [leg({ stopLossPct: 5 })] });
  assert.equal(result.trades.length, 2);
  assert.deepEqual(result.trades.map(trade => trade.sessionDate), ['2026-10-16', '2026-10-19']);
});

test('weekends and out-of-session bars are excluded', () => {
  const bars = [bar(-1), bar(0), bar(1), bar(2), bar(3), bar(0, 100, 100, 100, 100, { time: start + 86400 })];
  const result = run(bars);
  assert.equal(result.trades.length, 1);
  assert.match(result.warnings.join(' '), /outside weekday NSE/);
});

test('EMA warms up without publishing premature values', () => {
  assert.deepEqual(calculateAlgoEma([10, 10, 10, 20], 3), [null, null, 10, 15]);
  assert.throws(() => calculateAlgoEma([10, NaN], 3), /finite/);
  assert.throws(() => calculateAlgoEma([10], 0), /period/);
});

test('EMA crossover executes at the next bar open, not its own closing price', () => {
  const bars = [bar(0, 10), bar(1, 10), bar(2, 10), bar(3, 10, 20, 10, 20), bar(4, 30), bar(5, 35)];
  const plan = { exitTime: '09:21', entryCondition: { type: 'ema_cross', fastPeriod: 1, slowPeriod: 3, direction: 'bullish', signalInstrumentKey: 'NSE_EQ|EXACT' } };
  const result = run(bars, plan);
  assert.equal(result.trades[0].entryTime, start + 240);
  assert.equal(result.trades[0].entryPrice, 30);
  const changedFuture = run([...bars.slice(0, 5), bar(5, 500)], plan);
  assert.equal(changedFuture.trades[0].entryTime, result.trades[0].entryTime);
  assert.equal(changedFuture.trades[0].entryPrice, result.trades[0].entryPrice);
});

test('separate signal instruments never supply execution prices to a leg', () => {
  const plan = strategy({ exitTime: '09:21', entryCondition: { type: 'ema_cross', fastPeriod: 1, slowPeriod: 3, direction: 'bullish', signalInstrumentKey: 'NSE_INDEX|SIGNAL' } });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0, 100), bar(1, 100), bar(2, 100), bar(3, 100), bar(4, 120), bar(5, 125)], 'NSE_INDEX|SIGNAL': [bar(0, 10), bar(1, 10), bar(2, 10), bar(3, 10, 20, 10, 20), bar(4, 20)] });
  assert.equal(result.trades[0].entryPrice, 120);
});

test('a crossover is not carried past a missing next execution bar', () => {
  const plan = strategy({ exitTime: '09:22', entryCondition: { type: 'ema_cross', fastPeriod: 1, slowPeriod: 3, direction: 'bullish', signalInstrumentKey: 'NSE_INDEX|SIGNAL' } });
  const result = runAlgoBacktest(plan, { 'NSE_EQ|EXACT': [bar(0), bar(1), bar(2), bar(3), bar(5), bar(6)], 'NSE_INDEX|SIGNAL': [bar(0, 10), bar(1, 10), bar(2, 10), bar(3, 10, 20, 10, 20), bar(4, 20)] });
  assert.equal(result.trades.length, 0);
});

test('5-minute signal bars must finish before they can trigger a fill', () => {
  const bars = [bar(0, 10), bar(5, 10), bar(10, 10), bar(15, 10, 20, 10, 20), bar(20, 30), bar(25, 40)];
  const result = run(bars, { exitTime: '09:45', entryCondition: { type: 'ema_cross', fastPeriod: 1, slowPeriod: 3, direction: 'bullish', signalInstrumentKey: 'NSE_EQ|EXACT' } }, { barIntervalSeconds: 300 });
  assert.equal(result.trades[0].entryTime, start + 20 * 60);
  assert.equal(result.trades[0].entryPrice, 30);
  assert.throws(() => run([bar(0), bar(1)], {}, { barIntervalSeconds: 300 }), /overlap/);
});

test('backtest never leaves an invisible open position when data ends early', () => {
  const result = run([bar(0, 100), bar(1, 102)]);
  assert.equal(result.trades[0].exitReason, 'data_end');
  assert.equal(result.summary.netPnl, 2);
  assert.equal(result.equity.at(-1).equity, result.summary.finalEquity);
  assert.match(result.warnings.join(' '), /data_end/);
});

test('equity and drawdown include costs and unrealized adverse movement', () => {
  const result = run([bar(0, 100), bar(1, 90), bar(2, 110), bar(3, 110)], { feePerOrder: 1 });
  assert.equal(result.summary.netPnl, 8);
  assert.equal(result.summary.maxDrawdown, 11);
  near(result.summary.maxDrawdownPct, 0.011);
  assert.equal(result.summary.winRate, 100);
  assert.equal(result.equity.at(-1).equity, 100008);
  assert.ok(result.equity.every((point, index) => index === 0 || point.time > result.equity[index - 1].time));
});

test('gross leg notional and reserved fees must fit virtual equity, including shorts', () => {
  const result = run([bar(0), bar(1), bar(2), bar(3)], { capital: 100, legs: [leg({ side: 'SELL' })], feePerOrder: 1 });
  assert.equal(result.trades.length, 0);
  assert.match(result.warnings.join(' '), /gross leg notional/);
  const exact = run([bar(0), bar(1), bar(2), bar(3)], { capital: 102, legs: [leg({ side: 'SELL' })], feePerOrder: 1 });
  assert.equal(exact.trades.length, 1);
});

test('strict config validation rejects malformed numbers, lots, times and risk settings', () => {
  assert.deepEqual(validateAlgoStrategy(strategy()), []);
  for (const invalid of [{ capital: NaN }, { capital: '1000' }, { slippageBps: -1 }, { feePerOrder: -1 }, { maxLoss: 0 }, { entryTime: '9:15' }, { exitTime: '09:14' }, { entryTime: '08:00' }, { exitTime: '16:00' }, { legs: [] }, { legs: [leg({ quantity: 1.5 })] }, { legs: [leg({ lotSize: 0 })] }, { legs: [leg({ instrumentKey: '' })] }, { legs: [leg({ stopLossPct: 100 })] }, { legs: [leg({ side: 'SELL', targetPct: 100 })] }, { legs: [leg(), leg()] }]) {
    assert.ok(validateAlgoStrategy(strategy(invalid)).length, JSON.stringify(invalid));
    assert.throws(() => run([bar(0)], invalid));
  }
});

test('bad and duplicate candles fail instead of silently becoming valid data', () => {
  for (const bars of [[bar(0, 0)], [bar(0, 100, 90)], [bar(0, 100, 100, 110)], [bar(0, 100, 100, 100, NaN)], [bar(0, 100, 100, 100, 100, { volume: -1 })], [bar(0), bar(0)], [bar(0, 100, 100, 100, 100, { time: start * 1000 })]]) assert.throws(() => run(bars), /Invalid|Duplicate/);
});

test('input arrays and strategy stay untouched; unsorted candles are chronological', () => {
  const bars = [bar(2, 110), bar(0, 100), bar(1, 105), bar(3, 110)];
  const saved = structuredClone(bars);
  const result = run(bars);
  assert.deepEqual(bars, saved);
  assert.equal(result.trades[0].entryPrice, 100);
  assert.equal(result.summary.netPnl, 10);
  assert.match(result.warnings.join(' '), /ordered chronologically/);
});

test('demo fixtures are deterministic, labeled, independent and prohibited in historical mode', () => {
  const a = createAlgoDemo(), b = createAlgoDemo();
  assert.deepEqual(a, b);
  const result = runAlgoBacktest(a.strategy, a.candles, { dataMode: 'demo' });
  assert.equal(result.dataMode, 'demo');
  assert.equal(result.trades.length, 10);
  assert.match(result.warnings.join(' '), /synthetic/);
  assert.throws(() => runAlgoBacktest(a.strategy, a.candles), /Demo instruments/);
  a.strategy.legs[0].quantity = 99;
  assert.equal(ALGO_DEMO_STRATEGIES[0].legs[0].quantity, 2);
  const ema = runAlgoBacktest(ALGO_DEMO_STRATEGIES[1], b.candles, { dataMode: 'demo' });
  assert.ok(ema.trades.length > 0);
});
