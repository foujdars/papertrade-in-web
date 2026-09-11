import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareReplayCandles, replayTrade, replayPnl, emptyReplayAccount } from "../lib/bar-replay.ts";

const bar = (time, close) => ({ time, open: close, high: close + 2, low: close - 2, close, volume: 100 });
test("replay snapshots are sorted, deduplicated, validated and exclude the newest forming candle", () => {
  const input = [bar(300, 103), bar(100, 100), bar(200, 102), bar(200, 102), bar(400, NaN)];
  assert.deepEqual(prepareReplayCandles(input).map(x => x.time), [100, 200]);
  assert.equal(input.length, 5);
});
test("replay long and short fills use only the currently revealed price and selected quantity", () => {
  let account = replayTrade(emptyReplayAccount(), "BUY", bar(100, 100), 50);
  assert.equal(replayPnl(account.position, 103), 150);
  account = replayTrade(account, "CLOSE", bar(200, 103), 1);
  assert.equal(account.realized, 150);
  assert.equal(account.position, null);
  assert.equal(account.fills[1].quantity, 50);
  account = replayTrade(account, "SELL", bar(300, 110), 25);
  account = replayTrade(account, "BUY", bar(400, 108), 999);
  assert.equal(account.realized, 200);
  assert.deepEqual(account.fills.map(x => x.role), ["ENTRY", "EXIT", "ENTRY", "EXIT"]);
});
test("invalid quantities and repeated same-side orders cannot create or enlarge replay exposure", () => {
  const empty = emptyReplayAccount();
  for (const quantity of [0, -1, NaN, Infinity, 1.2]) assert.equal(replayTrade(empty, "BUY", bar(100, 100), quantity), empty);
  assert.equal(replayTrade(empty, "CLOSE", bar(100, 100), 1), empty);
  const open = replayTrade(empty, "SELL", bar(100, 100), 1);
  assert.equal(replayTrade(open, "SELL", bar(200, 99), 1000), open);
  assert.deepEqual(emptyReplayAccount(), { position: null, realized: 0, fills: [] });
});
test("original chart powers replay, hides future bars and never feeds replay prices into portfolio state", async () => {
  const replay = await readFile(new URL("../components/BarReplay.tsx", import.meta.url), "utf8");
  const chart = await readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8");
  assert.match(replay, /<MarketChart/);
  assert.match(replay, /candles\.slice\(0, cursor \+ 1\)/);
  assert.match(replay, /instrumentKey: instrument\.instrumentKey, timeframe, scope: "combined"/);
  assert.doesNotMatch(replay, /writePaperOrders|localStorage|onPrice=|onOrderSide=/);
  assert.match(chart, /if \(isReplay\) return;[\s\S]*?async function loadUpstoxCandles/);
  assert.match(chart, /if \(isReplay \|\| !LIVE_TIMEFRAME_SECONDS/);
  assert.match(chart, /if \(isReplay \|\| \(feedMode/);
  assert.match(chart, /const stored = isReplay \? \[\]/);
});
test("chart entry points and header coach use shared replay on the selected timeframe", async () => {
  const dashboard = await readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8");
  const coach = await readFile(new URL("../components/TradingCoach.tsx", import.meta.url), "utf8");
  const fno = await readFile(new URL("../components/FnoChartWorkspace.tsx", import.meta.url), "utf8");
  const advanced = await readFile(new URL("../components/AdvancedChartWorkspace.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /<NotificationCenter \/>[\s\S]{0,150}header-coach-button/);
  assert.doesNotMatch(dashboard, /className="coach-launch-button"/);
  assert.match(dashboard, /instrument=\{replayInstrument\} timeframe=\{replayReviewTimeframe \?\? timeframe\}/);
  assert.match(dashboard, /setReplayReviewTimeframe\(pnlReviewTimeframe\)/);
  assert.match(coach, /<BarReplay[\s\S]*?initialTimeframe=\{timeframe\}/);
  assert.doesNotMatch(coach, /5-minute historical replay|coach-candle-canvas/);
  assert.match(fno, /onReplay\(topInstrument\)/);
  assert.match(fno, /onReplay\(option\)/);
  assert.match(advanced, /<BarReplayDialog instrument=\{instrument\} timeframe=\{timeframe\}/);
});
