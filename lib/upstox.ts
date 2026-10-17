export const UPSTOX_INSTRUMENT_KEYS = {
  RELIANCE: "NSE_EQ|INE002A01018",
  HDFCBANK: "NSE_EQ|INE040A01034",
  ICICIBANK: "NSE_EQ|INE090A01021",
  INFY: "NSE_EQ|INE009A01021",
  TCS: "NSE_EQ|INE467B01029",
  BHARTIARTL: "NSE_EQ|INE397D01024",
  SBIN: "NSE_EQ|INE062A01020",
  AXISBANK: "NSE_EQ|INE238A01034",
  KOTAKBANK: "NSE_EQ|INE237A01028",
  LT: "NSE_EQ|INE018A01030",
  ITC: "NSE_EQ|INE154A01025",
  MARUTI: "NSE_EQ|INE585B01010",
  SUNPHARMA: "NSE_EQ|INE044A01036",
  TITAN: "NSE_EQ|INE280A01028",
  TATAMOTORS: "NSE_EQ|INE155A01022",
  ZOMATO: "NSE_EQ|INE758T01015",
  DMART: "NSE_EQ|INE192R01011",
  TRENT: "NSE_EQ|INE849A01020",
  IRCTC: "NSE_EQ|INE335Y01020",
  HAL: "NSE_EQ|INE066F01020",
} as const;

export type UpstoxSymbol = keyof typeof UPSTOX_INSTRUMENT_KEYS;

export const UPSTOX_KEY_TO_SYMBOL = Object.fromEntries(
  Object.entries(UPSTOX_INSTRUMENT_KEYS).map(([symbol, key]) => [key, symbol]),
) as Record<string, UpstoxSymbol>;

export const ALLOWED_UPSTOX_KEYS = new Set<string>(Object.values(UPSTOX_INSTRUMENT_KEYS));

// GIFT is available through Upstox market-data APIs, outside the Indian trading universe.
export function isSupportedChartInstrumentKey(key: string) {
  return key === 'GLOBAL_INDEX|SGX NIFTY' || isSupportedNseInstrumentKey(key);
}

export function isSupportedNseInstrumentKey(key: string) {
  return ALLOWED_UPSTOX_KEYS.has(key) ||
    /^(?:NSE_EQ|BSE_EQ)\|INE[A-Z0-9]+$/.test(key) ||
    /^(?:NSE_FO|MCX_FO)\|[A-Z0-9]+$/.test(key) ||
    /^(?:NSE_INDEX|BSE_INDEX)\|[A-Za-z0-9 .&_-]+$/.test(key);
}

export type NormalizedQuote = {
  instrumentKey: string;
  symbol: string;
  lastPrice: number;
  netChange: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  lastTradeAt: string;
  updatedAt: string;
  volume?: number;
  changeAvailable?: boolean;
  /** Provider observation associated with the daily comparison close. */
  previousCloseAt?: string;
};

export function derivePreviousClose(lastPrice: number, netChange: number, fallbackClose: number) {
  const derivedClose = lastPrice - netChange;
  if (Number.isFinite(derivedClose) && derivedClose > 0) return derivedClose;
  if (Number.isFinite(fallbackClose) && fallbackClose > 0) return fallbackClose;
  return lastPrice;
}

export type UpstoxQuote = {
  instrument_token?: string;
  symbol?: string;
  last_price?: number | string | null;
  net_change?: number | string | null;
  timestamp?: string | number | null;
  last_trade_time?: string | number | null;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  volume?: number;
};

function finiteNumber(value: unknown) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return Number.NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

/** Provider dates can be ISO strings, epoch seconds, milliseconds or microseconds. */
export function marketTimestamp(value: unknown): string {
  const numeric = finiteNumber(value);
  const milliseconds = Number.isFinite(numeric)
    ? numeric < 10_000_000_000 ? numeric * 1000 : numeric > 10_000_000_000_000 ? Math.floor(numeric / 1000) : numeric
    : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 8.64e15) return "";
  return new Date(milliseconds).toISOString();
}

/** Full quote net_change is an absolute price change, not a percentage. */
export function normalizeUpstoxQuote(raw: UpstoxQuote, fallbackInstrumentKey = ""): NormalizedQuote | null {
  const instrumentKey = raw.instrument_token?.trim() || fallbackInstrumentKey;
  const lastPrice = finiteNumber(raw.last_price);
  if (!instrumentKey || !Number.isFinite(lastPrice) || lastPrice <= 0) return null;
  const reportedChange = finiteNumber(raw.net_change);
  const derived = lastPrice - reportedChange;
  const fallback = finiteNumber(raw.ohlc?.close);
  const previousClose = Number.isFinite(derived) && derived > 0 ? derived : fallback > 0 ? fallback : 0;
  const netChange = previousClose > 0 ? lastPrice - previousClose : 0;
  const updatedAt = marketTimestamp(raw.timestamp);
  const lastTradeAt = marketTimestamp(raw.last_trade_time) || updatedAt;
  return {
    instrumentKey,
    symbol: raw.symbol?.trim().toUpperCase() || UPSTOX_KEY_TO_SYMBOL[instrumentKey] || instrumentKey,
    lastPrice, netChange,
    changePercent: previousClose > 0 ? netChange / previousClose * 100 : 0,
    changeAvailable: previousClose > 0,
    previousClose,
    previousCloseAt: updatedAt || lastTradeAt,
    open: finiteNumber(raw.ohlc?.open) > 0 ? Number(raw.ohlc?.open) : lastPrice,
    high: finiteNumber(raw.ohlc?.high) > 0 ? Number(raw.ohlc?.high) : lastPrice,
    low: finiteNumber(raw.ohlc?.low) > 0 ? Number(raw.ohlc?.low) : lastPrice,
    lastTradeAt,
    // A fetch receipt is not a market-data timestamp. Missing dates stay missing.
    updatedAt,
    volume: finiteNumber(raw.volume) > 0 ? Number(raw.volume) : 0,
  };
}

function indiaDate(value: string | undefined) {
  const at = Date.parse(value ?? "");
  return Number.isFinite(at) ? new Date(at + 330 * 60_000).toISOString().slice(0, 10) : "";
}

function knownChange(quote: NormalizedQuote | undefined) {
  return Boolean(quote && quote.changeAvailable !== false && Number.isFinite(quote.previousClose) && quote.previousClose > 0);
}

function withComparison(quote: NormalizedQuote, previousClose: number, previousCloseAt: string): NormalizedQuote {
  const changeAvailable = Number.isFinite(previousClose) && previousClose > 0;
  const netChange = changeAvailable ? quote.lastPrice - previousClose : 0;
  return { ...quote, previousClose: changeAvailable ? previousClose : 0, previousCloseAt, changeAvailable, netChange,
    changePercent: changeAvailable ? netChange / previousClose * 100 : 0 };
}

/** Reconcile REST context without rolling back a newer streaming price. */
export function mergeNormalizedQuote(previous: NormalizedQuote | undefined, incoming: NormalizedQuote): NormalizedQuote {
  if (!previous || previous.instrumentKey !== incoming.instrumentKey) return incoming;
  const previousTime = Date.parse(previous.lastTradeAt);
  const incomingTime = Date.parse(incoming.lastTradeAt);
  const previousObserved = Date.parse(previous.updatedAt || previous.lastTradeAt);
  const incomingObserved = Date.parse(incoming.updatedAt || incoming.lastTradeAt);
  const incomingOlder = Number.isFinite(previousTime) && (!Number.isFinite(incomingTime) || incomingTime < previousTime
    || (incomingTime === previousTime && Number.isFinite(previousObserved) && (!Number.isFinite(incomingObserved) || incomingObserved < previousObserved)));
  if (!incomingOlder) {
    if (!knownChange(incoming) && knownChange(previous)
      && indiaDate(incoming.updatedAt || incoming.lastTradeAt) === indiaDate(previous.previousCloseAt || previous.updatedAt || previous.lastTradeAt)) {
      return withComparison(incoming, previous.previousClose, previous.previousCloseAt || previous.updatedAt || previous.lastTradeAt);
    }
    return incoming;
  }
  const incomingContext = incoming.previousCloseAt || incoming.updatedAt || incoming.lastTradeAt;
  const previousContext = previous.previousCloseAt || previous.updatedAt || previous.lastTradeAt;
  // A REST response may carry the new session's close even if the stream has
  // already advanced the price. Previous-session snapshots cannot change it.
  if (knownChange(incoming) && indiaDate(incomingContext)
    && indiaDate(incomingContext) === indiaDate(previous.updatedAt || previous.lastTradeAt)
    && (!knownChange(previous) || Date.parse(incomingContext) >= Date.parse(previousContext))) {
    return withComparison(previous, incoming.previousClose, incomingContext);
  }
  return previous;
}

export type QuoteTick = { price: number; timestampMs: number; previousClose?: number; updatedAtMs?: number };

/** Stream CP is authoritative; catalogue prices must never become a daily close. */
export function applyQuoteTick(previous: NormalizedQuote | undefined, instrumentKey: string, symbol: string, tick: QuoteTick): NormalizedQuote | undefined {
  if (!Number.isFinite(tick.price) || tick.price <= 0) return previous;
  const lastTradeAt = marketTimestamp(tick.timestampMs);
  if (!lastTradeAt) return previous;
  const updatedAt = marketTimestamp(tick.updatedAtMs) || lastTradeAt;
  if (previous?.instrumentKey !== instrumentKey) previous = undefined;
  if (previous && (Date.parse(previous.lastTradeAt) > Date.parse(lastTradeAt)
    || (Date.parse(previous.lastTradeAt) === Date.parse(lastTradeAt) && Date.parse(previous.updatedAt) > Date.parse(updatedAt)))) return previous;
  const context = previous?.previousCloseAt || previous?.updatedAt || previous?.lastTradeAt;
  const sameSession = Boolean(previous && indiaDate(updatedAt) === indiaDate(previous.updatedAt || previous.lastTradeAt));
  const suppliedClose = Number.isFinite(tick.previousClose) && tick.previousClose! > 0;
  const canReuseClose = knownChange(previous) && indiaDate(updatedAt) === indiaDate(context);
  const previousClose = suppliedClose ? tick.previousClose! : canReuseClose ? previous!.previousClose : 0;
  const previousCloseAt = suppliedClose ? updatedAt : canReuseClose ? context! : "";
  return withComparison({
    instrumentKey, symbol, lastPrice: tick.price,
    netChange: 0, changePercent: 0, previousClose: 0,
    open: sameSession ? previous!.open : tick.price,
    high: sameSession ? Math.max(previous!.high, tick.price) : tick.price,
    low: sameSession ? Math.min(previous!.low, tick.price) : tick.price,
    ...(sameSession && previous?.volume !== undefined ? { volume: previous.volume } : {}),
    lastTradeAt, updatedAt,
  }, previousClose, previousCloseAt);
}

/** Receiving an old quote again must not make it executable or label it live. */
export function isNormalizedQuoteFresh(quote: NormalizedQuote | undefined, receivedAt: number | undefined, now: number, maxAgeMs = 45_000) {
  const observedAt = Date.parse(quote?.updatedAt || quote?.lastTradeAt || "");
  return Boolean(quote && Number.isFinite(quote.lastPrice) && quote.lastPrice > 0 && Number.isFinite(receivedAt)
    && receivedAt! <= now + 5_000 && now - receivedAt! <= maxAgeMs
    && Number.isFinite(observedAt) && observedAt <= now + 5_000 && now - observedAt <= maxAgeMs);
}
