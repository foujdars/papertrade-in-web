import type { PaperOrder } from "./paper-trading.ts";
import type { ClosedPaperTrade } from "./trade-analytics.ts";

export type TradeJournalEntry = {
  tradeId: string;
  strategy: string;
  thesis: string;
  confidence: number;
  review: string;
  followedPlan: boolean | null;
  updatedAt: number;
};

export type TradingLimits = {
  enabled: boolean;
  dailyLossLimit: number;
  maxTradesPerDay: number;
  cooldownAfterLosses: number;
  cooldownMinutes: number;
};

export type OptionPayoffLeg = {
  optionType: "CE" | "PE";
  side: "BUY" | "SELL";
  strike: number;
  premium: number;
  quantity: number;
};

export const DEFAULT_TRADING_LIMITS: TradingLimits = {
  enabled: false,
  dailyLossLimit: 5_000,
  maxTradesPerDay: 10,
  cooldownAfterLosses: 3,
  cooldownMinutes: 30,
};

const JOURNAL_KEY = "papertrade-journal-v1";
const LIMITS_KEY = "papertrade-limits-v1";

export function readTradeJournal(): Record<string, TradeJournalEntry> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(JOURNAL_KEY) ?? "{}") as Record<string, TradeJournalEntry>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function writeTradeJournal(entries: Record<string, TradeJournalEntry>) {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

export function readTradingLimits(): TradingLimits {
  if (typeof window === "undefined") return DEFAULT_TRADING_LIMITS;
  try {
    const saved = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? "{}") as Partial<TradingLimits>;
    return { ...DEFAULT_TRADING_LIMITS, ...saved };
  } catch {
    return DEFAULT_TRADING_LIMITS;
  }
}

export function writeTradingLimits(limits: TradingLimits) {
  localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
}

export function calculateRiskBasedQuantity(entryPrice: number, stopLossPrice: number, maxRisk: number, lotSize = 1) {
  const distance = Math.abs(entryPrice - stopLossPrice);
  if (![entryPrice, stopLossPrice, maxRisk, lotSize].every(Number.isFinite) || distance <= 0 || maxRisk <= 0 || lotSize <= 0) return 0;
  const rawQuantity = Math.floor(maxRisk / distance);
  return Math.floor(rawQuantity / lotSize) * lotSize;
}

function indiaDay(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(timestamp));
}

export function evaluateTradingLimits(
  orders: PaperOrder[],
  trades: ClosedPaperTrade[],
  limits: TradingLimits,
  now = Date.now(),
) {
  const today = indiaDay(now);
  const todayOrders = orders.filter((order) => indiaDay(order.createdAt ?? (Number(order.id) || 0)) === today);
  const todayTrades = trades.filter((trade) => indiaDay(trade.closedAt) === today);
  const todayPnl = todayTrades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const chronological = [...trades].sort((a, b) => b.closedAt - a.closedAt);
  let consecutiveLosses = 0;
  for (const trade of chronological) {
    if (trade.netPnl >= 0) break;
    consecutiveLosses += 1;
  }
  const lastLossAt = chronological[0]?.netPnl < 0 ? chronological[0].closedAt : 0;
  const cooldownUntil = limits.cooldownAfterLosses > 0 && consecutiveLosses >= limits.cooldownAfterLosses
    ? lastLossAt + limits.cooldownMinutes * 60_000
    : 0;
  const reasons: string[] = [];
  if (limits.enabled && limits.dailyLossLimit > 0 && todayPnl <= -limits.dailyLossLimit) reasons.push(`Daily loss limit of ₹${limits.dailyLossLimit.toLocaleString("en-IN")} reached`);
  const todayTradeCount = Math.max(todayTrades.length, Math.ceil(todayOrders.length / 2));
  if (limits.enabled && limits.maxTradesPerDay > 0 && todayTradeCount >= limits.maxTradesPerDay) reasons.push(`Daily limit of ${limits.maxTradesPerDay} trades reached`);
  if (limits.enabled && cooldownUntil > now) reasons.push(`Cooldown active for ${Math.ceil((cooldownUntil - now) / 60_000)} more minute${Math.ceil((cooldownUntil - now) / 60_000) === 1 ? "" : "s"}`);
  return { blocked: reasons.length > 0, reasons, todayPnl, todayTradeCount, todayExecutions: todayOrders.length, consecutiveLosses, cooldownUntil };
}

export function optionPayoffAtExpiry(legs: OptionPayoffLeg[], underlyingPrice: number) {
  return legs.reduce((total, leg) => {
    const intrinsic = leg.optionType === "CE"
      ? Math.max(0, underlyingPrice - leg.strike)
      : Math.max(0, leg.strike - underlyingPrice);
    const perUnit = intrinsic - leg.premium;
    return total + perUnit * leg.quantity * (leg.side === "BUY" ? 1 : -1);
  }, 0);
}

export function buildOptionPayoff(legs: OptionPayoffLeg[], spot: number) {
  if (!legs.length || !Number.isFinite(spot) || spot <= 0) return { points: [] as Array<{ price: number; pnl: number }>, breakevens: [] as number[], maxProfit: 0, maxLoss: 0, unboundedProfit: false, unboundedLoss: false };
  const strikes = legs.map((leg) => leg.strike);
  const low = legs.some((leg) => leg.optionType === "PE") ? 0 : Math.max(0, Math.min(spot * .65, ...strikes.map((strike) => strike * .75)));
  const high = Math.max(spot * 1.35, ...strikes.map((strike) => strike * 1.25));
  const points = Array.from({ length: 81 }, (_, index) => {
    const price = low + (high - low) * index / 80;
    return { price, pnl: optionPayoffAtExpiry(legs, price) };
  });
  const breakevens: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if ((previous.pnl <= 0 && current.pnl >= 0) || (previous.pnl >= 0 && current.pnl <= 0)) {
      const span = current.pnl - previous.pnl;
      const ratio = span === 0 ? 0 : -previous.pnl / span;
      const value = previous.price + (current.price - previous.price) * ratio;
      if (!breakevens.some((item) => Math.abs(item - value) < 1)) breakevens.push(value);
    }
  }
  const rightSlope = points.at(-1)!.pnl - points.at(-2)!.pnl;
  return {
    points,
    breakevens,
    maxProfit: Math.max(...points.map((point) => point.pnl)),
    maxLoss: Math.min(...points.map((point) => point.pnl)),
    unboundedProfit: rightSlope > .001,
    unboundedLoss: rightSlope < -.001,
  };
}
