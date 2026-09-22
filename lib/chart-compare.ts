import type { Candle } from "./market";

export const COMPARE_COLORS = ["#2962FF", "#FF6D00", "#089981", "#E91E63", "#9C27B0", "#00BCD4"] as const;
export const MAX_COMPARED_SYMBOLS = 6;
export const COMPARE_KEY_PATTERN = /^(NSE_EQ|NSE_INDEX|BSE_INDEX|DELTA|TVC)\|[\w .|&-]{1,80}$/;

export type ComparedSymbol = {
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: string;
};

export function isComparedKey(value: unknown): value is string {
  return typeof value === "string" && COMPARE_KEY_PATTERN.test(value);
}

export function sanitizeComparedSymbols(value: unknown): ComparedSymbol[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: ComparedSymbol[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ComparedSymbol>;
    if (!isComparedKey(row.instrumentKey)) continue;
    if (seen.has(row.instrumentKey)) continue;
    const symbol = typeof row.symbol === "string" && /^[A-Z0-9._-]{1,32}$/i.test(row.symbol) ? row.symbol.toUpperCase() : "";
    if (!symbol) continue;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 80) : symbol;
    const exchange = typeof row.exchange === "string" ? row.exchange.trim().slice(0, 16) : "";
    seen.add(row.instrumentKey);
    next.push({ instrumentKey: row.instrumentKey, symbol, name: name || symbol, exchange: exchange || "NSE" });
    if (next.length >= MAX_COMPARED_SYMBOLS) break;
  }
  return next;
}

export function compareChangePercent(candles: Candle[]) {
  const first = candles.find((candle) => Number.isFinite(candle.close) && candle.close > 0);
  const last = [...candles].reverse().find((candle) => Number.isFinite(candle.close) && candle.close > 0);
  if (!first || !last) return null;
  return ((last.close / first.close) - 1) * 100;
}

export function comparisonRequest(instrumentKey: string, timeframe: string) {
  if (instrumentKey.startsWith("DELTA|")) {
    return `/api/global-markets?${new URLSearchParams({ symbol: instrumentKey.slice(6), mode: "candles", timeframe })}`;
  }
  if (instrumentKey.startsWith("TVC|")) {
    const mapped = instrumentKey.slice(4) === "UKOIL" ? "BRENT" : instrumentKey.slice(4);
    return `/api/global-markets?${new URLSearchParams({ symbol: mapped, mode: "candles", timeframe })}`;
  }
  return `/api/upstox/candles?${new URLSearchParams({ instrumentKey, timeframe })}`;
}

export function compareColor(index: number) {
  return COMPARE_COLORS[index % COMPARE_COLORS.length];
}

export const COMPARE_SUGGESTIONS = ["NIFTY", "BANKNIFTY", "SENSEX", "SPYXUSD", "QQQXUSD", "BTCUSD", "ETHUSD", "XAUTUSD"];
