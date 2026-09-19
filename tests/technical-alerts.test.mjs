import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ entryPoints: ['lib/technical-alerts.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { defaultTechnicalConfig: defaults, technicalConfigError, evaluateTechnical, technicalBarEnd, technicalCheckDue, advanceTechnical, parseTechnicalStore, technicalLimitError, validTechnicalCandles } = api;
const start = Date.parse('2026-09-18T09:15:00+05:30') / 1000;
const bars = values => values.map((close, i) => ({ time: start + i * 300, open: 100, high: Math.max(100, close) + 1, low: Math.min(100, close) - 1, close, volume: 1000 }));
const flat = Array(45).fill(100);
const evaluate = (family, condition, values, settings = {}, daily = []) => {
  const data = bars(values), config = { ...defaults(family), condition, ...settings };
  return evaluateTechnical(config, data, daily, (data.at(-1).time + 310) * 1000);
};
for (const family of ['ema', 'sma']) {
  for (const [condition, last] of [['priceUp', 110], ['priceDown', 90], ['averageUp', 110], ['averageDown', 90]]) {
    test(`${family} ${condition} requires a crossing, not merely staying above/below`, () => {
      assert.equal(evaluate(family, condition, [...flat, last], { period: 5, slow: 10 }).hit, true);
      assert.equal(evaluate(family, condition, [...flat, last, last], { period: 5, slow: 10 }).hit, false);
    });
  }
}
test('forming bars and the five-second close-finalisation delay never trigger', () => {
  const data = bars([...flat, 120]), config = defaults('ema'), end = data.at(-1).time + 300;
  assert.notEqual(evaluateTechnical(config, data, [], (end - 1) * 1000).hit, true);
  assert.notEqual(evaluateTechnical(config, data, [], (end + 4) * 1000).hit, true);
  assert.equal(evaluateTechnical(config, data, [], (end + 5) * 1000).hit, true);
});
test('stale history and insufficient warm-up produce waiting states', () => {
  const data = bars([...flat, 120]);
  assert.match(evaluateTechnical(defaults(), data, [], (data.at(-1).time + 481) * 1000).state, /fresh/);
  assert.match(evaluate('ema', 'priceUp', [100, 120]).state, /Warming/);
});
test('daily and shortened last hourly candles close at 15:30 IST', () => {
  const close = Date.parse('2026-09-18T15:30:00+05:30') / 1000;
  assert.equal(technicalBarEnd(Date.parse('2026-09-18T00:00:00+05:30') / 1000, '1D'), close);
  assert.equal(technicalBarEnd(Date.parse('2026-09-18T15:15:00+05:30') / 1000, '1H'), close);
  assert.equal(technicalBarEnd(Date.parse('2026-09-18T15:25:00+05:30') / 1000, '5m'), close);
});
test('daily rules fetch only near close; intraday checks respect session-aligned boundaries', () => {
  const at = time => Date.parse(`2026-09-18T${time}+05:30`);
  assert.equal(technicalCheckDue('1D', at('12:00:10')), false);
  assert.equal(technicalCheckDue('1D', at('15:30:10')), true);
  assert.equal(technicalCheckDue('1D', at('15:33:01')), false);
  assert.equal(technicalCheckDue('5m', at('09:15:10')), false);
  assert.equal(technicalCheckDue('5m', at('09:20:04')), false);
  assert.equal(technicalCheckDue('5m', at('09:20:10')), true);
  assert.equal(technicalCheckDue('1H', at('10:00:10')), false);
  assert.equal(technicalCheckDue('1H', at('10:15:10')), true);
});
test('RSI handles threshold crossings, all-up, all-down, and flat data', () => {
  assert.equal(evaluate('rsi', 'up', [...flat, 90, 120], { period: 2, threshold: 50 }).hit, true);
  assert.equal(evaluate('rsi', 'down', [...flat, 110, 80], { period: 2, threshold: 50 }).hit, true);
  assert.match(evaluate('rsi', 'up', flat, { period: 2, threshold: 50 }).detail, /50.00 → 50.00/);
  assert.match(evaluate('rsi', 'up', flat.map((_, i) => 100 + i), { period: 2 }).detail, /100.00 → 100.00/);
  assert.match(evaluate('rsi', 'down', flat.map((_, i) => 100 - i), { period: 2 }).detail, /0.00 → 0.00/);
});
for (const condition of ['signalUp', 'signalDown', 'zeroUp', 'zeroDown']) test(`MACD ${condition}`, () => {
  assert.equal(evaluate('macd', condition, [...flat, condition.endsWith('Up') ? 110 : 90]).hit, true);
});
test('VWAP uses volume, resets sessions, and refuses partial session history', () => {
  assert.equal(evaluate('vwap', 'up', [...flat, 110]).hit, true);
  assert.equal(evaluate('vwap', 'down', [...flat, 90]).hit, true);
  const data = bars([...flat, 110]), now = (data.at(-1).time + 310) * 1000;
  assert.match(evaluateTechnical(defaults('vwap'), data.map(c => ({ ...c, volume: 0 })), [], now).state, /volume/);
  assert.match(evaluateTechnical(defaults('vwap'), data.slice(1), [], now).state, /full session/);
  assert.match(evaluateTechnical(defaults('vwap'), data.filter((_, i) => i !== 3), [], now).state, /full session/);
});
test('Supertrend direction changes in both directions', () => {
  assert.equal(evaluate('supertrend', 'down', [...flat, 75], { period: 2, multiplier: 1 }).hit, true);
  assert.equal(evaluate('supertrend', 'up', [...flat, 75, 130], { period: 2, multiplier: 1 }).hit, true);
});
for (const [condition, tail] of [['upperOut', [120]], ['lowerOut', [80]], ['upperIn', [120, 100]], ['lowerIn', [80, 100]]]) test(`Bollinger ${condition}`, () => {
  assert.equal(evaluate('bollinger', condition, [...flat, ...tail]).hit, true);
});
test('a jump through both Bollinger bands is not a return inside', () => {
  assert.equal(evaluate('bollinger', 'upperIn', [...flat, 120, 60]).hit, false);
});
test('previous-day breakouts use completed daily candles and ignore today', () => {
  const daily = [{ time: start - 86400, open: 100, high: 105, low: 95, close: 100, volume: 1000 }, { time: start, open: 100, high: 999, low: 1, close: 100, volume: 1000 }];
  assert.equal(evaluate('previousDay', 'up', [...flat, 110], {}, daily).hit, true);
  assert.equal(evaluate('previousDay', 'down', [...flat, 90], {}, daily).hit, true);
  assert.match(evaluate('previousDay', 'up', [...flat, 110]).state, /previous trading-day/);
});
const instrument = { symbol: 'TEST', name: 'Test', instrumentKey: 'NSE_EQ|TEST', exchange: 'NSE', categories: [], price: 100, change: 0 };
const now = (start + 3600) * 1000;
const rule = (overrides = {}) => ({ ...defaults(), id: 'r1', revision: 'v1', instrument, createdAt: now - 10000, armedAt: now - 10000, expiresAt: now + 86400000, status: 'active', ...overrides });
const result = { state: 'Watching', barTime: start + 3300, end: start + 3600, price: 110, hit: true, detail: 'Crossed' };
test('once-only event persists a deterministic ID and completes the rule', () => {
  const first = advanceTechnical(rule(), result, now + 10000);
  assert.equal(first.rule.status, 'completed'); assert.equal(first.event.id, `technical:r1:v1:${result.barTime}`);
  assert.equal(advanceTechnical(first.rule, result, now + 30000).event, undefined);
});
test('repeating alerts deduplicate a bar and allow a new crossing later', () => {
  const first = advanceTechnical(rule({ repeat: 'repeat' }), result, now + 10000);
  assert.equal(first.rule.status, 'active');
  assert.equal(advanceTechnical(first.rule, result, now + 20000).event, undefined);
  assert.ok(advanceTechnical(first.rule, { ...result, barTime: result.barTime + 300, end: result.end + 300 }, now + 310000).event);
});
test('create, resume, stale, cooldown, paused and expired guards suppress delivery', () => {
  assert.equal(advanceTechnical(rule({ armedAt: now + 1 }), result, now + 10000).event, undefined);
  assert.equal(advanceTechnical(rule(), result, now + 181000).event, undefined);
  assert.equal(advanceTechnical(rule({ lastTriggeredAt: now - 20000, cooldown: 5 }), result, now + 10000).event, undefined);
  assert.equal(advanceTechnical(rule({ status: 'paused' }), result, now + 10000).event, undefined);
  assert.equal(advanceTechnical(rule({ expiresAt: now }), result, now + 10000).event, undefined);
});
test('validation rejects unsupported, non-finite and inconsistent configurations', () => {
  assert.equal(technicalConfigError(defaults()), null);
  for (const invalid of [{ period: 0 }, { period: NaN }, { period: 2.5 }, { family: 'bad' }, { timeframe: '1W' }, { condition: 'bad' }, { cooldown: -1 }, { days: 99 }, { family: 'macd', condition: 'signalUp', period: 30, slow: 20 }, { family: 'vwap', condition: 'up', timeframe: '1D' }]) assert.ok(technicalConfigError({ ...defaults(), ...invalid }));
});
test('storage corruption never silently overwrites saved rules', () => {
  assert.equal(parseTechnicalStore(null).rules.length, 0);
  assert.deepEqual(parseTechnicalStore(JSON.stringify({ version: 1, rules: [rule()], events: [] })).rules[0], rule());
  assert.throws(() => parseTechnicalStore('{bad'));
  assert.throws(() => parseTechnicalStore(JSON.stringify({ version: 2, rules: [], events: [] })));
  assert.throws(() => parseTechnicalStore(JSON.stringify({ version: 1, rules: [rule({ period: 0 })], events: [] })));
});
test('monitor capacity is bounded by rule count and unique symbol/timeframe groups', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => rule({ id: String(i) }));
  assert.match(technicalLimitError(twelve, rule({ id: 'new' })), /12/);
  assert.equal(technicalLimitError(twelve, rule({ id: '1' })), null);
  const six = Array.from({ length: 6 }, (_, i) => rule({ id: String(i), instrument: { ...instrument, instrumentKey: `NSE_EQ|${i}` } }));
  assert.match(technicalLimitError(six, rule({ id: 'new' })), /6 symbol/);
});
test('candle validation sorts, deduplicates and excludes impossible OHLC', () => {
  const data = bars([100, 110]);
  assert.equal(validTechnicalCandles([data[1], data[0], data[1], { ...data[1], time: start + 900, high: 1 }]).length, 2);
});
test('volume spike excludes its own volume from the baseline and fires only on entry', () => {
  const data = bars(Array(25).fill(100)); data.at(-1).volume = 2500;
  const config = defaults('volume'), now = (data.at(-1).time + 310) * 1000;
  const result = evaluateTechnical(config, data, [], now);
  assert.equal(result.hit, true); assert.match(result.detail, /2.50×/);
  data.push({ ...data.at(-1), time: data.at(-1).time + 300 });
  assert.equal(evaluateTechnical(config, data, [], now + 300000).hit, false);
});
test('volume dry-up requires positive volume and a positive valid baseline', () => {
  const data = bars(Array(25).fill(100)), config = { ...defaults('volume'), condition: 'dry', multiplier: 0.5 }, now = (data.at(-1).time + 310) * 1000;
  data.at(-1).volume = 300; assert.equal(evaluateTechnical(config, data, [], now).hit, true);
  data.at(-1).volume = 0; assert.match(evaluateTechnical(config, data, [], now).state, /zero\/missing/);
  assert.ok(technicalConfigError({ ...config, multiplier: 2 }));
  assert.ok(technicalConfigError({ ...defaults('volume'), multiplier: 0.5 }));
});
test('volume directional events use candle body, dojis excluded; bad history waits', () => {
  const data = bars([...Array(24).fill(100), 110]), now = (data.at(-1).time + 310) * 1000;
  data.at(-1).volume = 3000;
  assert.equal(evaluateTechnical({ ...defaults('volume'), condition: 'bullish' }, data, [], now).hit, true);
  assert.equal(evaluateTechnical({ ...defaults('volume'), condition: 'bearish' }, data, [], now).hit, false);
  data.at(-1).open = 110;
  assert.equal(evaluateTechnical({ ...defaults('volume'), condition: 'bullish' }, data, [], now).hit, false);
  data.at(-1).open = 111;
  assert.equal(evaluateTechnical({ ...defaults('volume'), condition: 'bearish' }, data, [], now).hit, true);
  assert.match(evaluateTechnical(defaults('volume'), data.filter((_, i) => i !== 10), [], now).state, /uninterrupted/);
  assert.match(evaluateTechnical(defaults('volume'), data.slice(-10), [], now).state, /Warming/);
});
