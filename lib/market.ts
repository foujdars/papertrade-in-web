import { UPSTOX_INSTRUMENT_KEYS } from "@/lib/upstox";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Instrument = {
  symbol: string;
  name: string;
  exchange: "NSE";
  price: number;
  change: number;
  instrumentKey: string;
  category: "NIFTY 50" | "BANK NIFTY" | "NIFTY 500";
};

export const instruments: Instrument[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", price: 2987.4, change: 1.28, instrumentKey: UPSTOX_INSTRUMENT_KEYS.RELIANCE, category: "NIFTY 50" },
  { symbol: "HDFCBANK", name: "HDFC Bank", exchange: "NSE", price: 1986.65, change: 0.64, instrumentKey: UPSTOX_INSTRUMENT_KEYS.HDFCBANK, category: "BANK NIFTY" },
  { symbol: "ICICIBANK", name: "ICICI Bank", exchange: "NSE", price: 1461.2, change: -0.31, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ICICIBANK, category: "BANK NIFTY" },
  { symbol: "INFY", name: "Infosys", exchange: "NSE", price: 1644.8, change: 1.92, instrumentKey: UPSTOX_INSTRUMENT_KEYS.INFY, category: "NIFTY 50" },
  { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE", price: 3318.5, change: -0.42, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TCS, category: "NIFTY 50" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", exchange: "NSE", price: 2094.9, change: 1.05, instrumentKey: UPSTOX_INSTRUMENT_KEYS.BHARTIARTL, category: "NIFTY 50" },
  { symbol: "SBIN", name: "State Bank of India", exchange: "NSE", price: 854.35, change: 0.83, instrumentKey: UPSTOX_INSTRUMENT_KEYS.SBIN, category: "BANK NIFTY" },
  { symbol: "AXISBANK", name: "Axis Bank", exchange: "NSE", price: 1198.6, change: -0.72, instrumentKey: UPSTOX_INSTRUMENT_KEYS.AXISBANK, category: "BANK NIFTY" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", exchange: "NSE", price: 2188.1, change: 0.22, instrumentKey: UPSTOX_INSTRUMENT_KEYS.KOTAKBANK, category: "BANK NIFTY" },
  { symbol: "LT", name: "Larsen & Toubro", exchange: "NSE", price: 3642.8, change: 1.16, instrumentKey: UPSTOX_INSTRUMENT_KEYS.LT, category: "NIFTY 50" },
  { symbol: "ITC", name: "ITC", exchange: "NSE", price: 421.5, change: -0.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ITC, category: "NIFTY 50" },
  { symbol: "MARUTI", name: "Maruti Suzuki India", exchange: "NSE", price: 12694.0, change: 0.51, instrumentKey: UPSTOX_INSTRUMENT_KEYS.MARUTI, category: "NIFTY 50" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical", exchange: "NSE", price: 1694.25, change: 1.34, instrumentKey: UPSTOX_INSTRUMENT_KEYS.SUNPHARMA, category: "NIFTY 50" },
  { symbol: "TITAN", name: "Titan Company", exchange: "NSE", price: 3528.7, change: -0.56, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TITAN, category: "NIFTY 50" },
  { symbol: "TATAMOTORS", name: "Tata Motors", exchange: "NSE", price: 688.4, change: 2.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TATAMOTORS, category: "NIFTY 500" },
  { symbol: "ZOMATO", name: "Eternal", exchange: "NSE", price: 312.65, change: 2.72, instrumentKey: UPSTOX_INSTRUMENT_KEYS.ZOMATO, category: "NIFTY 500" },
  { symbol: "DMART", name: "Avenue Supermarts", exchange: "NSE", price: 4287.0, change: -1.18, instrumentKey: UPSTOX_INSTRUMENT_KEYS.DMART, category: "NIFTY 500" },
  { symbol: "TRENT", name: "Trent", exchange: "NSE", price: 5486.3, change: 1.41, instrumentKey: UPSTOX_INSTRUMENT_KEYS.TRENT, category: "NIFTY 500" },
  { symbol: "IRCTC", name: "Indian Railway Catering", exchange: "NSE", price: 768.85, change: -0.93, instrumentKey: UPSTOX_INSTRUMENT_KEYS.IRCTC, category: "NIFTY 500" },
  { symbol: "HAL", name: "Hindustan Aeronautics", exchange: "NSE", price: 4864.15, change: 0.88, instrumentKey: UPSTOX_INSTRUMENT_KEYS.HAL, category: "NIFTY 500" },
];

export const timeframes: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1H": 3600,
  "3H": 10800,
  "4H": 14400,
  "1D": 86400,
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
  let seed = hash(instrument.symbol) + interval;
  let close = instrument.price * 0.92;
  const data: Candle[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    seed = (seed * 9301 + 49297) % 233280;
    const noise = seed / 233280 - 0.5;
    const drift = (instrument.price - close) * 0.014;
    const open = close;
    close = Math.max(1, open + drift + noise * instrument.price * 0.008);
    const spread = Math.abs(noise) * instrument.price * 0.004 + instrument.price * 0.0016;
    data.push({
      time: end - index * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread * 0.84,
      close,
    });
  }

  const scale = instrument.price / data[data.length - 1].close;
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
