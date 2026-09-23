import type { Candle } from "./market";

export const COMPARE_COLORS = ["#2962FF", "#FF6D00", "#089981", "#E91E63", "#9C27B0", "#00BCD4"] as const;
export const MAX_COMPARED_SYMBOLS = 6;
export const COMPARE_MODES = ["percent", "price", "pane"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];
export function isCompareMode(value: unknown): value is CompareMode {
  return typeof value === "string" && COMPARE_MODES.some((mode) => mode === value);
}
export function isCompareColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}
export const COMPARE_KEY_PATTERN = /^(NSE_EQ|NSE_INDEX|BSE_INDEX|DELTA|TVC)\|[\w .|&-]{1,80}$/;

export type ComparedSymbol = {
  instrumentKey: string;
  symbol: string;
  name: string;
  exchange: string;
  color?: string;
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
    next.push({ instrumentKey: row.instrumentKey, symbol, name: name || symbol, exchange: exchange || "NSE", ...(isCompareColor(row.color) ? { color: row.color } : {}) });
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

/** Percent change from the first candle in the visible window. Null bounds use the whole series. */
export function windowChangePercent(candles: Candle[], startTime: number | null, endTime: number | null) {
  const usable = candles.filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
  if (!usable.length) return null;
  let from = 0;
  let to = usable.length - 1;
  if (startTime !== null && Number.isFinite(startTime)) {
    const index = usable.findIndex((candle) => candle.time >= startTime);
    if (index >= 0) from = index;
  }
  if (endTime !== null && Number.isFinite(endTime)) {
    let index = -1;
    for (let i = from; i < usable.length; i++) {
      if (usable[i].time <= endTime) index = i;
      else break;
    }
    if (index >= from) to = index;
  }
  const base = usable[from]?.close;
  const last = usable[to]?.close;
  if (!(base > 0) || !Number.isFinite(last)) return null;
  return ((last / base) - 1) * 100;
}

export function compareQuote(candles: Candle[], atTime: number | null = null) {
  const usable = candles.filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
  if (!usable.length) return null;
  let index = usable.length - 1;
  if (atTime !== null && Number.isFinite(atTime)) {
    let found = -1;
    for (let i = 0; i < usable.length; i++) {
      if (usable[i].time <= atTime) found = i;
      else break;
    }
    if (found >= 0) index = found;
  }
  const price = usable[index].close;
  const previous = usable[index - 1]?.close;
  if (!(previous > 0)) return { price, delta: 0, percent: 0 };
  const delta = price - previous;
  return { price, delta, percent: (delta / previous) * 100 };
}

export function formatComparePrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCompareDelta(value: number) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  return `${safe > 0 ? "+" : ""}${safe.toFixed(2)}`;
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
