import assert from "node:assert/strict";
import test from "node:test";
import { previousDayLevels } from "../lib/previous-day.ts";

const IST = 19_800;
const at = (iso) => Math.floor(Date.parse(iso) / 1000) - IST;
const bar = (iso, high, low, close) => ({ time: at(iso), high, low, close, open: close, volume: 1 });

test("previous NSE session high, low and close ignore today and the gap outside 9:15–15:30", () => {
  const candles = [];
  for (let minute = 9 * 60 + 15; minute < 15 * 60 + 30; minute += 5) {
    const hour = Math.floor(minute / 60);
    const min = minute % 60;
    const stamp = `2026-09-24T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`;
    candles.push(bar(stamp, minute === 10 * 60 ? 130 : 110, minute === 14 * 60 ? 90 : 100, 105));
  }
  candles.push(bar("2026-09-24T08:00:00Z", 500, 1, 50));
  candles.push(bar("2026-09-25T09:15:00Z", 200, 80, 150));
  const levels = previousDayLevels(candles, "5m", true);
  assert.equal(levels?.date, "2026-09-24");
  assert.equal(levels?.high, 130);
  assert.equal(levels?.low, 90);
  assert.equal(levels?.close, 105);
});

test("a partial previous session is not used for an alert level", () => {
  const candles = [
    bar("2026-09-24T14:00:00Z", 130, 90, 100),
    bar("2026-09-25T09:15:00Z", 140, 100, 120),
  ];
  assert.equal(previousDayLevels(candles, "5m", true), null);
});

test("daily candles use the previous daily bar", () => {
  const levels = previousDayLevels([
    bar("2026-09-24T09:15:00Z", 130, 90, 101),
    bar("2026-09-25T09:15:00Z", 140, 95, 110),
  ], "1D", true);
  assert.deepEqual(levels, { date: "2026-09-24", high: 130, low: 90, close: 101 });
});

test("weekly charts do not pretend a week is a day", () => {
  assert.equal(previousDayLevels([
    bar("2026-09-18T09:15:00Z", 130, 90, 100),
    bar("2026-09-25T09:15:00Z", 140, 95, 110),
  ], "1W", true), null);
});
