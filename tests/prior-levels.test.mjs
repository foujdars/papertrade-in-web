import assert from "node:assert/strict";
import test from "node:test";
import { priorMarks } from "../lib/prior-levels.ts";

const IST = 19_800;
const at = (iso) => Math.floor(Date.parse(iso) / 1000) - IST;
const bar = (iso, high, low, open = low, close = (high + low) / 2) => ({ time: at(iso), high, low, open, close, volume: 1 });

const candles = [
  bar("2025-04-01T09:15:00Z", 40, 30, 32, 38),
  bar("2026-03-31T09:15:00Z", 90, 50, 55, 80),
  bar("2026-08-01T09:15:00Z", 80, 70, 72, 76),
  bar("2026-08-31T09:15:00Z", 100, 60, 70, 95),
  bar("2026-09-14T09:15:00Z", 120, 90, 100, 110),
  bar("2026-09-18T09:15:00Z", 140, 95, 100, 130),
  bar("2026-09-24T09:15:00Z", 130, 88, 100, 120),
  bar("2026-09-25T09:15:00Z", 150, 100, 140, 116),
];

test("default marks are the previous day, week and month high and low", () => {
  const marks = priorMarks(candles);
  const byId = Object.fromEntries(marks.map((mark) => [mark.id, mark]));
  assert.equal(byId.PDH.price, 130);
  assert.equal(byId.PDL.price, 88);
  assert.equal(byId.PDH.time, at("2026-09-24T09:15:00Z"));
  assert.equal(byId.PWH.price, 140);
  assert.equal(byId.PWH.time, at("2026-09-18T09:15:00Z"));
  assert.equal(byId.PWL.price, 90);
  assert.equal(byId.PMH.price, 100);
  assert.equal(byId.PML.price, 60);
  assert.equal(byId.FYH, undefined);
});

test("a day-only high does not draw the week, month or low", () => {
  const marks = priorMarks(candles, { day: true, week: false, month: false, year: false, custom: 0, high: true, low: false, open: false, close: false });
  assert.deepEqual(marks.map((mark) => mark.id), ["PDH"]);
});

test("daily history ending yesterday uses yesterday, not the day before it", () => {
  const history = candles.slice(0, -1);
  const reference = candles.at(-1).time;
  const marks = Object.fromEntries(priorMarks(history, undefined, reference).map(mark => [mark.id, mark]));
  assert.equal(marks.PDH.price, 130);
  assert.equal(marks.PDL.price, 88);
  assert.equal(marks.PDH.time, history.at(-1).time);
  const withoutReference = priorMarks(history);
  assert.deepEqual(Object.values(marks).filter(mark => mark.tone !== 'day'), withoutReference.filter(mark => mark.tone !== 'day'));
});

test("the reference session excludes its candle and skips weekends and holidays", () => {
  const history = [bar('2026-10-01T09:15:00Z', 110, 90), bar('2026-10-05T09:15:00Z', 130, 100)];
  const monday = Object.fromEntries(priorMarks(history, undefined, at('2026-10-05T12:00:00Z')).map(mark => [mark.id, mark]));
  assert.equal(monday.PDH.price, 110);
  assert.equal(monday.PDL.price, 90);
  const tuesday = Object.fromEntries(priorMarks(history, undefined, at('2026-10-06T09:15:00Z')).map(mark => [mark.id, mark]));
  assert.equal(tuesday.PDH.price, 130);
  assert.equal(tuesday.PDL.price, 100);
  const replay = Object.fromEntries(priorMarks(history, undefined, at('2026-10-02T09:15:00Z')).map(mark => [mark.id, mark]));
  assert.equal(replay.PDH.price, 110);
});

test("one available completed daily candle is sufficient for the day levels", () => {
  const marks = priorMarks([bar('2026-10-06T09:15:00Z', 150, 120)], undefined, at('2026-10-07T09:15:00Z'));
  assert.deepEqual(marks.map(mark => [mark.id, mark.price]), [['PDH', 150], ['PDL', 120]]);
});

test("financial year and a chosen daily candle can be added", () => {
  const marks = priorMarks(candles, { day: false, week: false, month: false, year: true, custom: 3, high: true, low: true, open: true, close: true });
  const byId = Object.fromEntries(marks.map((mark) => [mark.id, mark]));
  assert.equal(byId.FYH.price, 90);
  assert.equal(byId.FYL.price, 30);
  assert.equal(byId.FYO.price, 32);
  assert.equal(byId.FYC.price, 80);
  assert.equal(byId["3H"].price, 120);
  assert.equal(byId["3O"].price, 100);
});


test("missing zero-price history cannot become a prior low or flatten the chart", () => {
  const history = [
    bar("2026-10-01T09:15:00Z", 110, 90),
    bar("2026-10-02T09:15:00Z", 0, 0, 0, 0),
    bar("2026-10-03T09:15:00Z", 115, 0, 100, 110),
    bar("2026-10-04T09:15:00Z", 110, 95, 120, 100),
    bar("2026-10-05T09:15:00Z", 130, 100),
  ];
  const expected = priorMarks([history[0], history[4]], undefined, history[4].time);
  assert.deepEqual(priorMarks(history, undefined, history[4].time), expected);
  assert.ok(expected.length > 0);
  assert.ok(expected.every(mark => mark.price > 0));
  assert.deepEqual(priorMarks(history.slice(1, 4)), []);
});
