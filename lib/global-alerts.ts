import { average, relativeStrength } from "./study-calculations.ts";
import {
  freshPerpQuote,
  isDeltaPerpSymbol,
  type PerpQuote,
  type PerpSymbol,
} from "./global-markets.ts";
import type { Candle } from "./market";
import { psbbAnalysis } from "./psbb.ts";
export const GLOBAL_DIVERGENCE_SYMBOLS = ["BTCUSD", "ETHUSD", "XAUTUSD"] as const;
export const GLOBAL_DIVERGENCE_FRAMES = { "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400 } as const;
export type GlobalDivergenceFrame = keyof typeof GLOBAL_DIVERGENCE_FRAMES;
export const GLOBAL_ALERT_KINDS = [
  "price-above",
  "price-below",
  "ema-cross-up",
  "ema-cross-down",
  "rsi-cross-up",
  "rsi-cross-down",
  "volume-spike",
  "psbb-divergence",
] as const;
export type GlobalAlert = {
  id: string;
  symbol: PerpSymbol;
  kind: (typeof GLOBAL_ALERT_KINDS)[number];
  value: number;
  length: number;
  timeframe?: GlobalDivergenceFrame;
  psbbInputs?: { length: number; left: number; oversold: number; overbought: number };
  createdAt: number;
  expiresAt: number;
  triggeredAt?: number;
  cancelled?: boolean;
};
export function globalAlertError(rule: GlobalAlert): string | null {
  if (
    !isDeltaPerpSymbol(rule.symbol) ||
    !GLOBAL_ALERT_KINDS.includes(rule.kind)
  )
    return "Unsupported alert.";
  if (rule.kind === "psbb-divergence" && (
    !GLOBAL_DIVERGENCE_SYMBOLS.some(symbol => symbol === rule.symbol) ||
    !rule.timeframe || !Object.hasOwn(GLOBAL_DIVERGENCE_FRAMES, rule.timeframe) ||
    !rule.psbbInputs || !Number.isInteger(rule.psbbInputs.length) || rule.psbbInputs.length < 2 || rule.psbbInputs.length > 200 ||
    !Number.isInteger(rule.psbbInputs.left) || rule.psbbInputs.left < 1 || rule.psbbInputs.left > 30 ||
    !(rule.psbbInputs.oversold >= 1 && rule.psbbInputs.oversold <= 50) ||
    !(rule.psbbInputs.overbought >= 50 && rule.psbbInputs.overbought <= 99)
  )) return "Choose BTC, ETH or gold, a supported timeframe and valid PSBB settings.";
  if (
    !Number.isFinite(rule.value) ||
    !Number.isSafeInteger(rule.length) ||
    rule.length < 2 ||
    rule.length > 200
  )
    return "Use a length between 2 and 200 and a valid threshold.";
  if (rule.kind.startsWith("price") && rule.value <= 0)
    return "Price must be positive.";
  if (rule.kind.startsWith("rsi") && (rule.value < 0 || rule.value > 100))
    return "RSI threshold must be between 0 and 100.";
  if (rule.kind === "volume-spike" && rule.value <= 1)
    return "Volume multiplier must exceed 1.";
  return null;
}
export function evaluateGlobalAlert(
  rule: GlobalAlert,
  quote: PerpQuote | undefined,
  candles: Candle[],
  now: number,
): boolean {
  if (
    globalAlertError(rule) ||
    rule.triggeredAt ||
    rule.cancelled ||
    now >= rule.expiresAt ||
    (rule.kind !== "psbb-divergence" && (!freshPerpQuote(quote, now) || quote.symbol !== rule.symbol || quote.at <= rule.createdAt))
  )
    return false;
  if (rule.kind === "psbb-divergence") {
    const seconds = GLOBAL_DIVERGENCE_FRAMES[rule.timeframe!];
    const bars = [...new Map(candles.filter(c => c && [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) && c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close))
      .filter(c => c.time * 1000 + seconds * 1000 + 5000 <= now).map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
    const last = bars.at(-1);
    if (!last || bars.length < Math.max(60, rule.psbbInputs!.length * 5) ||
      now - (last.time + seconds) * 1000 > 180000 ||
      (last.time + seconds) * 1000 <= rule.createdAt) return false;
    return psbbAnalysis(bars, rule.psbbInputs!, rule.timeframe, true).setups.some(setup => setup.confirmedTime === last.time);
  }
  if (!quote) return false;
  if (rule.kind === "price-above") return quote.last >= rule.value;
  if (rule.kind === "price-below") return quote.last <= rule.value;
  const bars = candles.filter((c) => c.time * 1000 + 300000 + 5000 <= now),
    last = bars.at(-1);
  if (
    !last ||
    last.time * 1000 + 300000 <= rule.createdAt ||
    now - (last.time * 1000 + 300000) > 360000 ||
    bars.length < rule.length + 2
  )
    return false;
  const tail = bars.slice(-(rule.length + 2));
  if (tail.some((c, i) => i > 0 && c.time - tail[i - 1].time !== 300))
    return false;
  const close = bars.map((c) => c.close),
    i = bars.length - 1;
  if (rule.kind === "volume-spike") {
    const base =
      bars.slice(i - rule.length, i).reduce((n, c) => n + c.volume, 0) /
      rule.length;
    return base > 0 && last.volume >= base * rule.value;
  }
  if (rule.kind.startsWith("rsi")) {
    const rsi = relativeStrength(close, rule.length);
    return rule.kind === "rsi-cross-up"
      ? rsi[i - 1] < rule.value && rsi[i] >= rule.value
      : rsi[i - 1] > rule.value && rsi[i] <= rule.value;
  }
  const ema = average(close, rule.length, "EMA");
  return rule.kind === "ema-cross-up"
    ? close[i - 1] <= ema[i - 1] && close[i] > ema[i]
    : close[i - 1] >= ema[i - 1] && close[i] < ema[i];
}
