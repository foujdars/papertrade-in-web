import type { Candle } from "./market";

export type AnchoredVwapPoint = { time: number; value: number };

/** Volume-weighted typical price from the anchor candle forward. Earlier candles are ignored. */
export function anchoredVwap(candles: Pick<Candle, "time" | "high" | "low" | "close" | "volume">[], anchorTime: number): AnchoredVwapPoint[] {
  if (!Number.isFinite(anchorTime)) return [];
  const start = candles.findIndex((candle) => candle.time >= anchorTime);
  if (start < 0) return [];
  let priceVolume = 0;
  let volume = 0;
  const points: AnchoredVwapPoint[] = [];
  for (const candle of candles.slice(start)) {
    if (![candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite) || candle.volume < 0) continue;
    if (candle.volume === 0) continue;
    const typical = (candle.high + candle.low + candle.close) / 3;
    priceVolume += typical * candle.volume;
    volume += candle.volume;
    points.push({ time: candle.time, value: priceVolume / volume });
  }
  return points;
}
