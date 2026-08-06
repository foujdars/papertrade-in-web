import { UPSTOX_INSTRUMENT_KEYS } from "@/lib/upstox";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Instrument = {
  symbol: string;
  name: string;
  exchange: "NSE";
  price: number;
  change: number;
  instrumentKey: string;
  categories: Array<"NIFTY 50" | "BANK NIFTY" | "NIFTY 500">;
  assetType?: "EQUITY" | "INDEX" | "OPTION" | "FUTURE";
  optionType?: "CE" | "PE";
  strikePrice?: number;
  expiry?: string;
  lotSize?: number;
  underlyingKey?: string;
  underlyingSymbol?: string;
};

export const instruments: Instrument[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", price: 2987.4, change: 1.28, instrumentKey: UPSTOX_INSTRUMENT_KEYS.RELIANCE, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "HDFCBANK", name: "HDFC Bank", exchange: "NSE", price: 1986.65, change: 0.64, instrumentKey: UPSTOX_INSTRUMENT_KEYS.HDFCBANK, categories: ["NIFTY 50", "BANK NIFTY", "NIFTY 500"] },
  { symbol: "ICICIBANK", name: "ICICI Bank", exchange: "NSE", price: 1461.2, change: -0.31, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ICICIBANK, categories: ["NIFTY 50", "BANK NIFTY", "NIFTY 500"] },
  { symbol: "INFY", name: "Infosys", exchange: "NSE", price: 1644.8, change: 1.92, instrumentKey: UPSTOX_INSTRUMENT_KEYS.INFY, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", price: 3318.5, change: -0.42, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TCS, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", exchange: "NSE", price: 2094.9, change: 1.05, instrumentKey: UPSTOX_INSTRUMENT_KEYS.BHARTIARTL, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", price: 854.35, change: 0.83, instrumentKey: UPSTOX_INSTRUMENT_KEYS.SBIN, categories: ["NIFTY 50", "BANK NIFTY", "NIFTY 500"] },
  { symbol: "AXISBANK", name: "Axis Bank", exchange: "NSE", price: 1198.6, change: -0.72, instrumentKey: UPSTOX_INSTRUMENT_KEYS.AXISBANK, categories: ["NIFTY 50", "BANK NIFTY", "NIFTY 500"] },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", exchange: "NSE", price: 2188.1, change: 0.22, instrumentKey: UPSTOX_INSTRUMENT_KEYS.KOTAKBANK, categories: ["NIFTY 50", "BANK NIFTY", "NIFTY 500"] },
  { symbol: "LT", name: "Larsen & Toubro", exchange: "NSE", price: 3642.8, change: 1.16, instrumentKey: UPSTOX_INSTRUMENT_KEYS.LT, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "ITC", name: "ITC", exchange: "NSE", price: 421.5, change: -0.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ITC, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "MARUTI", name: "Maruti Suzuki India", exchange: "NSE", price: 12694.0, change: 0.51, instrumentKey: UPSTOX_INSTRUMENT_KEYS.MARUTI, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", exchange: "NSE", price: 1694.25, change: 1.34, instrumentKey: UPSTOX_INSTRUMENT_KEYS.SUNPHARMA, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "TITAN", name: "Titan Company", exchange: "NSE", price: 3528.7, change: -0.56, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TITAN, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "TATAMOTORS", name: "Tata Motors", exchange: "NSE", price: 688.4, change: 2.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TATAMOTORS, categories: ["NIFTY 500"] },
  { symbol: "ZOMATO", name: "Eternal", exchange: "NSE", price: 312.65, change: 2.72, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ZOMATO, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "DMART", name: "Avenue Supermarts", exchange: "NSE", price: 4287.0, change: -1.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.DMART, categories: ["NIFTY 500"] },
  { symbol: "TRENT", name: "Trent", exchange: "NSE", price: 5486.3, change: 1.41, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TRENT, categories: ["NIFTY 50", "NIFTY 500"] },
  { symbol: "IRCTC", name: "Indian Railway Catering", exchange: "NSE", price: 768.85, change: -0.93, instrumentKey: UPSTOX_INSTRUMENT_KEYS.IRCTC, categories: ["NIFTY 500"] },
  { symbol: "HAL", name: "Hindustan Aeronautics", exchange: "NSE", price: 4864.15, change: 0.88, instrumentKey: UPSTOX_INSTRUMENT_KEYS.HAL, categories: ["NIFTY 500"] },
];

export function mergeInstrumentUniverse(incoming: Instrument[]) {
  const fallbackBySymbol = new Map(instruments.map((item) => [item.symbol, item]));
  const merged = incoming.map((item) => {
    const fallback = fallbackBySymbol.get(item.symbol);
    return {
      ...item,
      name: item.name || fallback?.name || item.symbol,
      price: fallback?.price ?? item.price,
      change: fallback?.change ?? item.change,
    };
  });
  const known = new Set(merged.map((item) => item.symbol));
  return [...merged, ...instruments.filter((item) => !known.has(item.symbol))];
}

export const timeframes: Record<string, number> = {
  "1m": 60,
  "2m": 120,
  "3m": 180,
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "2H": 7200,
  "3H": 10800,
  "4H": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
  "1Y": 31536000,
};

function hash(value: string) {
  return value.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function generateCandles(
  instrument: Instrument,
  timeframe: string,
  count = 180,
): Candle[] {
  const interval = timeframes[timeframe] ?? 300;
  const end = Math.floor(Date.now() / 1000 / interval) * interval;
  const referencePrice = Number.isFinite(instrument.price) && instrument.price > 0 ? instrument.price : 100;
  let seed = hash(instrument.symbol) + interval;
  let close = referencePrice * 0.92;
  const data: Candle[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const noise = seed / 233280 - 0.5;
    const drift = (referencePrice - close) * 0.014;
    const open = close;
    close = Math.max(1, open + drift + noise * referencePrice * 0.008);
    const spread = Math.abs(noise) * referencePrice * 0.004 + referencePrice * 0.0016;
    data.push({
      time: end - index * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread * 0.84,
      close,
      volume: Math.round(20_000 + Math.abs(noise) * 180_000 + (count - index) * 110),
    });
  }

  const scale = referencePrice / data[data.length - 1].close;
  return data.map((candle) => ({
    ...candle,
    open: candle.open * scale,
    high: candle.high * scale,
    low: candle.low * scale,
    close: candle.close * scale,
  }));
}

export function ema(data: Candle[], period: number) {
  const multiplier = 2 / (period + 1);
  let current = data[0]?.close ?? 0;
  return data.map((candle) => {
    current = (candle.close - current) * multiplier + current;
    return { time: candle.time, value: current };
  });
}

export function sma(data: Candle[], period: number) {
  let total = 0;
  return data.map((candle, index) => {
    total += candle.close;
    if (index >= period) total -= data[index - period].close;
    return { time: candle.time, value: total / Math.min(index + 1, period) };
  });
}

export function bollingerBands(data: Candle[], period = 20, deviation = 2) {
  return data.map((candle, index) => {
    const start = Math.max(0, index - period + 1);
    const window = data.slice(start, index + 1).map((item) => item.close);
    const middle = window.reduce((sum, value) => sum + value, 0) / window.length;
    const variance = window.reduce((sum, value) => sum + (value - middle) ** 2, 0) / window.length;
    const width = Math.sqrt(variance) * deviation;
    return { time: candle.time, upper: middle + width, middle, lower: middle - width };
  });
}

export function vwap(data: Candle[]) {
  let session = "";
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  return data.map((candle) => {
    const nextSession = new Date((candle.time + 19_800) * 1_000).toISOString().slice(0, 10);
    if (nextSession !== session) {
      session = nextSession;
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
    }
    const volume = Math.max(0, Number(candle.volume) || 0);
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * volume;
    cumulativeVolume += volume;
    return { time: candle.time, value: cumulativeVolume ? cumulativePriceVolume / cumulativeVolume : typicalPrice };
  });
}

export function macd(data: Candle[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastValues = ema(data, fast);
  const slowValues = ema(data, slow);
  const macdValues = data.map((candle, index) => ({ ...candle, close: fastValues[index].value - slowValues[index].value }));
  const signalValues = ema(macdValues, signalPeriod);
  return data.map((candle, index) => ({
    time: candle.time,
    macd: macdValues[index].close,
    signal: signalValues[index].value,
    histogram: macdValues[index].close - signalValues[index].value,
  }));
}

export function atr(data: Candle[], period = 14) {
  let current = 0;
  return data.map((candle, index) => {
    const previousClose = data[index - 1]?.close ?? candle.close;
    const trueRange = Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
    current = index === 0 ? trueRange : index < period ? (current * index + trueRange) / (index + 1) : (current * (period - 1) + trueRange) / period;
    return { time: candle.time, value: current };
  });
}

export function supertrend(data: Candle[], period = 10, multiplier = 3) {
  const atrValues = atr(data, period);
  let finalUpper = 0;
  let finalLower = 0;
  let direction: "up" | "down" = "up";
  return data.map((candle, index) => {
    const middle = (candle.high + candle.low) / 2;
    const basicUpper = middle + multiplier * atrValues[index].value;
    const basicLower = middle - multiplier * atrValues[index].value;
    const previous = data[index - 1];
    finalUpper = index === 0 || basicUpper < finalUpper || (previous?.close ?? candle.close) > finalUpper ? basicUpper : finalUpper;
    finalLower = index === 0 || basicLower > finalLower || (previous?.close ?? candle.close) < finalLower ? basicLower : finalLower;
    if (index > 0) {
      if (direction === "down" && candle.close > finalUpper) direction = "up";
      else if (direction === "up" && candle.close < finalLower) direction = "down";
    }
    return { time: candle.time, value: direction === "up" ? finalLower : finalUpper, direction };
  });
}

export type PivotLevel = "r3" | "r2" | "r1" | "pivot" | "s1" | "s2" | "s3";

export function classicPivotPoints(data: Candle[]) {
  const sessionKey = (time: number) => new Date((time + 19_800) * 1_000).toISOString().slice(0, 10);
  const sessions: Array<{ key: string; high: number; low: number; close: number }> = [];
  for (const candle of data) {
    const key = sessionKey(candle.time);
    const current = sessions.at(-1);
    if (!current || current.key !== key) sessions.push({ key, high: candle.high, low: candle.low, close: candle.close });
    else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
    }
  }
  const levels = new Map<string, Record<PivotLevel, number>>();
  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1];
    const pivot = (previous.high + previous.low + previous.close) / 3;
    const range = previous.high - previous.low;
    levels.set(sessions[index].key, {
      pivot,
      r1: 2 * pivot - previous.low,
      s1: 2 * pivot - previous.high,
      r2: pivot + range,
      s2: pivot - range,
      r3: previous.high + 2 * (pivot - previous.low),
      s3: previous.low - 2 * (previous.high - pivot),
    });
  }
  return data.map((candle) => ({ time: candle.time, levels: levels.get(sessionKey(candle.time)) })).filter((item) => item.levels);
}

export function rsi(data: Candle[], period = 14) {
  let averageGain = 0;
  let averageLoss = 0;
  return data.map((candle, index) => {
    if (index === 0) return { time: candle.time, value: 50 };
    const difference = candle.close - data[index - 1].close;
    const gain = Math.max(0, difference);
    const loss = Math.max(0, -difference);
    if (index <= period) {
      averageGain = (averageGain * (index - 1) + gain) / index;
      averageLoss = (averageLoss * (index - 1) + loss) / index;
    } else {
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }
    const relativeStrength = averageLoss === 0 ? 100 : averageGain / averageLoss;
    return { time: candle.time, value: 100 - 100 / (1 + relativeStrength) };
  });
}

export function formatInr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
