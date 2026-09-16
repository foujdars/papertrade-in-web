import type { Candle } from "./market";

export type CandleTick = { instrumentKey: string; price: number; timestampMs: number };
const IST = 19_800;
export const LIVE_INTERVALS: Record<string, number> = {
  "1m": 60, "2m": 120, "3m": 180, "5m": 300, "10m": 600, "15m": 900,
  "30m": 1800, "1H": 3600, "2H": 7200, "3H": 10800, "4H": 14400, "1D": 86400,
};

export function liveCandleBucket(timestampMs: number, timeframe: string): number | null {
  if (!Number.isFinite(timestampMs) || !LIVE_INTERVALS[timeframe]) return null;
  const local = Math.floor(timestampMs / 1000) + IST;
  const day = Math.floor(local / 86400) * 86400;
  const elapsed = local - day - 33300; // NSE regular session starts at 09:15 IST.
  // Do not invent overnight candles from an old quote or a heartbeat.
  if (elapsed < 0 || elapsed > 22500) return null;
  if (timeframe === "1D") return day - IST;
  // The closing auction tick belongs to the final regular-session candle.
  return day + 33300 + Math.floor(Math.min(elapsed, 22499) / LIVE_INTERVALS[timeframe]) * LIVE_INTERVALS[timeframe] - IST;
}

export function validCandleTick(tick: CandleTick, key: string, previous: CandleTick | null, now = Date.now()) {
  return tick.instrumentKey === key && Number.isFinite(tick.price) && tick.price > 0 &&
    Number.isFinite(tick.timestampMs) && tick.timestampMs <= now + 5000 && now - tick.timestampMs <= 90_000 &&
    (!previous || tick.timestampMs > previous.timestampMs || (tick.timestampMs === previous.timestampMs && tick.price !== previous.price));
}

export function applyCandleTick(candles: Candle[], tick: CandleTick, timeframe: string): Candle[] {
  const time = liveCandleBucket(tick.timestampMs, timeframe);
  const last = candles.at(-1);
  if (time === null || !last || time < last.time) return candles;
  const next = time === last.time
    ? { ...last, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price), close: tick.price }
    : { time, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 };
  return [...(time === last.time ? candles.slice(0, -1) : candles), next].slice(-1600);
}

// REST has no per-candle trade timestamp. Keep the tick-built bar until the
// next bar closes; REST may still correct volume/open and older completed bars.
export function reconcileLiveCandles(current: Candle[], incoming: Candle[], tick: CandleTick | null, timeframe: string, now = Date.now()): Candle[] {
  const map = new Map(current.map(bar => [bar.time, bar]));
  const freshTick = tick && now - tick.timestampMs <= 90_000 ? tick : null;
  const liveTime = freshTick ? liveCandleBucket(freshTick.timestampMs, timeframe) : null;
  const newestTime = Math.max(current.at(-1)?.time ?? 0, incoming.at(-1)?.time ?? 0);
  for (const bar of incoming) {
    const prior = map.get(bar.time);
    map.set(bar.time, prior && bar.time === liveTime && bar.time === newestTime
      ? { ...bar, high: Math.max(bar.high, prior.high), low: Math.min(bar.low, prior.low), close: prior.close, volume: Math.max(bar.volume ?? 0, prior.volume ?? 0) }
      : bar);
  }
  const result = [...map.values()].sort((a, b) => a.time - b.time).slice(-1600);
  return freshTick ? applyCandleTick(result, freshTick, timeframe) : result;
}
