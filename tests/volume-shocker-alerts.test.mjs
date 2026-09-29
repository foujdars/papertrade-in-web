import assert from "node:assert/strict";
import test from "node:test";
import { normalizeShockerWatch, nseCashSessionOpen, pickHistoryKeys, planShockerNotices, selectVolumeShockerWatch, shockerChartUrl } from "../lib/volume-shocker-alerts.ts";

const ist = (clock) => Date.parse(clock);

test("NSE cash session is weekdays from 9:15 until 15:30 and skips holidays", () => {
  assert.equal(nseCashSessionOpen(ist("2026-09-29T03:45:00Z")), true);
  assert.equal(nseCashSessionOpen(ist("2026-09-29T03:44:00Z")), false);
  assert.equal(nseCashSessionOpen(ist("2026-09-29T09:59:00Z")), true);
  assert.equal(nseCashSessionOpen(ist("2026-09-29T10:00:00Z")), false);
  assert.equal(nseCashSessionOpen(ist("2026-09-26T04:30:00Z")), false);
  assert.equal(nseCashSessionOpen(ist("2026-10-02T04:30:00Z")), false);
});

test("watchlist selection keeps NSE equities and refuses a whole-market list", () => {
  const instruments = [
    { symbol: "RELIANCE", name: "Reliance", instrumentKey: "NSE_EQ|INE002A01018", categories: ["NIFTY 50", "NIFTY 500"] },
    { symbol: "HDFCBANK", name: "HDFC Bank", instrumentKey: "NSE_EQ|INE040A01034", categories: ["NIFTY 50", "BANK NIFTY"] },
    { symbol: "NIFTY", name: "Nifty 50", instrumentKey: "NSE_INDEX|Nifty 50", categories: ["INDEX"], assetType: "INDEX" },
    { symbol: "BTCUSD", name: "Bitcoin", instrumentKey: "DELTA|BTCUSD", categories: ["GLOBAL"], assetType: "FUTURE" },
  ];
  const customWatchlists = [{ id: "mine", symbols: ["RELIANCE", "BTCUSD", "NIFTY"] }];
  assert.deepEqual(selectVolumeShockerWatch({ watchlist: "NIFTY 50", customWatchlists, instruments }).map((item) => item.symbol), ["RELIANCE", "HDFCBANK"]);
  assert.deepEqual(selectVolumeShockerWatch({ watchlist: "custom:mine", customWatchlists, instruments }).map((item) => item.symbol), ["RELIANCE"]);
  assert.deepEqual(selectVolumeShockerWatch({ watchlist: "ALL NSE", customWatchlists, instruments }).map((item) => item.symbol), ["RELIANCE"]);
  assert.deepEqual(selectVolumeShockerWatch({ watchlist: "NIFTY 500", customWatchlists: [], instruments }).map((item) => item.symbol), []);
});

test("history budget checks the largest new moves first", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ instrumentKey: `NSE_EQ|INE${index}`, changePercent: index - 10 }));
  const keys = pickHistoryKeys(rows, { cached: new Set(["NSE_EQ|INE19"]), skip: new Set(["NSE_EQ|INE18"]), limit: 3 });
  assert.deepEqual(keys, ["NSE_EQ|INE0", "NSE_EQ|INE1", "NSE_EQ|INE2"]);
});

test("a volume shocker alerts once per newly crossed 10, 15 and 17 percent level", () => {
  const row = { symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018", changePercent: 16.4, volumeMultiple: 6.24 };
  const first = planShockerNotices([row, { ...row, symbol: "QUIET", changePercent: 9.9, volumeMultiple: 8 }], "2026-09-29", new Set());
  assert.equal(first.notices.length, 1);
  assert.equal(first.notices[0].level, 15);
  assert.deepEqual(first.sentIds, ["vshock-2026-09-29-RELIANCE-up-10", "vshock-2026-09-29-RELIANCE-up-15"]);
  assert.match(first.notices[0].title, /RELIANCE \+16% · 6\.2× volume/);
  assert.equal(first.notices[0].body, "");
  assert.ok(first.notices[0].title.length <= 42);
  assert.equal(first.notices[0].url, "/?symbol=RELIANCE&timeframe=5m");
  const next = planShockerNotices([{ ...row, changePercent: 17.2 }], "2026-09-29", new Set(first.sentIds));
  assert.equal(next.notices.length, 1);
  assert.equal(next.notices[0].level, 17);
  assert.match(next.notices[0].title, /\+17%/);
  const down = planShockerNotices([{ ...row, changePercent: -15.2, volumeMultiple: 5.04 }], "2026-09-29", new Set());
  assert.equal(down.notices[0].side, "down");
  assert.match(down.notices[0].title, /📉 RELIANCE -15%/);
  assert.equal(planShockerNotices([{ ...row, volumeMultiple: 5 }], "2026-09-29", new Set()).notices.length, 0);
});

test("watch normalization drops indexes, duplicates and unsupported keys", () => {
  const watch = normalizeShockerWatch([
    { symbol: "reliance", name: "Reliance", instrumentKey: "NSE_EQ|INE002A01018" },
    { symbol: "RELIANCE", instrumentKey: "NSE_EQ|INE002A01018" },
    { symbol: "NIFTY", instrumentKey: "NSE_INDEX|Nifty 50" },
    { symbol: "M&M", instrumentKey: "NSE_EQ|INE101A01026" },
  ]);
  assert.deepEqual(watch.map((item) => item.symbol), ["RELIANCE", "M&M"]);
  assert.equal(shockerChartUrl("M&M"), "/?symbol=M%26M&timeframe=5m");
});
