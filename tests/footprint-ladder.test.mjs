import assert from "node:assert/strict";
import test from "node:test";
import { compactVolume, footprintLadder } from "../lib/volume-profile.ts";

test("a footprint ladder splits one candle into different bid and ask rows", () => {
  const rows = footprintLadder({ time: 1, open: 100, high: 130, low: 90, close: 120, volume: 1_444_228 }, 8);
  assert.equal(rows.length, 8);
  const total = rows.reduce((sum, row) => sum + row.volume, 0);
  assert.ok(Math.abs(total - 1_444_228) < 1);
  assert.ok(new Set(rows.map((row) => Math.round(row.buy))).size > 1);
  assert.ok(rows.some((row) => row.buy !== row.sell));
  const buy = rows.reduce((sum, row) => sum + row.buy, 0);
  const sell = rows.reduce((sum, row) => sum + row.sell, 0);
  assert.ok(buy > sell, "A close near the high estimates more buying");
  assert.equal(compactVolume(1_444_228), "1.444M");
  assert.equal(compactVolume(714_315), "714.315K");
});
