import assert from "node:assert/strict";
import test from "node:test";
import { rankOpenHighStocks, rankVolumeBreakouts } from "../lib/volume-breakout.ts";

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

test("returns only the top 15 qualifying stocks ranked by percentage change", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    symbol: `STOCK${index}`,
    name: `Stock ${index}`,
    instrumentKey: `NSE_EQ|INE00000${String(index).padStart(4, "0")}`,
    lastPrice: 100 + index,
    previousClose: 100,
    todayVolume: 100 + index,
    sessionDate: "2026-08-04",
  }));
  const histories = new Map(candidates.map((candidate) => [candidate.symbol, Array.from({ length: 19 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, volume: 1 }))]));
  const rows = rankVolumeBreakouts(candidates, histories);
  assert.equal(rows.length, 15);
  assert.equal(rows[0].symbol, "STOCK19");
});

test("percentage change ranks ahead of a larger volume multiple", () => {
  const commonHistory = Array.from({ length: 19 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, volume: 1 }));
  const rows = rankVolumeBreakouts([
    { symbol: "HIGHCHANGE", name: "High Change", instrumentKey: "NSE_EQ|INE000000003", lastPrice: 120, previousClose: 100, todayVolume: 100, sessionDate: "2026-08-04" },
    { symbol: "HIGHVOLUME", name: "High Volume", instrumentKey: "NSE_EQ|INE000000004", lastPrice: 101, previousClose: 100, todayVolume: 1_000, sessionDate: "2026-08-04" },
  ], new Map([["HIGHCHANGE", commonHistory], ["HIGHVOLUME", commonHistory]]));
  assert.equal(rows[0].symbol, "HIGHCHANGE");
  assert.ok(rows[1].volumeMultiple > rows[0].volumeMultiple);
});

test("returns the 10 most bearish Open = High stocks", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    symbol: `OPENHIGH${index}`,
    name: `Open High ${index}`,
    instrumentKey: `NSE_EQ|INEOPEN${String(index).padStart(4, "0")}`,
    lastPrice: 100 - index,
    previousClose: 100,
    open: 105,
    high: index === 11 ? 105.05 : 105,
    low: 95 - index,
    volume: 1_000 + index,
  }));
  const rows = rankOpenHighStocks(candidates);
  assert.equal(rows.length, 10);
  assert.equal(rows[0].symbol, "OPENHIGH10");
  assert.ok(rows.every((row) => row.open === row.high));
  assert.ok(!rows.some((row) => row.symbol === "OPENHIGH11"));
});
