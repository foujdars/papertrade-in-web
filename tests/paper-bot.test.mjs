import test from "node:test";
import assert from "node:assert/strict";
import { defaultBot, configureBot, botDay } from "../lib/paper-bot-state.ts";
import { botSignal, advancePaperBots, botDailyStats } from "../lib/paper-bot-engine.ts";
import { readGlobalAccount, advanceGlobalAccount, submitGlobalOrder } from "../lib/global-order-engine.ts";
import { closePerp } from "../lib/global-markets.ts";
const base = 1800000000000, seconds = 300;
const values = [...Array(24).fill(100), 110];
const candles = (prices = values) => prices.map((close, i) => ({ time: base / 1000 + i * seconds, open: close, high: close + .5, low: close - .5, close, volume: 100 }));
const now = base + values.length * seconds * 1000 + 1000;
const spec = { symbol: "BTCUSD", lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
const quote = { symbol: "BTCUSD", last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, change: 1, at: now, operational: true };
const live = { BTCUSD: { quote, spec } };
const observation = { BTCUSD: { candles: candles(), fetchedAt: now } };
const bot = configureBot(undefined, { ...defaultBot("BTCUSD"), strategy: "breakout", period: 10 }, true, now - seconds * 1000);
const account = () => ({ ...readGlobalAccount(null), bots: [bot] });
const run = (a = account(), data = live, rows = observation, at = now) => advancePaperBots(a, data, rows, at);

test("completed candles produce both-direction EMA, RSI and range signals", () => {
  for (const strategy of ["ema", "rsi", "breakout"]) {
    const c = { ...bot, strategy, period: 3 };
    const up = strategy === "rsi" ? [...Array(15).fill(120), 110, 100, 90, 150] : values;
    assert.equal(botSignal(c, candles(up), base + up.length * seconds * 1000 + 1000).side, "BUY", strategy);
    const down = up.map(v => 250 - v);
    assert.equal(botSignal(c, candles(down), base + down.length * seconds * 1000 + 1000).side, "SELL", strategy);
    assert.equal(botSignal({ ...c, direction: "long" }, candles(down), base + down.length * seconds * 1000 + 1000).side, null);
  }
});
test("the forming candle, old history, gaps and bad OHLC never make an entry", () => {
  const forming = candles([...Array(24).fill(100), 110]);
  assert.equal(botSignal(bot, forming, now - seconds * 1000).side, null);
  assert.throws(() => botSignal(bot, candles(), now + 30000), /fresh/);
  assert.throws(() => botSignal(bot, candles().filter((_, i) => i !== 20), now), /gaps/);
  assert.throws(() => botSignal(bot, candles().map((c, i) => i === 23 ? { ...c, low: 200 } : c), now), /invalid/);
});
test("a new signal makes a protected USD paper entry with fees and persists", () => {
  const a = run();
  assert.equal(a.positions.length, 1);
  assert.equal(a.positions[0].botId, "BTCUSD");
  assert.equal(a.positions[0].contracts, 90);
  assert.equal(a.positions[0].protection.stopLoss.trigger, 108.9);
  assert.equal(a.positions[0].protection.takeProfit.trigger, 112.2);
  assert.equal(a.events[0].botId, "BTCUSD");
  assert.ok(a.wallet < 10000);
  assert.deepEqual(readGlobalAccount(JSON.stringify(a)), JSON.parse(JSON.stringify(a)));
});
test("persisted candle consumption prevents duplicate entries across tabs and after closing", () => {
  const first = run(), otherTab = readGlobalAccount(JSON.stringify(first));
  assert.equal(run(otherTab).events.length, 1);
  const closed = closePerp(first, "BTCUSD", quote, first.positions[0].contracts, now);
  assert.equal(run(closed).positions.length, 0);
  assert.equal(closed.events.at(-1).botId, "BTCUSD");
});
test("pause, stale or missing data and current start time block execution", () => {
  assert.equal(run({ ...account(), bots: [{ ...bot, enabled: false }] }).positions.length, 0);
  assert.equal(run(account(), { BTCUSD: { spec, quote: { ...quote, at: now - 31000 } } }).positions.length, 0);
  assert.equal(run(account(), live, {}).positions.length, 0);
  assert.equal(run({ ...account(), bots: [configureBot(bot, bot, true, now)] }).positions.length, 0);
  assert.equal(run(account(), live, { BTCUSD: { ...observation.BTCUSD, fetchedAt: now - 31000 } }).positions.length, 0);
});
test("daily entry and loss limits block new entries; the India day resets the counters", () => {
  const first = run(), closed = closePerp(first, "BTCUSD", quote, first.positions[0].contracts, now);
  const retry = { ...closed, bots: [{ ...bot, maxEntries: 1 }] };
  assert.match(run(retry).bots[0].status, /Daily limit/);
  const loss = { ...account(), events: [{ ...first.events[0], kind: "CLOSE", pnl: -101 }] };
  assert.match(run(loss).bots[0].status, /Daily limit/);
  assert.equal(botDailyStats({ ...first, events: first.events.map(e => ({ ...e, at: now - 86400000 })) }, "BTCUSD", now).entries, 0);
  assert.notEqual(botDay(Date.parse("2026-10-02T18:29:59Z")), botDay(Date.parse("2026-10-02T18:30:00Z")));
});
test("cooldown, existing manual exposure, small lot sizes and funding gaps block entry", () => {
  assert.match(run({ ...account(), bots: [{ ...bot, lastEntryAt: now - 1000 }] }).bots[0].status, /cooldown/);
  const manual = submitGlobalOrder(account(), spec, quote, { type: "Market", side: "BUY", contracts: 1, leverage: 1 }, now);
  assert.equal(run(manual).positions[0].contracts, 1);
  assert.match(run(manual).bots[0].status, /already exists/);
  const pending = submitGlobalOrder(account(), spec, quote, { type: "Limit", side: "BUY", contracts: 1, leverage: 1, limit: 100 }, now);
  assert.equal(run(pending).positions.length, 0);
  assert.match(run(account(), { BTCUSD: { quote, spec: { ...spec, lot: 100 } } }).bots[0].status, /below one/);
  assert.equal(run({ ...account(), fundingGap: true }).positions.length, 0);
  assert.throws(() => submitGlobalOrder(run(), spec, quote, { type: "Market", side: "BUY", contracts: 1, leverage: 1 }, now), /bot position/);
});
test("automatic target and stop exits retain attribution and flow through the normal wallet history", () => {
  for (const price of [108, 113]) {
    const opened = run(), q = { ...quote, at: now + 1000, last: price, mark: price, bid: price - .01, ask: price };
    const closed = advanceGlobalAccount(opened, { BTCUSD: q }, { BTCUSD: spec }, now + 1000);
    assert.equal(closed.positions.length, 0);
    assert.equal(closed.events.at(-1).kind, "CLOSE");
    assert.equal(closed.events.at(-1).botId, "BTCUSD");
    assert.ok(Math.abs(botDailyStats(closed, "BTCUSD", now).net - (closed.wallet - 10000)) < 1e-8);
  }
});
test("all four assets use their own quote, rules and lot multiplier", () => {
  for (const symbol of ["BTCUSD", "ETHUSD", "SOLUSD", "XAUTUSD"]) {
    const b = { ...bot, symbol };
    const a = run({ ...account(), bots: [b] }, { [symbol]: { spec: { ...spec, symbol, lot: .1 }, quote: { ...quote, symbol } } }, { [symbol]: observation.BTCUSD });
    assert.equal(a.positions[0].symbol, symbol);
    assert.equal(a.positions[0].contracts, 9);
  }
});
test("malformed saved bot data is preserved and rejected instead of being silently reset", () => {
  assert.throws(() => readGlobalAccount(JSON.stringify({ ...account(), bots: [{ ...bot, notional: -1 }] })), /notional/);
  assert.throws(() => readGlobalAccount(JSON.stringify({ ...account(), bots: [bot, bot] })), /invalid/);
  assert.throws(() => configureBot(bot, { ...bot, fast: 25, slow: 20 }, true, now), /fast EMA/);
});
