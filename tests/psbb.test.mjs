import assert from "node:assert/strict";
import test from "node:test";
import { psbbSetups, psbbPlots, psbbAnalysis, psbbAnalysisFromRsi, currentPsbbSetup, PSBB_TIMEFRAMES } from "../lib/psbb.ts";

const bar = (time, high, low, close = (high + low) / 2) => ({ time, open: close, high, low, close });
const flat = (count) => Array.from({ length: count }, (_, time) => bar(time, 120, 110, 115));

for (const inverse of [false, true]) {
  const analyze = (candles, momentum, closed = true) => psbbAnalysisFromRsi(
    inverse ? candles.map(c=>({...c,high:300-c.low,low:300-c.high,open:300-c.open,close:300-c.close})) : candles,
    inverse ? momentum.map(value=>100-value) : momentum, { left: 1 }, closed);
  const side = inverse ? 'bullish' : 'bearish';
  test(`${side}: D1 follows the RSI excursion extreme, then D2 uses the intervening structure`, () => {
    const candles = flat(18), momentum = Array(18).fill(55);
    candles[2]=bar(2,125,118);momentum[2]=71;
    candles[3]=bar(3,130,121);momentum[3]=84;
    candles[4]=bar(4,128,120);momentum[4]=77;
    candles[5]=bar(5,127,115);candles[6]=bar(6,126,105);candles[7]=bar(7,128,118);
    candles[8]=bar(8,140,125);momentum[8]=78;
    candles[9]=bar(9,138,123);momentum[9]=73;
    const before=analyze(candles.slice(0,8),momentum.slice(0,8));
    assert.equal(before.anchors[0].time,3);assert.equal(before.anchors[0].rsi,inverse?16:84);
    const setup=analyze(candles.slice(0,13),momentum.slice(0,13)).setups.at(-1);
    assert.equal(setup.firstTime,3);assert.equal(setup.secondTime,8);
    assert.equal(setup.entryTime,6);assert.equal(setup.entry,inverse?195:105);
    assert.equal(setup.structureCase,'before');assert.equal(setup.shifted,false);
    // Same chart, later excursion: retire the old pending setup and move D1
    // to this visit's RSI extreme, even though its price is below the old D2.
    candles[14]=bar(14,134,122);momentum[14]=72;
    candles[15]=bar(15,138,125);momentum[15]=80;
    candles[16]=bar(16,136,120);momentum[16]=69;
    const fresh=analyze(candles,momentum);
    assert.equal(fresh.anchors[0].time,15);assert.equal(fresh.setups.length,0);
  });
  test(`${side}: an unqualified later excursion replaces D1 instead of keeping a stale reference`, () => {
    const candles=flat(13), momentum=Array(13).fill(55);
    candles[1]=bar(1,125,118);momentum[1]=72;
    candles[2]=bar(2,130,122);momentum[2]=86;
    candles[3]=bar(3,128,120);momentum[3]=78;
    candles[6]=bar(6,122,115);momentum[6]=72;
    candles[7]=bar(7,125,118);momentum[7]=79;
    candles[8]=bar(8,124,115);momentum[8]=68;
    const result=analyze(candles.slice(0,10),momentum.slice(0,10));
    assert.equal(result.anchors[0].time,7);assert.equal(result.setups.length,0);
    candles[11]=bar(11,135,125);momentum[11]=66;
    assert.equal(analyze(candles,momentum).setups.at(-1).firstTime,7);
  });
  test(`${side}: a stronger RSI peak replaces D1 and a forming bar cannot move it`, () => {
    const candles=flat(8), momentum=[55,72,84,75,60,73,89,90];
    candles[1]=bar(1,124,117);candles[2]=bar(2,130,120);
    candles[5]=bar(5,133,125);candles[6]=bar(6,140,128);candles[7]=bar(7,145,130);
    assert.equal(analyze(candles,momentum,false).anchors[0].time,6);
    assert.equal(analyze(candles,momentum,true).anchors[0].time,7);
    assert.equal(analyze(candles,momentum,true).setups.length,0);
  });
}

test('a newer D1 replaces old chart levels without deleting the trade ledger', () => {
  const old = { firstTime: 3, secondTime: 8, status: 'failed' };
  const analysis = { setups: [old], anchors: [{ time: 12, side: 'short' }] };
  assert.equal(currentPsbbSetup(analysis), undefined);
  assert.equal(analysis.setups[0], old);
  const pending = { firstTime: 12, secondTime: 18, status: 'active' };
  analysis.setups.push(pending);
  assert.equal(currentPsbbSetup(analysis), pending);
});

test('opposite threshold replaces pending D1 symmetrically, never reviving the earlier setup', () => {
  for (const inverse of [false,true]) {
    const candles=flat(18);
    candles[3]=bar(3,112,95,100);candles[6]=bar(6,130,110,125);
    candles[9]=bar(9,120,100,110);candles[12]=bar(12,140,112,125);
    const momentum=Array(18).fill(50);momentum[3]=20;momentum[6]=80;momentum[12]=65;
    const bars=inverse?candles.map(c=>({...c,high:250-c.low,low:250-c.high,open:250-c.open,close:250-c.close})):candles;
    const result=psbbSetups(bars,inverse?momentum.map(r=>100-r):momentum,{left:1});
    assert.equal(result.length,1);assert.equal(result[0].firstTime,6);
    assert.equal(result[0].side,inverse?'long':'short');
    assert.equal(result[0].shifted,false);
  }
});

test("positive divergence has no entry until price closes through the high between the two lows", () => {
  const candles = flat(20);
  candles[5] = bar(5, 112, 100, 108);
  candles[8] = bar(8, 130, 112, 122);
  candles[12] = bar(12, 110, 95, 104);
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 28;
  const waiting = psbbSetups(candles, rsi, { left: 2, oversold: 30, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(waiting.shifted, false);
  assert.equal(waiting.entry, 130);
  assert.equal(waiting.stop, 95);
  assert.equal(waiting.extended, false);
  candles[16] = bar(16, 134, 120, 132);
  const shifted = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(shifted.shifted, true);
  assert.equal(shifted.target1, 165);
  assert.equal(shifted.target2, 165);
});

test("negative divergence is not a trade when the low between the highs never breaks", () => {
  const candles = flat(18);
  candles[5] = bar(5, 130, 118, 124);
  candles[8] = bar(8, 118, 100, 108);
  candles[12] = bar(12, 140, 124, 136);
  const rsi = Array.from({ length: 18 }, () => 50);
  rsi[5] = 78;
  rsi[12] = 66;
  const setup = psbbSetups(candles, rsi, { left: 2, target1: 1, target2: 1.5 }).at(-1);
  assert.equal(setup.side, "short");
  assert.equal(setup.entry, 100);
  assert.equal(setup.stop, 140);
  assert.equal(setup.shifted, false);
});

test("a third push in the same direction is the lower-probability divergence", () => {
  const candles = flat(28);
  candles[4] = bar(4, 130, 118, 124);
  candles[6] = bar(6, 122, 100, 108);
  candles[10] = bar(10, 136, 120, 128);
  candles[12] = bar(12, 124, 102, 110);
  candles[16] = bar(16, 142, 128, 136);
  candles[18] = bar(18, 126, 104, 112);
  const rsi = Array.from({ length: 28 }, () => 55);
  rsi[4] = 80;
  rsi[10] = 74;
  rsi[16] = 68;
  const setup = psbbSetups(candles, rsi, { left: 2, overbought: 70 }).at(-1);
  assert.equal(setup.extended, true);
  assert.equal(setup.shifted, false);
});

// D1 is NOT a pivot here: price rises uninterrupted into SH. There cannot be
// a confirmed swing low between them. Index 5 is the first new-leg swing low.
function caseB(long = false) {
  const candles = [
    bar(0, 100, 90, 95), bar(1, 110, 100, 105), bar(2, 120, 110, 115),
    bar(3, 130, 120, 125), bar(4, 125, 115, 120), bar(5, 118, 100, 106),
    bar(6, 122, 108, 116), bar(7, 116, 104, 110), bar(8, 112, 95, 98),
    bar(9, 110, 90, 100),
  ];
  const momentum = [50, 75, 72, 65, 60, 50, 55, 50, 40, 45];
  return long ? {
    candles: candles.map((c) => ({ ...c, high: 200 - c.low, low: 200 - c.high, open: 200 - c.open, close: 200 - c.close })),
    momentum: momentum.map((v) => 100 - v),
  } : { candles, momentum };
}
const latest = ({ candles, momentum }, inputs = { left: 1 }) => psbbSetups(candles, momentum, inputs).at(-1);
const prefix = (data, count) => ({ candles: data.candles.slice(0, count), momentum: data.momentum.slice(0, count) });

test('D1 is available for chart marking before divergence and only after its candle closes', () => {
  const candles = [...Array.from({ length: 20 }, (_, i) => bar(i, 100, 90, 95)), bar(20, 110, 90, 108), bar(21, 120, 95, 100)];
  const pending = psbbAnalysis(candles, { length: 2, left: 1 }, '5m');
  assert.deepEqual(pending.anchors, [{ side: 'short', time: 20, price: 110, rsi: 100 }]);
  assert.deepEqual(pending.setups, []);
  assert.deepEqual(psbbAnalysis(candles.slice(0, -1), { length: 2, left: 1 }, '5m').anchors, []);
});

for (const long of [false, true]) {
  const name = long ? 'bullish' : 'bearish';
  test(`${name} Case B keeps D1 at the excursion RSI extreme and waits for a new structure`, () => {
    const data = caseB(long);
    const divergence = latest(prefix(data, 6));
    assert.equal(divergence.firstTime, 1);
    assert.equal(divergence.firstRsi, long ? 25 : 75);
    assert.equal(divergence.secondTime, 3);
    assert.equal(divergence.confirmedTime, 4);
    assert.equal(divergence.phase, 'waiting-structure');
    assert.equal(divergence.shifted, false);
    for (const key of ['entry', 'entryTime', 'mssTime', 'stop', 'target1', 'target2']) assert.equal(divergence[key], null, key);
    const waiting = latest(prefix(data, 8));
    assert.equal(waiting.phase, 'waiting-mss');
    assert.equal(waiting.structureCase, 'after');
    assert.equal(waiting.entryTime, 5);
    assert.equal(waiting.entry, 100);
    assert.equal(waiting.mssTime, null);
  });

  test(`${name} Case B uses the highest/lowest setup swing for its stop and a fixed 1R target`, () => {
    const setup = latest(caseB(long));
    assert.equal(setup.side, long ? 'long' : 'short');
    assert.equal(setup.phase, 'entered');
    assert.equal(setup.structureCase, 'after');
    assert.equal(setup.entry, 100);
    assert.equal(setup.entryTime, 5);
    assert.equal(setup.mssTime, 8);
    assert.equal(setup.stopTime, 3);
    assert.equal(setup.stop, long ? 70 : 130);
    assert.equal(setup.stop, setup.secondPrice);
    assert.equal(setup.target1, long ? 130 : 70);
    assert.equal(setup.target2, setup.target1);
    assert.equal(setup.status, 'formed');
  });

  test(`${name} MSS needs a close beyond the level; equality or a wick is insufficient`, () => {
    const data = caseB(long);
    data.candles[8].close = 100;
    assert.equal(latest(data).shifted, false);
    data.candles[8].close = long ? 99 : 101;
    assert.equal(latest(data).shifted, false);
  });

  test(`${name} live candle cannot confirm a divergence, pivot, or MSS`, () => {
    const data = caseB(long);
    assert.equal(latest(prefix(data, 5)), undefined); // SH confirmation is still live.
    assert.equal(latest(prefix(data, 7)).entry, null); // First structure confirmation is live.
    assert.equal(latest(prefix(data, 9)).shifted, false); // The breaking candle is live.
    assert.equal(latest(data).shifted, true);
  });
}

test('Case A selects the latest intervening swing, not the lowest low in the window', () => {
  const candles = [
    bar(0, 100, 90, 95), bar(1, 110, 100, 105), bar(2, 108, 94, 100),
    bar(3, 118, 104, 110), bar(4, 115, 98, 107), bar(5, 130, 120, 125),
    bar(6, 125, 110, 115), bar(7, 117, 96, 97), bar(8, 110, 95, 100),
  ];
  const momentum = [50, 75, 60, 65, 55, 65, 55, 45, 50];
  const setup = latest({ candles, momentum });
  assert.equal(setup.structureCase, 'before');
  assert.equal(setup.entryTime, 4);
  assert.equal(setup.entry, 98);
  assert.equal(setup.stop, 130);
  assert.equal(setup.mssTime, 7);
});

test('Case B locks the first post-divergence swing even when another one forms', () => {
  const data = caseB();
  data.candles.splice(8, 0, bar(8, 119, 108, 115));
  data.momentum.splice(8, 0, 54);
  data.candles.forEach((c, i) => { c.time = i; });
  const setup = latest(data);
  assert.equal(setup.entryTime, 5);
  assert.equal(setup.entry, 100); // Not the newer swing at 104.
  assert.equal(setup.stopTime, 3);
  assert.equal(setup.stop, 130);
});

test('a more extreme price replaces a pending divergence, keeping the original D1', () => {
  const data = caseB();
  data.candles[7] = bar(7, 135, 125, 130);
  data.candles[8] = bar(8, 125, 110, 115);
  data.momentum[7] = 62;
  const setup = latest(data);
  assert.equal(setup.firstTime, 1);
  assert.equal(setup.secondTime, 7);
  assert.equal(setup.secondPrice, 135);
  assert.equal(setup.secondRsi, 62);
  assert.equal(setup.entryTime, 5);
  assert.equal(setup.structureCase, 'before');
  assert.equal(setup.shifted, false);
  data.momentum[7] = 76;
  assert.equal(latest(data), undefined); // Price HH with RSI HH is not divergence.
});

test('threshold equality, missing RSI history and no crossing cannot invent D1', () => {
  for (const values of [[50, 70, 68], [NaN, 75, 72], [75, 78, 74]]) {
    const data = caseB();
    data.momentum.splice(0, 3, ...values);
    assert.equal(latest(data), undefined);
  }
});

test('a break before pivot confirmation is not backdated into a trade', () => {
  const candles = flat(16);
  candles[2] = bar(2, 130, 120, 125);
  candles[5] = bar(5, 118, 100, 110);
  candles[9] = bar(9, 140, 128, 136);
  candles[10] = bar(10, 115, 90, 95); // Break before SH is confirmable with span 2.
  candles[11] = bar(11, 110, 91, 96);
  candles[12] = bar(12, 110, 92, 97);
  candles[13] = bar(13, 110, 93, 98);
  candles[14] = bar(14, 110, 94, 99);
  const momentum = Array(16).fill(50);
  momentum[2] = 80; momentum[9] = 65;
  const setup = latest({ candles, momentum }, { left: 2 });
  assert.equal(setup.entry, 100);
  assert.equal(setup.shifted, false);
});

test('entry candle extremes do not imply target fills before close-confirmed entry', () => {
  const data = caseB();
  data.candles[8] = bar(8, 121, 60, 98);
  const setup = latest(data);
  assert.equal(setup.status, 'formed');
  assert.equal(setup.target1Hit, false);
});

test('1R finishes as success; later stops cannot change it and ambiguous bars are stop-first', () => {
  const data = caseB();
  data.candles[9] = bar(9, 105, 70, 80);
  data.candles.push(bar(10, 100, 70, 80)); data.momentum.push(40);
  const first = latest(data);
  assert.equal(first.target1Hit, true);
  assert.equal(first.status, 'passed');
  data.candles[10] = bar(10, 135, 66, 70);
  data.candles.push(bar(11, 100, 68, 75)); data.momentum.push(40);
  assert.equal(latest(data).status, 'passed');
  data.candles[9] = bar(9, 130, 66, 80);
  assert.equal(latest(data).status, 'failed');
});

test('confirmed entry/stop/targets remain fixed as future bars and pivots arrive', () => {
  const data = caseB();
  const original = latest(data);
  data.candles.push(bar(10, 115, 85, 100), bar(11, 112, 90, 102), bar(12, 110, 90, 100));
  data.momentum.push(50, 55, 50);
  const next = latest(data);
  for (const key of ['firstTime', 'secondTime', 'entry', 'entryTime', 'mssTime', 'stop', 'stopTime', 'target1', 'target2']) {
    assert.equal(next[key], original[key], key);
  }
});

test('all six requested intervals use identical candle-based rules', () => {
  assert.deepEqual(PSBB_TIMEFRAMES, ['1m', '5m', '15m', '1H', '4H', '1D']);
  const base = caseB();
  for (const seconds of [60, 300, 900, 3600, 14400, 86400]) {
    const data = { ...base, candles: base.candles.map((c) => ({ ...c, time: 1700000000 + c.time * seconds })) };
    const setup = latest(data);
    assert.equal(setup.entry, 100);
    assert.equal(setup.mssTime, 1700000000 + 8 * seconds);
    assert.equal(setup.stop, 130);
  }
  for (const timeframe of PSBB_TIMEFRAMES) assert.deepEqual(psbbPlots(base.candles, { length: 2, left: 1 }, timeframe), psbbPlots(base.candles, { length: 2, left: 1 }));
  assert.deepEqual(psbbPlots(base.candles, {}, '2m'), []);
});
