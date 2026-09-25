import assert from "node:assert/strict";
import test from "node:test";
import { istClockToEpoch, openingRanges } from "../lib/opening-range.ts";

const day = "2026-09-25";
const at = (hour, minute) => istClockToEpoch(day, hour, minute);
const bar = (hour, minute, high, low) => ({ time: at(hour, minute), high, low, open: low, close: high, volume: 1 });

test("opening range uses only 9:15 to 9:30 and extends to 15:30", () => {
  const ranges = openingRanges([
    bar(9, 10, 120, 90),
    bar(9, 15, 110, 100),
    bar(9, 20, 130, 95),
    bar(9, 25, 125, 105),
    bar(9, 30, 200, 50),
    bar(15, 25, 140, 100),
  ], "5m");
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].high, 130);
  assert.equal(ranges[0].low, 95);
  assert.equal(ranges[0].start, at(9, 15));
  assert.equal(ranges[0].end, at(9, 30));
  assert.equal(ranges[0].extend, at(15, 30));
  assert.equal(ranges[0].complete, true);
});

test("a range still forming does not count as complete", () => {
  const ranges = openingRanges([bar(9, 15, 110, 100), bar(9, 20, 112, 99)], "5m");
  assert.equal(ranges[0].complete, false);
  assert.equal(ranges[0].high, 112);
  assert.equal(ranges[0].low, 99);
});

test("charts coarser than 15 minutes do not invent an opening range", () => {
  assert.deepEqual(openingRanges([bar(9, 0, 110, 100), bar(10, 0, 120, 90)], "1H"), []);
  assert.deepEqual(openingRanges([bar(9, 15, 110, 100)], "1D"), []);
});
