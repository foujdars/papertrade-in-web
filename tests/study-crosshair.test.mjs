import test from 'node:test';
import assert from 'node:assert/strict';
import { snapStudyCrosshair } from '../lib/study-crosshair.ts';

function fixture() {
  const calls = [];
  const chart = { setCrosshairPosition: (...args) => calls.push(args) };
  const rsi = { getPane: () => ({ paneIndex: () => 2 }), options: () => ({ visible: true }) };
  const smoothing = {};
  const event = {
    time: 1720000300, paneIndex: 2, point: { x: 160, y: 50.63 },
    seriesData: new Map([[rsi, { time: 1720000300, value: 74.28 }], [smoothing, { time: 1720000300, value: 50.1 }]]),
  };
  return { calls, chart, rsi, event };
}

test('RSI axis and guide follow the selected dot regardless of pointer height or smoothing', () => {
  const { calls, chart, rsi, event } = fixture();
  for (const y of [0, 50.63, 95]) {
    assert.equal(snapStudyCrosshair(chart, rsi, { ...event, point: { x: 160, y } }), true);
  }
  assert.deepEqual(calls, Array(3).fill([74.28, event.time, rsi]));
  event.seriesData.set(rsi, { time: 1720000600, value: 0 });
  assert.equal(snapStudyCrosshair(chart, rsi, { ...event, time: 1720000600 }), true);
  assert.deepEqual(calls.at(-1), [0, 1720000600, rsi]);
});

test('price and other indicator panes, pointer exit and missing RSI history do not snap', () => {
  const { calls, chart, rsi, event } = fixture();
  for (const override of [
    { paneIndex: 0 }, { paneIndex: 1 }, { paneIndex: undefined },
    { point: undefined }, { time: undefined }, { seriesData: new Map() },
    { seriesData: new Map([[rsi, { time: event.time }]]) },
    { seriesData: new Map([[rsi, { time: event.time, value: NaN }]]) },
  ]) assert.equal(snapStudyCrosshair(chart, rsi, { ...event, ...override }), false);
  assert.equal(snapStudyCrosshair(chart, undefined, event), false);
  rsi.options = () => ({ visible: false });
  assert.equal(snapStudyCrosshair(chart, rsi, event), false);
  assert.deepEqual(calls, []);
});
