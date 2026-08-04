import assert from "node:assert/strict";
import test from "node:test";
import { rankVolumeBreakouts } from "../lib/volume-breakout.ts";

const history = new Map([
  ["FAST", Array.from({ length: 19 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, volume: 10 }))],
  ["SLOW", Array.from({ length: 19 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, volume: 10 }))],
]);

test("uses today's daily volume inside the 20-session SMA and applies the strict 5x rule", () => {
  const rows = rankVolumeBreakouts([
    { symbol: "FAST", name: "Fast", instrumentKey: "NSE_EQ|INE000000001", lastPrice: 120, previousClose: 100, todayVolume: 100, sessionDate: "2026-08-04" },
    { symbol: "SLOW", name: "Slow", instrumentKey: "NSE_EQ|INE000000002", lastPrice: 90, previousClose: 100, todayVolume: 50, sessionDate: "2026-08-04" },
  ], history);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "FAST");
  assert.equal(rows[0].sma20Volume, 14.5);
  assert.ok(rows[0].volumeMultiple > 5);
});

test("returns only the top 15 qualifying stocks ranked by volume multiple", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    symbol: `STOCK${index}`,
    name: `Stock ${index}`,
    instrumentKey: `NSE_EQ|INE00000${String(index).padStart(4, "0")}`,
    lastPrice: 100,
    previousClose: 100,
    todayVolume: 100 + index,
    sessionDate: "2026-08-04",
  }));
  const histories = new Map(candidates.map((candidate) => [candidate.symbol, Array.from({ length: 19 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, volume: 1 }))]));
  const rows = rankVolumeBreakouts(candidates, histories);
  assert.equal(rows.length, 15);
  assert.equal(rows[0].symbol, "STOCK19");
});
