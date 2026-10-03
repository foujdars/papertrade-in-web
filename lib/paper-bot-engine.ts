import { entryGeometry, initialBotExit, manageBotProtection, averageTrueRange } from "./bot-protection.ts";
import { portfolioRisk, walletEntryReason } from "./portfolio-risk.ts";
import type { Candle } from "./market";
import { freshPerpQuote, type PerpAccount, type PerpQuote, type PerpSpec } from "./global-markets.ts";
import { sizeToContracts, submitGlobalOrder } from "./global-order-engine.ts";
import { BOT_FRAMES, BOT_STRATEGIES, botDay, validateBotConfig, type PaperBot } from "./paper-bot-state.ts";

export type BotObservation = { candles: Candle[]; fetchedAt: number };
function ema(values: number[], period: number) {
  const result: number[] = [];
  let current = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i >= period) current += 2 / (period + 1) * (values[i] - current);
    result.push(i < period - 1 ? NaN : current);
  }
  return result;
}
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
/** Signals use completed, contiguous exchange candles, never the forming candle. */
export function botSignal(bot: PaperBot, rows: Candle[], now: number) {
  validateBotConfig(bot);
  const seconds = BOT_FRAMES[bot.timeframe];
  const closed = [...rows].filter(c => c.time + seconds <= now / 1000).sort((a, b) => a.time - b.time);
  const required = (bot.strategy === "ema" ? bot.slow : bot.period) + 2;
  if (closed.length < required) throw new Error("Waiting for enough completed candles");
  const candles = closed.slice(-Math.max(required, 300));
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (![c.time, c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0) || c.time % seconds !== 0 || c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || (i > 0 && c.time - candles[i - 1].time !== seconds)) throw new Error("Candle history has gaps or invalid values");
  }
  const last = candles.at(-1)!;
  if (now / 1000 - (last.time + seconds) > 30) throw new Error("Waiting for fresh completed candles");
  const values = candles.map(c => c.close), i = values.length - 1;
  let side: "BUY" | "SELL" | null = null;
  if (bot.strategy === "ema") {
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
  if (bot.direction === "long" && side === "SELL" || bot.direction === "short" && side === "BUY") side = null;
  const atr = averageTrueRange(candles), trendSeries = ema(values, Math.min(20, values.length - 2));
  const trendDistance = atr ? Math.abs(last.close - trendSeries.at(-1)!) / atr : 0;
  const regime = atr && atr / last.close > .05 ? "stress" : trendDistance >= 1 ? "trend" : "range";
  if (bot.regimeFilter && bot.regimeFilter !== "any" && (regime === "stress" || regime !== bot.regimeFilter)) side = null;
  return { candle: last.time, side, regime };

}
export function botDailyStats(account: PerpAccount, symbol: string, now: number) {
  const events = account.events.filter(e => e.botId === symbol && botDay(e.at) === botDay(now));
  return { entries: events.filter(e => e.kind === "OPEN").length, net: events.reduce((sum, e) => sum + e.pnl - e.fee, 0) };
}
/** Called within the same wallet lock as manual orders. Candle consumption and fills save atomically. */
export function advancePaperBots(account: PerpAccount, data: Record<string, { quote: PerpQuote; spec: PerpSpec } | undefined>, observations: Record<string, BotObservation | undefined>, now: number): PerpAccount {
  const quotes = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value?.quote]));
  const histories = Object.fromEntries((account.bots ?? []).map(b => [b.symbol, observations[b.symbol] && now - observations[b.symbol]!.fetchedAt <= 30000 ? observations[b.symbol]!.candles.filter(c => c.time + BOT_FRAMES[account.positions.find(p => p.botId === b.symbol)?.botExit?.timeframe ?? b.timeframe] <= now / 1000) : undefined]));
  let next = manageBotProtection(account, quotes, histories, now);

  for (const original of account.bots ?? []) {
    if (!original.enabled) continue;
    const bot = { ...original };
    try {
      validateBotConfig(bot);
      const snapshot = data[bot.symbol], observation = observations[bot.symbol];
      if (!snapshot || !freshPerpQuote(snapshot.quote, now) || snapshot.quote.at < bot.startedAt) throw new Error("Waiting for fresh live prices");
      if (!observation || observation.fetchedAt < bot.startedAt || now - observation.fetchedAt > 30000 || observation.fetchedAt > now + 5000) throw new Error("Waiting for candle history");
      const seconds = BOT_FRAMES[bot.timeframe];
      const latestClosed = observation.candles.reduce((latest, c) => c.time + seconds <= now / 1000 ? Math.max(latest, c.time) : latest, 0);
      if (latestClosed && latestClosed <= bot.lastCandle) continue;
      const signal = botSignal(bot, observation.candles, now);
      if (signal.candle <= bot.lastCandle) continue;
      bot.lastCandle = signal.candle;
      if (signal.candle + BOT_FRAMES[bot.timeframe] <= bot.startedAt / 1000) throw new Error("Waiting for the next candle close");
      const daily = botDailyStats(next, bot.symbol, now);
      if (daily.entries >= bot.maxEntries || daily.net <= -bot.maxDailyLoss) throw new Error("Daily limit reached · resumes on the next India calendar day");
      if (next.positions.some(p => p.symbol === bot.symbol) || next.orders.some(o => o.symbol === bot.symbol)) throw new Error("Position or pending order already exists for this asset");
      if (bot.lastEntryAt && now - bot.lastEntryAt < bot.cooldown * BOT_FRAMES[bot.timeframe] * 1000) throw new Error("Entry cooldown active");
      bot.status = "Watching · no entry signal";
      if (signal.side) {
        const { quote, spec } = snapshot;
        const entry = signal.side === "BUY" ? quote.ask : quote.bid;
        const closed = observation.candles.filter(c => c.time + BOT_FRAMES[bot.timeframe] <= now / 1000);
        const geometry = entryGeometry(bot, closed, entry, spec, signal.side);
        const stats = portfolioRisk(next, quotes, now);
        if (bot.sizingMode === "risk" && (stats.missing || stats.unsupported)) throw new Error("Risk sizing needs fresh marks and supported exposure for the whole wallet");
        const feePerUnit = (entry + geometry.stop) * spec.taker * 1.18;
        const riskLots = Math.floor(Math.max(0, stats.equity) * (bot.riskPercent ?? 1) / 100 / ((geometry.distance + feePerUnit) * spec.lot));
        const contracts = bot.sizingMode === "risk" ? Math.min(riskLots, sizeToContracts(bot.notional, "USD", spec, entry)) : sizeToContracts(bot.notional, "USD", spec, entry);
        const reason = walletEntryReason(next, quotes, now, spec, entry, contracts, geometry.stop);
        if (reason) throw new Error(reason);

        if (!contracts) throw new Error("Trade size is below one contract lot");
        next = submitGlobalOrder(next, spec, quote, {
          type: "Market", side: signal.side, contracts, leverage: bot.leverage,
          protection: { source: "mark", stopLoss: { mode: "Market", trigger: geometry.stop }, takeProfit: bot.firstExitPercent || bot.secondExitPercent ? undefined : { mode: "Market", trigger: geometry.target } },
        }, now, quotes);
        next = { ...next, positions: next.positions.map(p => p.symbol === bot.symbol ? { ...p, botId: bot.symbol, botExit: initialBotExit(bot, geometry.stop, entry, contracts) } : p), events: next.events.map((e, i) => i === next.events.length - 1 ? { ...e, botId: bot.symbol, detail: `Bot · ${BOT_STRATEGIES[bot.strategy]} · ${e.detail}` } : e) };
        bot.lastEntryAt = now;
        bot.status = `${signal.side === "BUY" ? "Long" : "Short"} paper entry · ${contracts} lots`;
      }
    } catch (e) { bot.status = e instanceof Error ? e.message : "Bot evaluation failed"; }
    if (JSON.stringify(bot) !== JSON.stringify(original)) next = { ...next, revision: next.revision + 1, bots: next.bots!.map(b => b.symbol === bot.symbol ? bot : b) };
  }
  return next;
}
