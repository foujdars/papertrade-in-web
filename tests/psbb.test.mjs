import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from 'node:fs';
import { psbbSetups, psbbPlots, psbbAnalysis, psbbAnalysisFromRsi, currentPsbbSetup, PSBB_TIMEFRAMES } from "../lib/psbb.ts";

const bar = (time, high, low, close = (high + low) / 2) => ({ time, open: close, high, low, close });
const flat = (count) => Array.from({ length: count }, (_, time) => bar(time, 120, 110, 115));

test('old wick-based new-leg fixture cannot create a body divergence or entry', () => {
  const rows = JSON.parse(readFileSync(new URL('./fixtures/psbb-new-leg-candles.json', import.meta.url), 'utf8'));
  const candles = rows.map(([time,open,high,low,close]) => ({time,open,high,low,close}));
  const setups = psbbAnalysis(candles, {}, '5m').setups;
  assert.equal(setups.length, 0);
  assert.ok(setups.every(setup => !setup.shifted));
});

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
    candles[8]=bar(8,140,125);momentum[8]=69;
    candles[9]=bar(9,138,123);momentum[9]=65;
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

test('bearish: later higher RSI peak is D1 and a new above-70 visit with a higher body high and lower RSI confirms divergence', () => {
  const candles = flat(17), momentum = Array(17).fill(55);
  candles[2] = bar(2, 128, 118, 123); momentum[2] = 75;
  candles[3] = bar(3, 134, 120, 130); momentum[3] = 77;
  candles[4] = bar(4, 131, 118, 125); momentum[4] = 72;
  candles[5] = bar(5, 124, 106, 118); momentum[5] = 67;
  candles[6] = bar(6, 132, 115, 127); momentum[6] = 69;
  candles[7] = bar(7, 142, 120, 138); momentum[7] = 74;
  candles[8] = bar(8, 132, 110, 118); momentum[8] = 62;
  const before = psbbAnalysisFromRsi(candles.slice(0, 7), momentum.slice(0, 7), {left:1}, true);
  assert.equal(before.anchors.find(anchor=>anchor.side==='short')?.time, 3);
  assert.equal(before.anchors.find(anchor=>anchor.side==='short')?.rsi, 77);
  const result = psbbAnalysisFromRsi(candles.slice(0, 11), momentum.slice(0, 11), {left:1}, true);
  const setup = result.setups.find(item=>item.side==='short');
  assert.ok(setup);
  assert.equal(setup.firstTime, 3);
  assert.equal(setup.firstRsi, 77);
  assert.equal(setup.secondTime, 7);
  assert.equal(setup.secondRsi, 74);
  assert.equal(setup.firstPrice, 130);
  assert.equal(setup.secondPrice, 138);
});

test('a newer D1 replaces old chart levels without deleting the trade ledger', () => {
  const old = { firstTime: 3, secondTime: 8, status: 'failed' };
  const analysis = { setups: [old], anchors: [{ time: 12, side: 'short' }] };
  assert.equal(currentPsbbSetup(analysis), undefined);
  assert.equal(analysis.setups[0], old);
  const pending = { firstTime: 12, secondTime: 18, status: 'active' };
  analysis.setups.push(pending);
  assert.equal(currentPsbbSetup(analysis), pending);
});

test('bullish D1 follows the lowest RSI below 30 and a later non-divergent visit replaces it', () => {
  const candles = flat(15), momentum = Array(15).fill(50);
  candles[1] = bar(1, 117, 100); momentum[1] = 29;
  candles[2] = bar(2, 115, 98); momentum[2] = 27;
  candles[3] = bar(3, 112, 97); momentum[3] = 26;
  const first = psbbAnalysisFromRsi(candles.slice(0,5), momentum.slice(0,5), {left:1}, true);
  assert.equal(first.anchors[0].time, 3);
  assert.equal(first.anchors[0].rsi, 26);
  candles[6] = bar(6, 119, 105); momentum[6] = 28;
  candles[7] = bar(7, 116, 104); momentum[7] = 27;
  candles[8] = bar(8, 130, 108); momentum[8] = 35;
  const replaced = psbbAnalysisFromRsi(candles.slice(0,10), momentum.slice(0,10), {left:1}, true);
  assert.equal(replaced.anchors[0].time, 7);
  assert.equal(replaced.anchors[0].rsi, 27);
  assert.equal(replaced.setups.length, 0);
  candles[10] = bar(10, 118, 100); momentum[10] = 31;
  candles[11] = bar(11, 117, 106); momentum[11] = 36;
  const divergence = psbbAnalysisFromRsi(candles.slice(0,12), momentum.slice(0,12), {left:1}, true).setups.at(-1);
  assert.equal(divergence.firstTime, 7);
  assert.equal(divergence.firstRsi, 27);
  assert.equal(divergence.secondTime, 10);
  assert.equal(divergence.entryTime, 8);
  assert.equal(divergence.entry, 130);
  assert.equal(divergence.stop, 100);
  assert.equal(divergence.target1, 160);
});

test('bullish fresh RSI visit replaces D1 even when it would diverge against the old anchor', () => {
  const candles = flat(13), momentum = Array(13).fill(50);
  candles[1] = bar(1, 115, 100); momentum[1] = 20;
  candles[6] = bar(6, 112, 90); momentum[6] = 25;
  candles[7] = bar(7, 130, 102); momentum[7] = 40;
  const transform = (bars, values) => ({ candles: bars, momentum: values });
  const early = transform(candles.slice(0,9), momentum.slice(0,9));
  const replacement = psbbAnalysisFromRsi(early.candles, early.momentum, {left:1}, true);
  assert.equal(replacement.anchors[0].time, 6);
  assert.equal(replacement.setups.length, 0, 'Old D1 cannot form divergence with the fresh RSI visit');
  candles[10] = bar(10, 118, 85, 95); momentum[10] = 35;
  const data = transform(candles, momentum);
  const setup = psbbAnalysisFromRsi(data.candles, data.momentum, {left:1}, true).setups.at(-1);
  assert.equal(setup.firstTime, 6);
  assert.equal(setup.secondTime, 10);
});

test('opposite threshold replaces pending D1 symmetrically, never reviving the earlier setup', () => {
  for (const inverse of [false,true]) {
    const candles=flat(18);
    candles[3]=bar(3,112,95,100);candles[6]=bar(6,130,110,125);
    candles[9]=bar(9,120,100,110);candles[12]=bar(12,140,112,130);
    const momentum=Array(18).fill(50);momentum[3]=20;momentum[6]=80;momentum[12]=65;
    const bars=inverse?candles.map(c=>({...c,high:250-c.low,low:250-c.high,open:250-c.open,close:250-c.close})):candles;
    const result=psbbSetups(bars,inverse?momentum.map(r=>100-r):momentum,{left:1});
    assert.equal(result.length,1);assert.equal(result[0].firstTime,6);
    assert.equal(result[0].side,inverse?'long':'short');
    assert.equal(result[0].shifted,false);
  }
});

test("positive divergence has no entry until price reaches the high between the two lows", () => {
  const candles = flat(20);
  candles[5] = bar(5, 112, 100, 108);
  candles[8] = bar(8, 130, 112, 122);
  candles[12] = bar(12, 110, 95, 104);
  const rsi = Array.from({ length: 20 }, () => 50);
  rsi[5] = 22;
  rsi[12] = 31;
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

test("a later RSI threshold visit starts a fresh D1 rather than inheriting earlier pushes", () => {
  const candles = flat(28);
  candles[4] = bar(4, 130, 118, 124);
  candles[6] = bar(6, 122, 100, 108);
  candles[10] = bar(10, 136, 120, 122);
  candles[12] = bar(12, 124, 102, 110);
  candles[16] = bar(16, 142, 128, 136);
  candles[18] = bar(18, 126, 104, 112);
  const rsi = Array.from({ length: 28 }, () => 55);
  rsi[4] = 80;
  rsi[10] = 74;
  rsi[16] = 68;
  const setup = psbbSetups(candles, rsi, { left: 2, overbought: 70 }).at(-1);
  assert.equal(setup.firstTime, 10);
  assert.equal(setup.extended, false);
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
  assert.deepEqual(pending.anchors, [{ side: 'short', time: 20, price: 108, rsi: 100 }]);
  assert.deepEqual(pending.setups, []);
  assert.deepEqual(psbbAnalysis(candles.slice(0, -1), { length: 2, left: 1 }, '5m').anchors, []);
});

for (const bullish of [false, true]) test(`${bullish ? 'bullish' : 'bearish'} divergence compares bodies, ignoring the longer D1 wick`, () => {
  const candles = flat(12), momentum = Array(12).fill(50);
  candles[2] = { time: 2, open: 105, close: 110, high: 150, low: 100 }; momentum[2] = 80;
  candles[6] = { time: 6, open: 115, close: 120, high: 140, low: 105 }; momentum[6] = 65;
  const inverse = (bars) => bars.map(c => ({ ...c, open: 300-c.open, close: 300-c.close, high: 300-c.low, low: 300-c.high }));
  const bars = bullish ? inverse(candles) : candles;
  const values = bullish ? momentum.map(r => 100-r) : momentum;
  const result = psbbAnalysisFromRsi(bars, values, { left: 1 }, true);
  const setup = result.setups.at(-1);
  assert.ok(setup, 'the second body makes a new price extreme even though its wick does not');
  assert.equal(setup.firstTime, 2);
  assert.equal(setup.secondTime, 6);
  assert.equal(setup.firstPrice, bullish ? 190 : 110);
  assert.equal(setup.secondPrice, bullish ? 180 : 120);
  assert.equal(setup.phase, 'waiting-structure');
  const wickOnly = candles.map(c => ({ ...c }));
  wickOnly[6] = { ...wickOnly[6], open: 100, close: 105, high: 155 };
  const ignored = psbbAnalysisFromRsi(bullish ? inverse(wickOnly) : wickOnly, values, { left: 1 }, true);
  assert.equal(ignored.setups.length, 0, 'a higher wick with no higher body is not divergence');
});

for (const long of [false, true]) {
  test(`${long ? 'bullish' : 'bearish'} divergence without intervening structure never enters on a new-leg swing break`, () => {
    const data = caseB(long);
    const setup = latest(data);
    assert.equal(setup.firstTime, 1);
    assert.equal(setup.secondTime, 3);
    assert.equal(setup.phase, 'waiting-structure');
    assert.equal(setup.structureCase, null);
    assert.equal(setup.entry, null);
    assert.equal(setup.mssTime, null);
    assert.equal(setup.shifted, false);
    assert.equal(setup.status, 'active');
  });
}

test('bearish entry uses the swing low nearest SH, even when an earlier swing is lower', () => {
  const candles = [
    bar(0, 100, 90, 95), bar(1, 110, 100, 105), bar(2, 108, 94, 100),
    bar(3, 118, 104, 110), bar(4, 115, 98, 107), bar(5, 130, 120, 125),
    bar(6, 125, 110, 115), bar(7, 117, 93, 97), bar(8, 110, 95, 100),
  ];
  const momentum = [50, 75, 60, 65, 55, 65, 55, 45, 50];
  const setup = latest({ candles, momentum });
  assert.equal(setup.structureCase, 'before');
  assert.equal(setup.entryTime, 4);
  assert.equal(setup.entry, 98);
  assert.equal(setup.stop, 130);
  assert.equal(setup.mssTime, 7);
});

test('bullish entry uses the swing high nearest SL, even when an earlier swing is higher', () => {
  const candles = [
    bar(0,100,90),bar(1,110,100),bar(2,108,94),bar(3,118,104),
    bar(4,115,98),bar(5,130,120),bar(6,125,110),bar(7,117,93),bar(8,110,95),
  ].map(c => ({...c,open:250-c.open,high:250-c.low,low:250-c.high,close:250-c.close}));
  const momentum = [50,75,60,65,55,65,55,45,50].map(value => 100-value);
  const setup = latest({candles,momentum});
  assert.equal(setup.side,'long');
  assert.equal(setup.entryTime,4);
  assert.equal(setup.entry,152);
  assert.equal(setup.mssTime,7);
});

test('a more extreme price replaces a pending divergence, keeping the original D1', () => {
  const data = caseB();
  data.candles[7] = bar(7, 135, 125, 130);
  data.candles[8] = bar(8, 125, 110, 115);
  data.momentum[7] = 62;
  const setup = latest(data);
  assert.equal(setup.firstTime, 1);
  assert.equal(setup.secondTime, 7);
  assert.equal(setup.secondPrice, 130);
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

test('Case A activates on the closed MSS candle without waiting for later pivot bars', () => {
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
  for (const inverse of [false, true]) {
    const data = { candles: inverse ? candles.map(c => ({ ...c, open: 250-c.open, high: 250-c.low, low: 250-c.high, close: 250-c.close })) : candles,
      momentum: inverse ? momentum.map(r => 100-r) : momentum };
    const setup = latest(data, { left: 2 });
    assert.equal(setup.entry, inverse ? 150 : 100);
    assert.equal(setup.shifted, true);
    assert.equal(setup.mssTime, 10);
    assert.equal(setup.confirmedTime, 10);
    assert.equal(latest(prefix(data, 11), { left: 2 })?.shifted ?? false, false, 'Live breakout cannot activate');
    const immediate = latest(prefix(data, 12), { left: 2 });
    assert.equal(immediate.mssTime, 10, 'No future bars needed to recognize the entry');
    data.candles = data.candles.map((c, i) => i === 10 ? { ...c, close: inverse ? 149 : 101 } : c);
    assert.equal(latest(prefix(data, 12), { left: 2 })?.shifted, true, 'A wick reaching the known level is entry');
  }
});

test('intervening-swing entries use the first wick touch and settle on later bars', () => {
  const candles = [
    bar(0,100,90),bar(1,110,100),bar(2,108,94),bar(3,118,104),
    bar(4,115,98),bar(5,130,120),bar(6,125,110),bar(7,117,60),bar(8,110,95),
  ];
  const momentum = [50,75,60,65,55,65,55,45,50];
  const setup = psbbAnalysisFromRsi(candles,momentum,{left:1},true).setups.at(-1);
  assert.equal(setup.structureCase,'before');
  assert.equal(setup.entry,98);
  assert.equal(setup.mssTime,7);
  assert.equal(setup.stop,130);
  assert.equal(setup.target1,66);
  assert.equal(setup.status,'formed','Entry candle low cannot determine intrabar target ordering');
  assert.equal(psbbAnalysisFromRsi(candles.slice(0,7),momentum.slice(0,7),{left:1},true).setups.at(-1)?.shifted,false);
  const passed = psbbAnalysisFromRsi([...candles,bar(9,110,65)], [...momentum,50],{left:1},true).setups.at(-1);
  assert.equal(passed.status,'passed');
  assert.equal(passed.end,9);
  const failed = psbbAnalysisFromRsi([...candles,bar(9,131,65)], [...momentum,50],{left:1},true).setups.at(-1);
  assert.equal(failed.status,'failed','A candle touching stop and target is stop-first');
});

test('intervening-swing rules are the same on every supported timeframe', () => {
  const candles = [bar(0,100,90),bar(1,110,100),bar(2,108,94),bar(3,118,104),bar(4,115,98),bar(5,130,120),bar(6,125,110),bar(7,117,93),bar(8,110,95)];
  const momentum = [50,75,60,65,55,65,55,45,50];
  for (const timeframe of PSBB_TIMEFRAMES) {
    const setup = psbbAnalysisFromRsi(candles,momentum,{left:1},true).setups.at(-1);
    assert.equal(setup.structureCase,'before',timeframe);
    assert.equal(setup.entry,98,timeframe);
    assert.equal(setup.mssTime,7,timeframe);
  }
  assert.deepEqual(psbbPlots(candles,{},'2m'),[]);
});
