import type { Candle } from "./market";

export type ChartHistoryRequest = { token: number; years?: number; date?: string };
export const CHART_INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60, "2m": 120, "3m": 180, "5m": 300, "10m": 600, "15m": 900, "30m": 1800,
  "1H": 3600, "2H": 7200, "3H": 10800, "4H": 14400, "1D": 86400,
  "1W": 604800, "1M": 2678400, "1Y": 31622400,
};

export function candleBucket(time: number, timeframe: string) {
  const date = new Date(time * 1000);
  if (timeframe === "1Y") return Date.UTC(date.getUTCFullYear(), 0, 1) / 1000;
  if (timeframe === "1M") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
  if (timeframe === "1W") {
    const day = Math.floor(time / 86400);
    return (day - ((date.getUTCDay() + 6) % 7)) * 86400;
  }
  const seconds = CHART_INTERVAL_SECONDS[timeframe];
  return Math.floor(time / seconds) * seconds;
}

export function aggregateChartCandles(candles: Candle[], timeframe: string): Candle[] {
  const buckets = new Map<number, Candle>();
  const unique = new Map(candles.map(c => [Number(c.time), c]));
  for (const candle of [...unique.values()].sort((a, b) => Number(a.time) - Number(b.time))) {
    const time = candleBucket(Number(candle.time), timeframe);
    const previous = buckets.get(time);
    if (!previous) buckets.set(time, { ...candle, time });
    else {
      previous.high = Math.max(previous.high, candle.high);
      previous.low = Math.min(previous.low, candle.low);
      previous.close = candle.close;
      previous.volume += candle.volume;
    }
  }
  return [...buckets.values()];
}

export function deltaHistoryPlan(timeframe: string, params: URLSearchParams, now = Date.now()) {
  const seconds = CHART_INTERVAL_SECONDS[timeframe];
  if (!seconds) throw new Error("Unsupported timeframe.");
  const base = ({ "2m": "1m", "10m": "5m", "3H": "1H", "1W": "1D", "1M": "1D", "1Y": "1D" } as Record<string, string>)[timeframe] ?? timeframe;
  const baseSeconds = CHART_INTERVAL_SECONDS[base];
  const years = Number(params.get("years") ?? 0);
  if (years && (![3, 5, 10].includes(years) || timeframe !== "1D")) throw new Error("History ranges require daily candles.");
  const date = params.get("date");
  const target = date ? Date.parse(date) / 1000 : null;
  if (target !== null && (!Number.isFinite(target) || target < 0 || target > now / 1000)) throw new Error("Choose a valid past date.");
  const lookback = years ? years * 366 * 86400 : seconds >= 604800 ? 10 * 366 * 86400 : seconds * 600;
  let end = Math.floor(now / 1000 / baseSeconds) * baseSeconds + baseSeconds;
  let start = end - lookback;
  if (target !== null) {
    start = candleBucket(target, timeframe) - Math.min(seconds * 120, 5 * 366 * 86400);
    end = Math.min(end, target + Math.min(seconds * 120, 5 * 366 * 86400));
  }
  start = Math.max(0, Math.floor(start / baseSeconds) * baseSeconds);
  const windows: Array<{ start: number; end: number }> = [];
  for (let cursor = start; cursor < end; cursor += baseSeconds * 1500) windows.push({ start: cursor, end: Math.min(end, cursor + baseSeconds * 1500) });
  return { resolution: base.toLowerCase(), windows, aggregate: base !== timeframe, start, end };
}

export function candlesEqual(a: Candle, b: Candle) {
  return a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
}

/** A trailing candle update can be drawn without replacing the full series. */
export function trailingCandleUpdate(previous: Candle[], next: Candle[]) {
  if (!previous.length || next.length < previous.length || next.length > previous.length + 1) return false;
  return previous.slice(0, -1).every((c, i) => candlesEqual(c, next[i]));
}

export function nearestCandleIndex(candles: Candle[], target: number, timeframe: string, calendarOffset = 0) {
  if (!candles.length) return -1;
  const offset = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? calendarOffset : 0;
  const bucket = candleBucket(target + offset, timeframe);
  const containing = candles.findIndex(c => candleBucket(Number(c.time) + offset, timeframe) === bucket);
  if (containing >= 0) return containing;
  return candles.reduce((best, c, i) => Math.abs(Number(c.time) - target) < Math.abs(Number(candles[best].time) - target) ? i : best, 0);
}
