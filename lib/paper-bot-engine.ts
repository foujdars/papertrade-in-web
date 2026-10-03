import type { Candle } from "./market";
import { freshPerpQuote, type PerpAccount, type PerpQuote, type PerpSpec } from "./global-markets.ts";
import { roundGlobalPrice, sizeToContracts, submitGlobalOrder } from "./global-order-engine.ts";
import { ema21EntryAt } from "./global-alerts.ts";
import { ema5ReversalAt, emaSeries } from "./ema5-reversal.ts";
import { BOT_FRAMES, BOT_STRATEGIES, botDay, botFrames, botScope, validateBotConfig, type BotFrame, type PaperBot, type BotDecision } from "./paper-bot-state.ts";

export type BotObservation = { candles: Candle[]; fetchedAt: number };
const ema = emaSeries;
function rsi(values: number[], period: number) {
  const result = new Array<number>(values.length).fill(NaN);
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (i <= period) { gain += Math.max(0, change) / period; loss += Math.max(0, -change) / period; }
    else { gain = (gain * (period - 1) + Math.max(0, change)) / period; loss = (loss * (period - 1) + Math.max(0, -change)) / period; }
    if (i >= period) result[i] = gain + loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return result;
}
/** Completed contiguous candles only; EMA entries allow five seconds for the close to settle. */
function closedBotCandles(rows: Candle[], frame: BotFrame, now: number, required: number, delay = 0, freshWindow = 30) {
  const seconds = BOT_FRAMES[frame];
  const closed = [...rows].filter(c => c.time + seconds + delay <= now / 1000).sort((a, b) => a.time - b.time);
  if (closed.length < required) throw new Error("Waiting for enough completed candles");
  const candles = closed.slice(-Math.max(required, 300));
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (![c.time, c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) || c.time % seconds !== 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || (i > 0 && c.time - candles[i - 1].time !== seconds)) throw new Error("Candle history has gaps or invalid values");
  }
  const expected = Math.floor((now / 1000 - delay) / seconds) * seconds - seconds;
  if (candles.at(-1)!.time !== expected || now / 1000 - (candles.at(-1)!.time + seconds) > freshWindow) throw new Error("Waiting for fresh completed candles");
  return candles;
}
export function botSignal(bot: PaperBot, rows: Candle[], now: number, frame: BotFrame = bot.timeframe) {
  validateBotConfig(bot);
  const seconds = BOT_FRAMES[frame];
  const required = bot.strategy === "ema21" ? 27 : bot.strategy === "ema5" ? 6 : (bot.strategy === "ema" ? bot.slow : bot.period) + 2;
  const candles = closedBotCandles(rows, frame, now, required, bot.strategy === "ema21" || bot.strategy === "ema5" ? 5 : 0);
  const last = candles.at(-1)!, values = candles.map(c => c.close), i = values.length - 1;
  let side: "BUY" | "SELL" | null = null;
  let reason = "No new entry signal";
  if (bot.strategy === "ema21") {
    const direction = ema21EntryAt(candles, i, ema(values, 21), seconds, last.high, last.low, last.close);
    if (direction) { side = direction === "bullish" ? "BUY" : "SELL"; reason = `EMA 21 ${direction}: cross, opposite-colour pullback and completed trigger candle break`; }
  } else if (bot.strategy === "ema5") {
    const series = ema(values, 5), prior = candles[i - 1];
    if (ema5ReversalAt(candles, i, series, seconds)) { side = "BUY"; reason = "EMA 5 long: prior candle touched EMA; completed candle low is above EMA 5"; }
    else if (prior.low <= series[i - 1] && series[i - 1] <= prior.high && last.high < series[i]) { side = "SELL"; reason = "EMA 5 mirrored short: prior candle touched EMA; completed candle high is below EMA 5"; }
  } else if (bot.strategy === "ema") {
    const fast = ema(values, bot.fast), slow = ema(values, bot.slow);
    if (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i]) side = "BUY";
    if (fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) side = "SELL";
  } else if (bot.strategy === "rsi") {
    const series = rsi(values, bot.period);
    if (series[i - 1] <= bot.oversold && series[i] > bot.oversold) side = "BUY";
    if (series[i - 1] >= bot.overbought && series[i] < bot.overbought) side = "SELL";
  } else {
    const prior = candles.slice(i - bot.period, i);
    if (last.close > Math.max(...prior.map(c => c.high))) side = "BUY";
    if (last.close < Math.min(...prior.map(c => c.low))) side = "SELL";
  }
  if (side && reason === "No new entry signal") reason = `${BOT_STRATEGIES[bot.strategy]} ${side === "BUY" ? "long" : "short"} on completed candle`;
  if (bot.direction === "long" && side === "SELL" || bot.direction === "short" && side === "BUY") { side = null; reason = "Signal excluded by trade direction"; }
  return { candle: last.time, side, reason, bar: last, timeframe: frame };
}
export function botDailyStats(account: PerpAccount, symbol: string, now: number) {
  const events = account.events.filter(e => e.botId === symbol && botDay(e.at) === botDay(now));
  return { entries: events.filter(e => e.kind === "OPEN").length, net: events.reduce((sum, e) => sum + e.pnl - e.fee, 0) };
}
function freshObservation(observation: BotObservation | undefined, startedAt: number, now: number): BotObservation {
  if (!observation || !Number.isFinite(observation.fetchedAt) || observation.fetchedAt < startedAt || now - observation.fetchedAt > 30000 || observation.fetchedAt > now + 5000) throw new Error("Waiting for fresh candle history");
  return observation;
}
export function botTrendAllows(bot: PaperBot, side: "BUY" | "SELL", observation: BotObservation | undefined, now: number) {
  if (!bot.trendTimeframe || bot.trendTimeframe === "off") return true;
  const frame = bot.trendTimeframe, seconds = BOT_FRAMES[frame], period = bot.trendPeriod ?? 21;
  const history = freshObservation(observation, bot.startedAt, now);
  const closed = closedBotCandles(history.candles, frame, now, period, 5, seconds + 30);
  // Just after an HTF close, allow the prior completed bar during its five-second settlement.
  const latest = closed.at(-1)!, trend = ema(closed.map(c => c.close), period).at(-1)!;
  return side === "BUY" ? latest.close > trend : latest.close < trend;
}
export function botOrderPlan(bot: PaperBot, signal: ReturnType<typeof botSignal>, quote: PerpQuote, spec: PerpSpec) {
  if (!signal.side) throw new Error("Entry requires a signal");
  const sign = signal.side === "BUY" ? 1 : -1;
  // submitGlobalOrder fills at this same rounded bid/ask.
  const entry = roundGlobalPrice(signal.side === "BUY" ? quote.ask : quote.bid, spec);
  const rawStop = bot.exitMode === "signal" ? (sign === 1 ? signal.bar.low : signal.bar.high) - sign * (bot.stopBufferTicks ?? 1) * spec.tick : entry * (1 - sign * bot.stopPercent / 100);
  const stop = bot.exitMode === "signal" ? Number(((sign === 1 ? Math.floor(rawStop / spec.tick + 1e-9) : Math.ceil(rawStop / spec.tick - 1e-9)) * spec.tick).toFixed(10)) : roundGlobalPrice(rawStop, spec);
  const distance = sign * (entry - stop);
  if (!Number.isFinite(distance) || distance <= 0 || stop <= 0) throw new Error("Signal candle stop is on the wrong side of the live entry price");
  const target = roundGlobalPrice(bot.exitMode === "signal" ? entry + sign * distance * (bot.riskReward ?? 2) : entry * (1 + sign * bot.targetPercent / 100), spec);
  let contracts = sizeToContracts(bot.notional, "USD", spec, entry);
  if (bot.sizing === "risk") contracts = Math.min(contracts, Math.floor((bot.riskUsd ?? 5) / (distance * spec.lot)));
  if (!contracts) throw new Error("Trade size or risk budget is below one contract lot");
  return { entry, stop, target, contracts, plannedRisk: contracts * spec.lot * distance };
}
function recordDecision(bot: PaperBot, decision: BotDecision) {
  bot.decisions = [...(bot.decisions ?? []), { ...decision, reason: decision.reason.slice(0, 500) }].slice(-40);
}
/** All timeframe consumption and fills share the wallet lock. One protected position per asset. */
export function advancePaperBots(account: PerpAccount, data: Record<string, { quote: PerpQuote; spec: PerpSpec } | undefined>, observations: Record<string, BotObservation | undefined>, now: number): PerpAccount {
  let next = account;
  for (const original of account.bots ?? []) {
    if (!original.enabled) continue;
    const bot = { ...original, lastCandles: { ...(original.lastCandles ?? {}) }, frameStatus: { ...(original.frameStatus ?? {}) } };
    const signals: ReturnType<typeof botSignal>[] = [];
    try {
      validateBotConfig(bot);
      const frames = botFrames(bot);
      const snapshot = data[bot.symbol];
      if (!snapshot || snapshot.spec.symbol !== bot.symbol || snapshot.quote.symbol !== bot.symbol || !freshPerpQuote(snapshot.quote, now) || snapshot.quote.at < bot.startedAt) throw new Error("Waiting for fresh live prices");
      for (const frame of frames) {
        try {
          const observation = freshObservation(observations[botScope(bot.symbol, frame)] ?? (frames.length === 1 ? observations[bot.symbol] : undefined), bot.startedAt, now);
          const delay = bot.strategy === "ema21" || bot.strategy === "ema5" ? 5 : 0;
          const latest = observation.candles.reduce((v, c) => c.time + BOT_FRAMES[frame] + delay <= now / 1000 ? Math.max(v, c.time) : v, 0);
          const consumed = bot.lastCandles[frame] ?? (frame === bot.timeframe ? bot.lastCandle : 0);
          if (latest && latest <= consumed) continue;
          const signal = botSignal(bot, observation.candles, now, frame);
          if (signal.candle <= consumed) continue;
          bot.lastCandles[frame] = signal.candle;
          bot.lastCandle = Math.max(bot.lastCandle, signal.candle);
          if ((signal.candle + BOT_FRAMES[frame]) * 1000 <= bot.startedAt) throw new Error("Waiting for the next candle close");
          bot.frameStatus[frame] = signal.reason;
          if (signal.side) signals.push(signal);
          else recordDecision(bot, { at: now, timeframe: frame, candle: signal.candle, side: null, outcome: "waiting", reason: signal.reason });
        } catch (e) { bot.frameStatus[frame] = e instanceof Error ? e.message : "Candle evaluation unavailable"; }
      }
      bot.status = frames.map(f => `${f}: ${bot.frameStatus[f] ?? "Waiting for candles"}`).join(" · ").slice(0, 500);
      if (signals.length) {
        let blocked = "";
        const daily = botDailyStats(next, bot.symbol, now);
        if (new Set(signals.map(s => s.side)).size > 1) blocked = "Conflicting timeframe signals · waiting for a new candle";
        else if (daily.entries >= bot.maxEntries || daily.net <= -bot.maxDailyLoss) blocked = "Daily limit reached · resumes on the next India calendar day";
        else if (next.positions.some(p => p.symbol === bot.symbol) || next.orders.some(o => o.symbol === bot.symbol)) blocked = "Position or pending order already exists for this asset";
        else if (bot.lastEntryAt && now - bot.lastEntryAt < bot.cooldown * BOT_FRAMES[frames[0]] * 1000) blocked = "Entry cooldown active";
        // Highest timeframe wins same-direction signals, so simultaneous closes do not duplicate entries.
        const chosen = [...signals].sort((a, b) => BOT_FRAMES[b.timeframe] - BOT_FRAMES[a.timeframe])[0];
        if (!blocked) {
          try {
            if (!botTrendAllows(bot, chosen.side!, observations[botScope(bot.symbol, bot.trendTimeframe as BotFrame)], now)) blocked = `Blocked by ${bot.trendTimeframe} EMA ${bot.trendPeriod ?? 21} trend filter`;
          } catch (e) { blocked = e instanceof Error ? e.message : "Waiting for trend filter"; }
        }
        let entered = false;
        if (!blocked) {
          try {
            const { quote, spec } = snapshot, plan = botOrderPlan(bot, chosen, quote, spec);
            next = submitGlobalOrder(next, spec, quote, { type: "Market", side: chosen.side!, contracts: plan.contracts, leverage: bot.leverage,
              protection: { source: "mark", stopLoss: { mode: "Market", trigger: plan.stop }, takeProfit: { mode: "Market", trigger: plan.target } },
            }, now);
            const detail = `Bot · ${BOT_STRATEGIES[bot.strategy]} · ${chosen.timeframe} · ${chosen.reason} · planned stop risk $${plan.plannedRisk.toFixed(2)} before fees`;
            next = { ...next, positions: next.positions.map(p => p.symbol === bot.symbol ? { ...p, botId: bot.symbol } : p), events: next.events.map((e, i) => i === next.events.length - 1 ? { ...e, botId: bot.symbol, detail: `${detail} · ${e.detail}` } : e) };
            bot.lastEntryAt = now;
            bot.status = `${chosen.timeframe} ${chosen.side === "BUY" ? "Long" : "Short"} paper entry · ${plan.contracts} lots`;
            entered = true;
          } catch (e) { blocked = e instanceof Error ? e.message : "Paper entry failed"; }
        }
        if (blocked) bot.status = blocked;
        for (const signal of signals) {
          const outcome = entered && signal.timeframe === chosen.timeframe ? "entered" : "skipped";
          const reason = blocked || (outcome === "entered" ? signal.reason : `${chosen.timeframe} received priority · one position per asset`);
          bot.frameStatus[signal.timeframe] = reason;
          recordDecision(bot, { at: now, timeframe: signal.timeframe, candle: signal.candle, side: signal.side, outcome, reason });
        }
      }
    } catch (e) { bot.status = e instanceof Error ? e.message : "Bot evaluation failed"; }
    if (JSON.stringify(bot) !== JSON.stringify(original)) next = { ...next, revision: next.revision + 1, bots: next.bots!.map(b => b.symbol === bot.symbol ? bot : b) };
  }
  return next;
}
