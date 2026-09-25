import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateChartCandles, candleBucket, deltaHistoryPlan, nearestCandleIndex, trailingCandleUpdate } from '../lib/chart-history.ts';
import { CHART_STYLE_GROUPS, isChartStyle } from '../lib/chart-style.ts';
const epoch = value => Date.parse(value) / 1000;
const bar = (date, close = 12) => ({ time: epoch(date), open: 10, high: Math.max(14, close), low: 8, close, volume: 7 });

test('every menu interval maps to a supported Delta source and pages stay below the API limit', () => {
  for (const frame of ['1m','2m','3m','5m','10m','15m','30m','1H','2H','3H','4H','1D','1W','1M','1Y']) {
    const plan = deltaHistoryPlan(frame, new URLSearchParams(), Date.parse('2026-09-23'));
    assert.ok(['1m','3m','5m','15m','30m','1h','2h','4h','1d'].includes(plan.resolution));
    assert.ok(plan.windows.length <= 3);
    assert.equal(plan.windows[0].start, plan.start);
    assert.equal(plan.windows.at(-1).end, plan.end);
    for(let i=1;i<plan.windows.length;i++) assert.equal(plan.windows[i].start, plan.windows[i-1].end);
  }
  const ten = deltaHistoryPlan('1D', new URLSearchParams('years=10'), Date.parse('2026-09-23'));
  assert.equal(ten.windows.length, 3);
  assert.throws(() => deltaHistoryPlan('1m', new URLSearchParams('years=10')));
  assert.throws(() => deltaHistoryPlan('1D', new URLSearchParams('date=not-a-date')));
});

test('calendar aggregation preserves OHLC and volume without double counting page boundaries', () => {
  const candles = [bar('2024-01-01'), bar('2024-01-02', 16), bar('2024-02-01', 11)];
  const months = aggregateChartCandles([...candles, candles[1]], '1M');
  assert.equal(months.length, 2);
  assert.deepEqual(months[0], {time:epoch('2024-01-01'),open:10,high:16,low:8,close:16,volume:14});
  const annual = aggregateChartCandles(candles, '1Y');
  assert.equal(annual.length, 1);
  assert.equal(annual[0].volume, 21);
  assert.equal(candleBucket(epoch('2024-01-07'), '1W'), epoch('2024-01-01'));
  assert.equal(candleBucket(epoch('2024-01-08'), '1W'), epoch('2024-01-08'));
});

test('go to date chooses the containing calendar candle or nearest trading session', () => {
  const candles = [bar('2024-01-05'), bar('2024-01-08'), bar('2024-01-09')];
  assert.equal(nearestCandleIndex(candles, epoch('2024-01-07'), '1D'), 1);
  assert.equal(nearestCandleIndex([bar('2024-01-01'),bar('2024-02-01')], epoch('2024-01-30'), '1M'), 0);
  assert.equal(nearestCandleIndex([bar('2024-01-04T18:30:00Z'), bar('2024-01-07T18:30:00Z')], epoch('2024-01-05T09:15:00+05:30'), '1D', 19800), 0);
});

test('incremental painting is allowed only when earlier candles are unchanged', () => {
  const candles = [bar('2024-01-01'),bar('2024-01-02')];
  assert.ok(trailingCandleUpdate(candles, [candles[0], {...candles[1],close:13}]));
  assert.ok(trailingCandleUpdate(candles, [...candles,bar('2024-01-03')]));
  assert.equal(trailingCandleUpdate(candles, [{...candles[0],close:13},candles[1]]),false);
  assert.equal(trailingCandleUpdate(candles, candles.slice(1)), false);
});

test('unfinished profile chart modes stay out of the style menu', () => {
  const visible = CHART_STYLE_GROUPS.flatMap(group => group.styles);
  assert.equal(visible.includes('volume-footprint'), true);
  assert.equal(isChartStyle('volume-footprint'), true);
  for(const style of ['tpo','session-volume-profile']) {
    assert.equal(visible.includes(style),false);
    assert.equal(isChartStyle(style),false);
  }
});
