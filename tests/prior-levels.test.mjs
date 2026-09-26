import assert from "node:assert/strict";
import test from "node:test";
import { priorHighLows } from "../lib/prior-levels.ts";

const IST = 19_800;
const at = (iso) => Math.floor(Date.parse(iso) / 1000) - IST;
const bar = (iso, high, low) => ({ time: at(iso), high, low, close: (high + low) / 2, open: low, volume: 1 });

test("daily candles mark the previous day, week and month", () => {
  const candles = [
    bar("2026-08-01T09:15:00Z", 80, 70),
    bar("2026-08-31T09:15:00Z", 100, 60),
    bar("2026-09-14T09:15:00Z", 120, 90),
    bar("2026-09-18T09:15:00Z", 140, 95),
    bar("2026-09-24T09:15:00Z", 130, 88),
    bar("2026-09-25T09:15:00Z", 150, 100),
  ];
  const levels = priorHighLows(candles, "1D", true);
  assert.equal(levels?.day?.high, 130);
  assert.equal(levels?.day?.low, 88);
  assert.equal(levels?.day?.highTime, at("2026-09-24T09:15:00Z"));
  assert.equal(levels?.day?.lowTime, at("2026-09-24T09:15:00Z"));
  assert.equal(levels?.week?.high, 140);
  assert.equal(levels?.week?.low, 90);
  assert.equal(levels?.week?.highTime, at("2026-09-18T09:15:00Z"));
  assert.equal(levels?.week?.lowTime, at("2026-09-14T09:15:00Z"));
  assert.equal(levels?.month?.high, 100);
  assert.equal(levels?.month?.low, 60);
  assert.equal(levels?.month?.highTime, at("2026-08-31T09:15:00Z"));
  assert.equal(levels?.month?.lowTime, at("2026-08-31T09:15:00Z"));
});

test("a short intraday chart marks yesterday only", () => {
  const candles = [
    bar("2026-09-24T09:15:00Z", 130, 90),
    bar("2026-09-24T15:25:00Z", 128, 92),
    bar("2026-09-25T09:15:00Z", 140, 100),
  ];
  const levels = priorHighLows(candles, "1D", true);
  assert.equal(levels?.week, null);
  assert.equal(levels?.month, null);
});

test("a yearly chart has no prior day, week or month", () => {
  assert.equal(priorHighLows([bar("2025-09-25T09:15:00Z", 10, 8), bar("2026-09-25T09:15:00Z", 12, 9)], "1Y", true), null);
});
