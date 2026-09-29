import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ema21AlertId, ema21AlertNotice, ema21AlertTitle } from "../lib/ema21-default-alerts.ts";

test("EMA 21 default alerts name the broken candle and fit the shade", () => {
  const bullish = ema21AlertTitle("BTC", "5m", "bullish");
  const bearish = ema21AlertTitle("Gold", "15m", "bearish");
  assert.match(bullish, /BTC 5m broke the red candle/);
  assert.match(bearish, /Gold 15m broke the green candle/);
  assert.ok(bullish.length <= 42);
  assert.ok(bearish.length <= 42);
  const notice = ema21AlertNotice({ symbol: "BTCUSD", label: "BTC", frame: "5m", side: "bullish", candleTime: 1_700_000_000, now: 1_700_000_100_000 });
  assert.equal(notice.id, ema21AlertId("BTCUSD", "5m", "bullish", 1_700_000_000));
  assert.equal(notice.body, "");
  assert.equal(notice.kind, "session");
  assert.equal(notice.silent, false);
  assert.equal(notice.url, "/?symbol=BTCUSD&timeframe=5m");
});

test("the technical cron keeps EMA 21 alerts from failing the rest of the run", async () => {
  const route = await readFile(new URL("../app/api/technical-alerts/dispatch/route.ts", import.meta.url), "utf8");
  assert.match(route, /try \{ await dispatchDefaultEma21Alerts\(db\); \}/);
});
