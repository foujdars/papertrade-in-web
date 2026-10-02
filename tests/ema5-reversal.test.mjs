import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ema5AlertId, ema5AlertNotice, ema5AlertTitle, ema5ReversalAt, ema5ReversalSignal, emaSeries } from "../lib/ema5-reversal.ts";

const bar = (time, low, high, close, open = close) => ({ time, open, high, low, close });

test("EMA 5 matches the chart seed", () => {
  const values = emaSeries([1, 2, 3, 4, 5, 5], 5);
  assert.equal(Number.isFinite(values[3]), false);
  assert.equal(values[4], 3);
  assert.ok(Math.abs(values[5] - (3 + (2 / 6) * 2)) < 1e-9);
});

test("a candle of either colour alerts only when its low lifts off a touched 5 EMA", () => {
  const prior = bar(0, 99, 101, 100);
  const green = bar(300, 101, 110, 108, 102);
  const red = bar(300, 101, 110, 102, 108);
  assert.equal(ema5ReversalAt([prior, green], 1, [100, 100], 300), true);
  assert.equal(ema5ReversalAt([prior, red], 1, [100, 100], 300), true);
  assert.equal(ema5ReversalAt([prior, bar(300, 100, 110, 108)], 1, [100, 100], 300), false);
  assert.equal(ema5ReversalAt([bar(0, 101, 110, 105), green], 1, [100, 100], 300), false);
  assert.equal(ema5ReversalAt([prior, bar(900, 101, 110, 108)], 1, [100, 100], 300), false);
});

test("only a fresh closed BTC candle can notify", () => {
  const lastTime = 1_700_000_000;
  const now = (lastTime + 300) * 1000 + 30_000;
  const candles = Array.from({ length: 6 }, (_, index) => bar(lastTime - 300 * (6 - index), 99, 101, 100));
  candles.push(bar(lastTime, 104, 112, 110, 105));
  assert.equal(ema5ReversalSignal(candles, "5m", now), lastTime);
  const withForming = [...candles, bar(lastTime + 300, 130, 140, 135)];
  assert.equal(ema5ReversalSignal(withForming, "5m", now), lastTime);
  const forming = bar(lastTime + 300, 120, 130, 125);
  assert.equal(ema5ReversalSignal([...candles.slice(0, -1), forming], "5m", now), null);
  assert.equal(ema5ReversalSignal(candles, "5m", (lastTime + 300) * 1000 + 10 * 60_000), null);
});

test("5 EMA reversal notices name BTC and stay inside the shade", () => {
  const title = ema5AlertTitle("5m");
  assert.match(title, /BTC 5m EMA 5 reversal/);
  assert.ok(title.length <= 42);
  assert.ok(ema5AlertTitle("15m").length <= 42);
  const notice = ema5AlertNotice({ frame: "5m", candleTime: 1_700_000_000, now: 1_700_000_100_000 });
  assert.equal(notice.id, ema5AlertId("5m", 1_700_000_000));
  assert.match(notice.body, /completed candle low stayed above EMA 5/);
  assert.match(notice.body, /IST/);
  assert.equal(notice.kind, "session");
  assert.equal(notice.silent, false);
  assert.equal(notice.url, "/?symbol=BTCUSD&timeframe=5m");
});

test("the technical cron keeps 5 EMA reversal alerts from failing the rest of the run", async () => {
  const route = await readFile(new URL("../app/api/technical-alerts/dispatch/route.ts", import.meta.url), "utf8");
  assert.match(route, /try \{ await dispatchEma5ReversalAlerts\(db\); \}/);
});
