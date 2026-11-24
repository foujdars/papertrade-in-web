import { aggregateChartCandles, candleBucket, CHART_INTERVAL_SECONDS, deltaHistoryPlan } from "./chart-history.ts";
import { globalReferenceInstrument } from "./global-reference.ts";
import type { Candle } from "./market";

const DAY = 86_400;
const DEFAULT_CANDLE_COUNT = 600;
type Plan = ReturnType<typeof deltaHistoryPlan>;
type Result = { candles: Candle[]; source: string; history: { nextBefore: number; hasMore: boolean } };
type Page = { rows: Candle[]; start: number; limited?: boolean };
type Provider = { name: string; load: (symbol: string, frame: string, plan: Plan, now: number) => Promise<Page> };

async function json(url: URL, headers?: HeadersInit) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(4_000), cache: "no-store" });
  if (!response.ok) throw new Error("Provider request failed.");
  return response.json();
}

function urlWithParams(base: string, params: Record<string, string>) {
  const url = new URL(base);
  url.search = new URLSearchParams(params).toString();
  return url;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const parseTime = (time: string) => Date.parse(time) / 1000;

function bar(time: number, open: unknown, high: unknown, low: unknown, close: unknown, volume: unknown = 0): Candle {
  return { time, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };
}

function validBar(candle: Candle) {
  return Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value) && value > 0)
    && candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close)
    && Number.isFinite(candle.volume) && candle.volume >= 0;
}

function windowStart(plan: Plan, frame: string, seconds: number, limit: number) {
  return Math.max(plan.start, candleBucket(plan.end - limit * seconds, frame));
}

const equityFrames: Record<string, string> = {
  "1m": "1Min", "2m": "2Min", "3m": "3Min", "5m": "5Min", "10m": "10Min", "15m": "15Min", "30m": "30Min",
  "1H": "1Hour", "2H": "2Hour", "3H": "3Hour", "4H": "4Hour", "1D": "1Day", "1W": "1Week", "1M": "1Month",
};
const alpaca: Provider = {
  name: "Alpaca · IEX",
  async load(symbol, frame, plan, now) {
    const key = process.env.ALPACA_DATA_KEY_ID, secret = process.env.ALPACA_DATA_SECRET_KEY;
    if (!key || !secret) throw new Error("Alpaca data credentials are missing.");
    const body = await json(urlWithParams(`https://data.alpaca.markets/v2/stocks/${symbol}/bars`, {
      timeframe: equityFrames[frame], start: iso(plan.start), end: iso(Math.min(plan.end, now)),
      limit: "10000", adjustment: "raw", feed: "iex",
    }), { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret });
    if (!Array.isArray(body.bars) || body.next_page_token) throw new Error("Alpaca history is incomplete.");
    return { start: plan.start, rows: body.bars.map((r: { t: string; o: number; h: number; l: number; c: number; v: number }) => {
      const t = frame === "1D" || frame === "1W" || frame === "1M" ? r.t.slice(0, 10) : r.t;
      return bar(parseTime(t), r.o, r.h, r.l, r.c, r.v);
    }) };
  },
};

const twelveFrames: Record<string, string> = {
  "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
  "1H": "1h", "2H": "2h", "4H": "4h", "1D": "1day", "1W": "1week", "1M": "1month",
};
const twelve: Provider = {
  name: "Twelve Data",
  async load(symbol, frame, plan, now) {
    const key = process.env.TWELVE_DATA_API_KEY;
    if (!key) throw new Error("Twelve Data credentials are missing.");
    const base = twelveFrames[frame] ? frame : frame === "10m" ? "5m" : frame === "3H" ? "1H" : "1m";
    const start = windowStart(plan, frame, CHART_INTERVAL_SECONDS[base], 4900);
    const dateTime = (epoch: number) => iso(epoch).slice(0, 19).replace("T", " ");
    const body = await json(urlWithParams("https://api.twelvedata.com/time_series", {
      symbol: symbol === "XAUUSD" ? "XAU/USD" : symbol, interval: twelveFrames[base],
      timezone: "UTC", start_date: dateTime(start), end_date: dateTime(Math.min(now, plan.end)),
      outputsize: "5000", order: "ASC",
    }), { Authorization: `apikey ${key}` });
    if (!Array.isArray(body.values) || body.meta?.currency && body.meta.currency !== "USD") throw new Error("Twelve Data history is unavailable.");
    const candles = body.values.map((r: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }) =>
      bar(parseTime(r.datetime.length === 10 ? r.datetime : r.datetime.replace(" ", "T") + "Z"), r.open, r.high, r.low, r.close, r.volume));
    return { start, rows: base === frame ? candles : aggregateChartCandles(candles.filter(validBar), frame) };
  },
};

const coinbase: Provider = {
  name: "Coinbase Exchange",
  async load(symbol, frame, plan, now) {
    const target = CHART_INTERVAL_SECONDS[frame];
    const granularity = [DAY, 3600, 900, 300, 60].find(seconds => target % seconds === 0) ?? DAY;
    const start = windowStart(plan, frame, granularity, 850);
    const end = Math.min(plan.end, now);
    const windows = [];
    for (let cursor = start; cursor < end; cursor += granularity * 299) {
      windows.push([cursor, Math.min(cursor + granularity * 299, end)]);
    }
    const pages = await Promise.all(windows.map(async ([from, to]) => {
      const rows = await json(urlWithParams(`https://api.exchange.coinbase.com/products/${symbol}/candles`, {
        start: iso(from), end: iso(to), granularity: String(granularity),
      }));
      if (!Array.isArray(rows)) throw new Error("Coinbase history is unavailable.");
      return rows.map(([time, low, high, open, close, volume]: number[]) => bar(time, open, high, low, close, volume));
    }));
    const rows = pages.flat().filter(candle => candle.time >= start && candle.time < plan.end && validBar(candle));
    return { start, rows: granularity === target ? rows : aggregateChartCandles(rows, frame) };
  },
};

const kraken: Provider = {
  name: "Kraken",
  async load(symbol, frame, plan) {
    const target = CHART_INTERVAL_SECONDS[frame] / 60;
    const interval = [10080, 1440, 240, 60, 30, 15, 5, 1].find(minutes => target % minutes === 0) ?? 1440;
    const pair = symbol === "BTC-USD" ? "XBTUSD" : symbol.replace("-", "");
    const body = await json(urlWithParams("https://api.kraken.com/0/public/OHLC", {
      pair, interval: String(interval), since: String(Math.floor(plan.start)),
    }));
    const data = Object.entries(body.result ?? {}).find(([key]) => key !== "last")?.[1];
    if (body.error?.length || !Array.isArray(data)) throw new Error("Kraken history is unavailable.");
    const rows = data.map(([time, open, high, low, close, , volume]) => bar(time, open, high, low, close, volume)).filter(validBar);
    return { start: plan.start, rows: interval === target ? rows : aggregateChartCandles(rows, frame), limited: true };
  },
};

const oandaFrames: Record<string, string> = {
  "1m": "M1", "2m": "M2", "5m": "M5", "10m": "M10", "15m": "M15", "30m": "M30",
  "1H": "H1", "2H": "H2", "3H": "H3", "4H": "H4", "1D": "D", "1W": "W", "1M": "M",
};
const oanda: Provider = {
  name: "OANDA · midpoint",
  async load(_symbol, frame, plan, now) {
    const token = process.env.OANDA_DATA_TOKEN;
    if (!token) throw new Error("OANDA data credentials are missing.");
    const base = oandaFrames[frame] ? frame : "1m";
    const start = windowStart(plan, frame, CHART_INTERVAL_SECONDS[base], 4800);
    const body = await json(urlWithParams("https://api-fxpractice.oanda.com/v3/instruments/XAU_USD/candles", {
      granularity: oandaFrames[base], price: "M", from: iso(start), to: iso(Math.min(now, plan.end)),
      alignmentTimezone: "UTC", dailyAlignment: "0", weeklyAlignment: "Monday",
    }), { Authorization: `Bearer ${token}` });
    if (!Array.isArray(body.candles)) throw new Error("OANDA history is unavailable.");
    const candles = body.candles.map((r: { time: string; mid: { o: string; h: string; l: string; c: string } }) =>
      bar(parseTime(r.time), r.mid.o, r.mid.h, r.mid.l, r.mid.c));
    return { start, rows: base === frame ? candles : aggregateChartCandles(candles.filter(validBar), frame) };
  },
};

export function referenceHistoryPlan(timeframe: string, params: URLSearchParams, now: number) {
  if (!Object.hasOwn(CHART_INTERVAL_SECONDS, timeframe)) throw new Error("Unsupported timeframe.");
  const plan = deltaHistoryPlan(timeframe, params, now * 1000);
  // Keep enough bars across stock market weekends and overnight closures while bounding provider work.
  if (!params.has("date") && !params.has("years") && CHART_INTERVAL_SECONDS[timeframe] < DAY) {
    const lookback = Math.max(5 * DAY, CHART_INTERVAL_SECONDS[timeframe] * DEFAULT_CANDLE_COUNT);
    return { ...plan, start: candleBucket(Math.max(0, plan.end - lookback), timeframe) };
  }
  return plan;
}

export async function referenceCandles(symbol: string, timeframe: string, plan: Plan, now: number): Promise<Result> {
  const instrument = globalReferenceInstrument(symbol);
  if (!instrument) throw new Error("Unsupported reference instrument.");
  const isCrypto = instrument.categories.includes("CRYPTO");
  const providers = isCrypto ? [coinbase, kraken] : symbol === "XAUUSD" ? [twelve, oanda] : [alpaca, twelve];
  const frame = timeframe === "1Y" ? "1M" : timeframe;
  // Weekly and monthly APIs can normalize sessions differently. Build weekly candles from daily bars consistently.
  const providerFrame = frame === "1W" ? "1D" : frame;
  let olderHistoryExhausted = false;
  for (const provider of providers) {
    try {
      const page = await provider.load(symbol, providerFrame, plan, now);
      const data = page.rows.filter(candle => validBar(candle) && candle.time >= page.start && candle.time <= now && candle.time < plan.end);
      const unique = [...new Map(data.map(candle => [candle.time, candle])).values()].sort((a, b) => a.time - b.time);
      const candles = providerFrame === timeframe ? unique : aggregateChartCandles(unique, timeframe).filter(candle => candle.time >= plan.start);
      const last = candles.at(-1);
      if (!last) {
        olderHistoryExhausted ||= Boolean(page.limited);
        continue;
      }
      if (plan.before === null && plan.end >= now) {
        const maxAge = isCrypto ? Math.max(CHART_INTERVAL_SECONDS[timeframe] * 2, 900) : Math.max(CHART_INTERVAL_SECONDS[timeframe] * 2, DAY * 7);
        if (now - last.time > maxAge) continue;
      }
      const nextBefore = Math.max(plan.start, candleBucket(page.start, timeframe));
      return { candles, source: provider.name, history: { nextBefore, hasMore: !page.limited && nextBefore > 0 } };
    } catch {
      // Try the next provider for this same instrument without exposing credentials or upstream errors.
    }
  }
  if (plan.before !== null && olderHistoryExhausted) return { candles: [], source: "", history: { nextBefore: plan.start, hasMore: false } };
  throw new Error("Reference data is temporarily unavailable for this instrument and range.");
}
