import assert from "node:assert/strict";
import test from "node:test";
import { entryPlots } from "../lib/entry-signals.ts";
import { computeStudy } from "../lib/study-calculations.ts";
import { normalizeStudy, studyDefaults } from "../lib/indicator-catalog.ts";

const IST = 19_800;
const at = (iso) => Math.floor(Date.parse(iso) / 1000) - IST;
const bar = (iso, close, high = close + 1, low = close - 1) => ({ time: at(iso), open: close, high, low, close, volume: 100 });
const onlyLevel = { pullback: 0, level: 1, open: 0, momentum: 0, squeeze: 0, vwap: 0 };

test("a close through the previous day high marks a long, except on the forming candle", () => {
  const marked = entryPlots([
    bar("2026-09-24T09:15:00Z", 100, 110, 90),
    bar("2026-09-25T09:15:00Z", 112, 114, 108),
    bar("2026-09-26T09:15:00Z", 112, 113, 111),
  ], onlyLevel);
  assert.equal(marked.long[1], 108);
  assert.equal(Number.isFinite(marked.long[2]), false);
  assert.equal(marked.long.filter(Number.isFinite).length, 1);
});

test("the forming candle is never an entry even when it breaks the prior low", () => {
  const marked = entryPlots([
    bar("2026-09-24T09:15:00Z", 100, 110, 90),
    bar("2026-09-25T09:15:00Z", 80, 95, 78),
  ], onlyLevel);
  assert.equal(Number.isFinite(marked.short.at(-1)), false);
  assert.equal(marked.long.every((value) => !Number.isFinite(value)), true);
});

test('Entry setups displays only the selected EMA lines and defaults away from the duplicate 21 EMA', () => {
  const candles=Array.from({length:55},(_,i)=>({time:i*300,open:100+i,high:102+i,low:99+i,close:101+i,volume:10}));
  const initial=studyDefaults('entry');
  assert.deepEqual(computeStudy('entry',candles,initial).plots.map(plot=>plot.name),['EMA 5','Long','Short']);
  const only21=normalizeStudy('entry',{...initial,inputs:{...initial.inputs,line5:0,line21:1}});
  assert.deepEqual(computeStudy('entry',candles,only21).plots.map(plot=>plot.name),['EMA 21','Long','Short']);
  const noLines=normalizeStudy('entry',{...initial,inputs:{...initial.inputs,line5:0}});
  assert.deepEqual(computeStudy('entry',candles,noLines).plots.map(plot=>plot.name),['Long','Short']);
  const priorSettings=normalizeStudy('entry',{...initial,inputs:{pullback:1}});
  assert.equal(priorSettings.inputs.line5,1);
  assert.equal(priorSettings.inputs.line21,0);
  assert.equal(studyDefaults('ema').inputs.length,5);
});
