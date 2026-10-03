import type { Candle } from "./market.ts";
import { closePerp, freshPerpQuote, type PerpAccount, type PerpQuote, type PerpPosition } from "./global-markets.ts";
import { roundGlobalPrice } from "./global-order-engine.ts";
import type { BotConfig } from "./paper-bot-state.ts";
export type BotExitState = { timeframe: BotConfig["timeframe"]; initialStop: number; initialContracts: number; firstTaken: boolean; secondTaken: boolean; best: number; breakEvenR: number; trailAtr: number; firstPercent: number; secondPercent: number; firstR: number; secondR: number; atrPeriod: number };
export function averageTrueRange(rows: Candle[], period = 14) {
  if (rows.length < period + 1) return null;
  const tail = rows.slice(-period - 1), ranges = tail.slice(1).map((c, i) => Math.max(c.high - c.low, Math.abs(c.high - tail[i].close), Math.abs(c.low - tail[i].close)));
  if (ranges.some(r => !Number.isFinite(r) || r < 0)) return null;
  const value = ranges.reduce((a, b) => a + b, 0) / period; return value > 0 ? value : null;
}
export function entryGeometry(config: BotConfig, rows: Candle[], price: number, spec: PerpPosition["spec"], side: "BUY" | "SELL") {
  const sign = side === "BUY" ? 1 : -1, atr = averageTrueRange(rows, config.atrPeriod ?? 14);
  const distance = config.stopMode === "atr" ? (atr ?? 0) * (config.atrMultiplier ?? 2) : price * config.stopPercent / 100;
  if (!(distance > 0)) throw new Error("Waiting for valid ATR history");
  const stop = roundGlobalPrice(price - sign * distance, spec), target = roundGlobalPrice(price * (1 + sign * config.targetPercent / 100), spec);
  if (stop <= 0 || (price - stop) * sign <= 0 || (target - price) * sign <= 0) throw new Error("Protection distance is below one price tick");
  return { stop, target, distance: Math.abs(price - stop) };
}
export function initialBotExit(c: BotConfig, stop: number, price: number, contracts: number): BotExitState | undefined {
  if (!c.breakEvenR && !c.trailAtr && !c.firstExitPercent && !c.secondExitPercent) return undefined;
  return { timeframe: c.timeframe, initialStop: stop, initialContracts: contracts, best: price, firstTaken: false, secondTaken: false, breakEvenR: c.breakEvenR ?? 0, trailAtr: c.trailAtr ?? 0, firstPercent: c.firstExitPercent ?? 0, secondPercent: c.secondExitPercent ?? 0, firstR: c.firstExitR ?? 1.5, secondR: c.secondExitR ?? 3, atrPeriod: c.atrPeriod ?? 14 };
}
export function manageBotProtection(a: PerpAccount, quotes: Partial<Record<string, PerpQuote>>, histories: Record<string, Candle[] | undefined>, now: number): PerpAccount {
  let next = a;
  for (const original of a.positions) {
    const q = quotes[original.symbol], saved = original.botExit;
    if (!original.botId || !saved || !freshPerpQuote(q, now) || q.at < original.openedAt) continue;
    let p = next.positions.find(p => p.symbol === original.symbol)!;
    if (p.protection?.activeExit) continue;
    const state = { ...saved }, sign = p.side === "BUY" ? 1 : -1, risk = Math.abs(p.entry - state.initialStop);
    if (!(risk > 0)) continue;
    // Profit-taking uses executable bid/ask; a mark-price touch is not a fill.
    const price = p.side === "BUY" ? q.bid : q.ask, profitR = (price - p.entry) * sign / risk;
    for (const [tier, threshold, percent] of [["firstTaken", state.firstR, state.firstPercent], ["secondTaken", state.secondR, state.secondPercent]] as const) {
      if (state[tier] || percent === 0 || profitR < threshold) continue;
      const qty = Math.min(p.contracts - 1, Math.floor(state.initialContracts * percent / 100));
      if (qty < 1) { state[tier] = true; continue; }
      try { next = closePerp(next, p.symbol, q, qty, now, "CLOSE", `Bot · ${tier === "firstTaken" ? "first" : "second"} partial target`); state[tier] = true; p = next.positions.find(v => v.symbol === p.symbol)!; } catch { /* Keep the tier pending if observed liquidity cannot fill it. */ }
    }
    state.best = p.side === "BUY" ? Math.max(state.best, q.mark) : Math.min(state.best, q.mark);
    let stop = p.protection?.stopLoss?.trigger ?? state.initialStop;
    const tighten = (candidate: number) => { stop = p.side === "BUY" ? Math.max(stop, candidate) : Math.min(stop, candidate); };
    if (state.breakEvenR > 0 && profitR >= state.breakEvenR) {
      const feePerUnit = (p.entry + price) * p.spec.taker * 1.18;
      tighten(p.entry + sign * feePerUnit);
    }
    const atr = averageTrueRange(histories[p.symbol] ?? [], state.atrPeriod);
    if (state.trailAtr > 0 && atr && profitR >= 1) tighten(state.best - sign * atr * state.trailAtr);
    stop = roundGlobalPrice(stop, p.spec);
    // A newly tightened stop cannot be placed beyond the current mark.
    if ((q.mark - stop) * sign <= 0) stop = p.protection?.stopLoss?.trigger ?? state.initialStop;
    const protection = { ...p.protection!, stopLoss: { ...p.protection!.stopLoss!, trigger: stop } };
    if (JSON.stringify(state) !== JSON.stringify(saved) || stop !== p.protection?.stopLoss?.trigger) next = { ...next, revision: next.revision + 1, positions: next.positions.map(v => v.symbol === p.symbol ? { ...v, botExit: state, protection } : v) };
  }
  return next;
}
