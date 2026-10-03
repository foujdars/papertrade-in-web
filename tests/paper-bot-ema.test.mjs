import test from "node:test";
import assert from "node:assert/strict";
import { BOT_FRAMES, botFrames, botPreset, configureBot, defaultBot, validateBotConfig } from "../lib/paper-bot-state.ts";
import { advancePaperBots, botOrderPlan, botSignal, botTrendAllows } from "../lib/paper-bot-engine.ts";
import { closePerp } from "../lib/global-markets.ts";
import { readGlobalAccount } from "../lib/global-order-engine.ts";

const end = Math.ceil(1800000000000 / 86400000) * 86400000, now = end + 6000;
const spec = { symbol: "BTCUSD", lot: .01, tick: .01, initial: .01, maintenance: .005, initialScale: 0, maintenanceScale: 0, scalingThreshold: 100000, maxNotional: 5000000, maker: .0002, taker: .0005, liquidation: .0005, fundingSeconds: 28800, operational: true, fetchedAt: now };
const quote = { symbol: "BTCUSD", last: 110, mark: 110, index: 110, bid: 109.99, ask: 110, bidSize: 10000, askSize: 10000, funding: 0, at: now, operational: true };
const live = { BTCUSD: { quote, spec } };
const mirror = c => ({ ...c, open: 200 - c.open, close: 200 - c.close, high: 200 - c.low, low: 200 - c.high });
function bars(frame, strategy = "ema5", bearish = false, red = false) {
  const rows = Array.from({ length: 24 }, () => ({ open: 100, high: 101, low: 99, close: 100 }));
  if (strategy === "ema21") rows.push({ open: 99, high: 103, low: 98, close: 102 }, { open: 102, high: 104, low: 100.5, close: 101 }, { open: 101, high: 106, low: 100, close: 105 });
  else rows.push({ open: red ? 111 : 105, high: 112, low: 104, close: 110 });
  return rows.map((c, i) => ({ ...(bearish ? mirror(c) : c), time: end / 1000 - (rows.length - i) * BOT_FRAMES[frame], volume: 100 }));
}
const observation = candles => ({ candles, fetchedAt: now });
const create = (config = {}) => configureBot(undefined, { ...defaultBot("BTCUSD"), ...config }, true, end - 1000);
const account = bot => ({ ...readGlobalAccount(null), bots: [bot] });
const run = (bot, histories, a = account(bot), at = now) => advancePaperBots(a, live, histories, at);

for (const frame of Object.keys(BOT_FRAMES)) for (const strategy of ["ema21", "ema5"]) {
  test(`${strategy} uses the chart rule on completed ${frame} candles, including mirrored shorts`, () => {
    const bot = create({ strategy, timeframe: frame });
    assert.equal(botSignal(bot, bars(frame, strategy), now).side, "BUY");
    assert.equal(botSignal(bot, bars(frame, strategy, true), now).side, "SELL");
    assert.equal(botSignal({ ...bot, direction: "long" }, bars(frame, strategy, true), now).side, null);
    const forming = [...bars(frame, strategy), { ...bars(frame, strategy).at(-1), time: end / 1000, close: 105 }];
    assert.equal(botSignal(bot, forming, now).candle, end / 1000 - BOT_FRAMES[frame]);
    assert.throws(() => botSignal(bot, bars(frame, strategy), end + 4000), /Waiting/, "wait five seconds after close");
    assert.throws(() => botSignal(bot, bars(frame, strategy), end + 31000), /fresh/);
  });
}
test("EMA 21 requires the opposite-colour pullback; EMA 5 requires prior touch and strict candle separation", () => {
  const b21 = create({ strategy: "ema21" });
  const rows = bars("5m", "ema21");
  assert.equal(botSignal(b21, rows.map((c, i) => i === rows.length - 2 ? { ...c, open: 100.6 } : c), now).side, null);
  const b5 = create({ strategy: "ema5" });
  assert.equal(botSignal(b5, bars("5m", "ema5", false, true), now).side, "BUY", "red triggers also count");
  assert.equal(botSignal(b5, bars("5m").map((c, i, a) => i === a.length - 1 ? { ...c, low: 100 } : c), now).side, null);
  assert.equal(botSignal(b5, bars("5m").map((c, i, a) => i === a.length - 2 ? { ...c, open: 101, close: 101, high: 102, low: 101 } : c), now).side, null);
});
test("same-direction timeframes create one highest-frame entry and persist every consumed signal", () => {
  const bot = create(botPreset(defaultBot("BTCUSD"), "ema5"));
  const histories = { "BTCUSD:5m": observation(bars("5m")), "BTCUSD:15m": observation(bars("15m")) };
  const opened = run(bot, histories);
  assert.equal(opened.positions.length, 1);
  assert.match(opened.events[0].detail, /15m/);
  assert.equal(opened.bots[0].decisions.find(d => d.timeframe === "5m").outcome, "skipped");
  assert.equal(opened.bots[0].decisions.find(d => d.timeframe === "15m").outcome, "entered");
  assert.equal(opened.positions[0].protection.stopLoss.trigger, 103.99);
  assert.equal(opened.positions[0].protection.takeProfit.trigger, 122.02);
  const closed = closePerp(readGlobalAccount(JSON.stringify(opened)), "BTCUSD", quote, opened.positions[0].contracts, now);
  assert.equal(run(bot, histories, closed).positions.length, 0);
  assert.equal(run(bot, histories, closed).bots[0].decisions.length, 2);
});
test("opposing timeframe signals skip together; missing one frame never substitutes another frame's candles", () => {
  const bot = create({ strategy: "ema5", timeframes: ["5m", "15m"] });
  const conflict = run(bot, { "BTCUSD:5m": observation(bars("5m")), "BTCUSD:15m": observation(bars("15m", "ema5", true)) });
  assert.equal(conflict.positions.length, 0);
  assert.match(conflict.bots[0].status, /Conflicting/);
  assert.ok(conflict.bots[0].decisions.every(d => d.outcome === "skipped"));
  const partial = run(bot, { "BTCUSD:5m": observation(bars("5m")) });
  assert.equal(partial.positions.length, 1);
  assert.match(partial.bots[0].frameStatus["15m"], /history/);
  assert.equal(run(bot, { BTCUSD: observation(bars("5m")) }).positions.length, 0);
});
test("restarting at or after a close never replays that close; stale and future history cannot enter", () => {
  const bot = create({ strategy: "ema5" });
  for (const fetchedAt of [now - 31000, now + 6000]) assert.equal(run(bot, { "BTCUSD:5m": { candles: bars("5m"), fetchedAt } }).positions.length, 0);
  const restarted = configureBot(bot, bot, true, end);
  assert.equal(run(restarted, { "BTCUSD:5m": observation(bars("5m")) }).positions.length, 0);
  const malformed = { ...bot, timeframes: 2 };
  assert.match(run(malformed, {}).bots[0].status, /timeframe/);
});
test("higher timeframe filter uses only contiguous completed bars and blocks absent, stale, wrong-side or equal trends", () => {
  const bot = create({ strategy: "ema5", trendTimeframe: "1H", trendPeriod: 5 });
  const trend = observation(bars("1H"));
  assert.equal(botTrendAllows(bot, "BUY", trend, now), true);
  assert.equal(botTrendAllows(bot, "SELL", trend, now), false);
  const forming = { ...trend, candles: [...trend.candles, { ...trend.candles.at(-1), time: end / 1000, low: 1, close: 2, open: 2 }] };
  assert.equal(botTrendAllows(bot, "BUY", forming, now), true);
  const flat = { ...trend, candles: trend.candles.map(c => ({ ...c, open: 100, close: 100, low: 99, high: 101 })) };
  assert.equal(botTrendAllows(bot, "BUY", flat, now), false);
  for (const bad of [undefined, { ...trend, fetchedAt: now - 31000 }, { ...trend, fetchedAt: now + 6000 }, { ...trend, candles: trend.candles.slice(0, -1) }, { ...trend, candles: trend.candles.filter((_, i) => i !== 20) }]) assert.throws(() => botTrendAllows(bot, "BUY", bad, now));
  assert.equal(botTrendAllows(bot, "BUY", trend, end + 4000), false, "settlement still uses previous completed trend");
  const histories = { "BTCUSD:5m": observation(bars("5m")), "BTCUSD:1H": trend };
  assert.equal(run(bot, histories).positions.length, 1);
  assert.equal(run(bot, { ...histories, "BTCUSD:1H": flat }).positions.length, 0);
  assert.equal(run(bot, { "BTCUSD:5m": histories["BTCUSD:5m"] }).positions.length, 0);
});
test("risk sizing floors lots, respects the notional cap, rounds stops outward and derives targets from actual entry", () => {
  const bot = create({ strategy: "ema5", exitMode: "signal", sizing: "risk", riskUsd: 5, notional: 1000, riskReward: 2 });
  const signal = botSignal(bot, bars("5m"), now);
  const plan = botOrderPlan(bot, signal, quote, spec);
  assert.equal(plan.contracts, 83);
  assert.ok(plan.plannedRisk <= 5);
  assert.equal(plan.target, 122.02);
  const capped = botOrderPlan({ ...bot, riskUsd: 100, notional: 100 }, signal, quote, spec);
  assert.equal(capped.contracts, 90);
  assert.ok(capped.contracts * spec.lot * capped.entry <= 100);
  const rounded = botOrderPlan(bot, { ...signal, bar: { ...signal.bar, low: 104.004 } }, { ...quote, ask: 110.004 }, spec);
  assert.equal(rounded.entry, 110);
  assert.equal(rounded.stop, 103.99);
  assert.throws(() => botOrderPlan(bot, signal, { ...quote, ask: 100 }, spec), /wrong side/);
  assert.throws(() => botOrderPlan({ ...bot, riskUsd: .1 }, signal, quote, { ...spec, lot: 1 }), /below one/);
  const short = botSignal({ ...bot, direction: "both" }, bars("5m", "ema5", true), now);
  const shortPlan = botOrderPlan(bot, short, { ...quote, bid: 90.004 }, spec);
  assert.equal(shortPlan.entry, 90);
  assert.equal(shortPlan.stop, 96.01);
  assert.equal(shortPlan.target, 77.98);
  assert.ok(shortPlan.plannedRisk <= 5);
});
test("existing settings migrate, invalid combinations reject, and stale editors cannot overwrite current log or cooldown", () => {
  const old = create();
  for (const key of ["timeframes", "lastCandles", "frameStatus", "decisions", "sizing", "riskUsd", "exitMode", "riskReward", "stopBufferTicks", "trendTimeframe", "trendPeriod"]) delete old[key];
  assert.deepEqual(botFrames(readGlobalAccount(JSON.stringify(account(old))).bots[0]), ["5m"]);
  for (const fields of [{ timeframes: [] }, { timeframes: ["5m", "5m"] }, { timeframes: ["1m", "3m", "5m", "15m", "30m"] }, { timeframes: ["1m"] }, { trendTimeframe: "5m" }, { timeframes: ["5m", "1H"], trendTimeframe: "30m" }, { riskUsd: 0 }, { riskReward: Infinity }]) assert.throws(() => validateBotConfig({ ...old, ...fields }));
  const current = { ...old, lastEntryAt: now, decisions: [{ at: now, timeframe: "5m", candle: end / 1000 - 300, side: null, outcome: "waiting", reason: "Current wallet log" }] };
  const saved = configureBot(current, { ...old, lastEntryAt: 0, decisions: [] }, true, now + 1000);
  assert.equal(saved.lastEntryAt, now);
  assert.deepEqual(saved.decisions, current.decisions);
  assert.throws(() => readGlobalAccount(JSON.stringify(account({ ...saved, lastCandles: { "2m": 1 } }))), /timeframe/);
  assert.throws(() => readGlobalAccount(JSON.stringify(account({ ...saved, decisions: [{ ...current.decisions[0], outcome: "filled" }] }))), /decision/);
});
