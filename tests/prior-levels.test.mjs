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
