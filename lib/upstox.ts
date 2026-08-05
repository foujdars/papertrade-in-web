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

export function isSupportedNseInstrumentKey(key: string) {
  return ALLOWED_UPSTOX_KEYS.has(key) ||
    /^NSE_EQ\|INE[A-Z0-9]+$/.test(key) ||
    /^NSE_FO\|[A-Z0-9]+$/.test(key) ||
    /^NSE_INDEX\|[A-Za-z0-9 .&_-]+$/.test(key);
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
};
