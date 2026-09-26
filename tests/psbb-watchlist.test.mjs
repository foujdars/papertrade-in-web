import test from 'node:test';
import assert from 'node:assert/strict';
import { TRADING_TIMEFRAMES, indiaMonth, monthWindow, monthlySetups, psbbHistoryPlan, nseCandleEnd, buildTradingReport } from '../lib/psbb-watchlist.ts';
import { psbbSetups } from '../lib/psbb.ts';
import { tradingUniverse, TRADING_GROUPS } from '../lib/trading-universes.ts';
const epoch = (text) => Date.parse(text) / 1000;
const bar = (time, high, low, close) => ({ time, high, low, close, open: close, volume: 100 });
test('categories separate cash stocks, F&O underlyings, PSU banks and exactly three indices', () => {
  const a = { symbol: 'A', instrumentKey: 'NSE_EQ|INE001', categories: ['NIFTY 50', 'NIFTY 500'] };
  const b = { symbol: 'B', instrumentKey: 'NSE_EQ|INE002', categories: ['NIFTY PSU BANK', 'NIFTY 500'] };
  const future = { symbol: 'A FUT', instrumentKey: 'NSE_FO|123', categories: ['NIFTY 50'] };
  const stocks = [a, b, a, future];
  assert.equal(TRADING_GROUPS.length, 5);
  assert.deepEqual(tradingUniverse('Nifty 50 stocks', stocks), [a]);
  assert.deepEqual(tradingUniverse('PSU bank stocks', stocks), [b]);
  assert.deepEqual(tradingUniverse('Nifty 500 stocks', stocks), [a, b]);
  assert.deepEqual(tradingUniverse('F&O stocks', stocks, [{ instrumentKey: b.instrumentKey, underlyingType: 'EQUITY' }]), [b]);
  assert.deepEqual(tradingUniverse('F&O stocks', stocks), []);
  assert.deepEqual(tradingUniverse('Indices', stocks).map(x => x.symbol), ['NIFTY', 'BANKNIFTY', 'SENSEX']);
});

test('trading frames exclude 1D and calendar months use IST including leap years', () => {
  assert.deepEqual(TRADING_TIMEFRAMES, ['1m', '5m', '15m', '1H', '4H']);
  assert.equal(indiaMonth(Date.parse('2026-08-31T19:00:00Z')), '2026-09');
  const range = monthWindow('2024-02');
  assert.equal(range.end - range.start, 29 * 86400);
  assert.equal(range.start, epoch('2024-02-01T00:00:00+05:30'));
  assert.throws(() => monthWindow('2026-13'));
});

test('history chunks cover the month plus warmup within provider limits without overlap', () => {
  for (const frame of TRADING_TIMEFRAMES) {
    const plan = psbbHistoryPlan('2026-08', frame, Date.parse('2026-09-26'));
    assert.equal(plan.currentMonth, false);
    assert.equal(plan.chunks.at(-1).to, '2026-08-31');
    let previous;
    for (const chunk of plan.chunks) {
      const from = Date.parse(chunk.from), to = Date.parse(chunk.to);
      assert.ok((to - from) / 86400000 < (frame.endsWith('H') ? 80 : 28));
      if (previous) assert.equal(from - previous, 86400000);
      previous = to;
    }
    assert.ok(Date.parse(plan.chunks[0].from) < Date.parse('2026-08-01'));
  }
  assert.throws(() => psbbHistoryPlan('2027-01', '5m', Date.parse('2026-09-26')));
  assert.throws(() => psbbHistoryPlan('2021-12', '5m', Date.parse('2026-09-26')));
});

test('last partial NSE hourly candle completes at session close', () => {
  assert.equal(nseCandleEnd(epoch('2026-09-01T13:15:00+05:30'), '4H'), epoch('2026-09-01T15:30:00+05:30'));
  assert.equal(nseCandleEnd(epoch('2026-09-01T14:15:00+05:30'), '1H'), epoch('2026-09-01T15:15:00+05:30'));
});

test('monthly selection retains more than four trades and distinguishes all four statuses', () => {
  const { start, end } = monthWindow('2026-09');
  const setups = Array.from({ length: 12 }, (_, i) => ({ side: 'short', firstTime: start + i, secondTime: start + i + 100, confirmedTime: start + i + 200, mssTime: i % 4 === 0 ? null : start + i + 300, shifted: i % 4 !== 0, status: ['active', 'formed', 'failed', 'passed'][i % 4] }));
  setups.push({ ...setups[1], mssTime: start - 1 }, { ...setups[1], mssTime: end });
  const rows = monthlySetups(setups, '2026-09');
  assert.equal(rows.length, 12);
  for (const status of ['pending', 'active', 'failed', 'success']) assert.equal(rows.filter((row) => row.status === status).length, 3);
  assert.equal(new Set(rows.map((row) => row.id)).size, 12);
});

test('PSBB engine retains all entries for a monthly ledger', () => {
  const candles = [], momentum = [];
  const points = [[100,90,95,50],[110,100,105,75],[120,110,115,72],[130,120,125,65],[125,115,120,60],[118,100,106,50],[122,108,116,55],[116,104,110,50],[112,95,98,40],[110,65,75,45]];
  for (let cycle = 0; cycle < 8; cycle++) for (const [high, low, close, rsi] of points) { candles.push(bar(candles.length, high, low, close)); momentum.push(rsi); }
  candles.push(bar(candles.length, 100, 90, 95)); momentum.push(50);
  assert.equal(psbbSetups(candles, momentum, { left: 1 }).filter((setup) => setup.shifted).length, 8);
});

function realCandles() {
  const start = epoch('2026-09-01T09:15:00+05:30');
  const pattern = [[110,90,108],[120,95,100],[130,100,110],[125,99,105],[118,90,94],[122,96,115],[116,94,100],[112,85,88]];
  return [...Array.from({ length: 20 }, () => [100,90,95]), ...pattern].map(([h,l,c],i) => bar(start + i * 60, h,l,c));
}
test('scanner evaluates all closed candles, omits forming bars, and uses highest swing + 1R', () => {
  const candles = realCandles(), end = candles.at(-1).time + 60;
  const run = (now) => buildTradingReport('NSE_EQ|TEST', '1m', '2026-09', candles, { length: 2, left: 1, oversold: 1, overbought: 99 }, now * 1000);
  assert.equal(run(end - 1).counts.active, 0);
  const report = run(end);
  assert.equal(report.counts.active, 1);
  assert.equal(report.rows[0].setup.stop, 130);
  assert.equal(report.rows[0].setup.entry, 90);
  assert.equal(report.rows[0].setup.target1, 50);
  assert.equal(report.coverage, 'limited');
});
test('1R success is final, stop/target same-bar is failed, and next-month prices cannot alter past results', () => {
  const candles = realCandles();
  const next = candles.at(-1).time + 60;
  const run = (data, now = (next + 300) * 1000) => buildTradingReport('NSE_EQ|TEST', '1m', '2026-09', data, { length: 2, left: 1, oversold: 1, overbought: 99 }, now);
  assert.equal(run([...candles, bar(next, 110, 45, 48)]).counts.success, 1);
  assert.equal(run([...candles, bar(next, 135, 45, 80)]).counts.failed, 1);
  const future = bar(epoch('2026-10-01T09:15:00+05:30'), 110, 45, 48);
  const frozen = run([...candles, future], Date.parse('2026-10-02'));
  assert.equal(frozen.counts.success, 0);
  assert.equal(frozen.counts.active, 1);
});
