import type { Candle } from "./market";

/** Uses this timeframe's immediately previous candle, including overnight gaps. */
export function candleChangePercent(close: number, previousClose: number | undefined): number | null {
  if (!Number.isFinite(close) || !Number.isFinite(previousClose) || previousClose! <= 0) return null;
  const percent = (close - previousClose!) / previousClose! * 100;
  return Number.isFinite(percent) ? percent : null;
}

/** Candles are ordered by time. Empty chart space (or a removed bar) uses the latest bar. */
export function selectCandleLegend(candles: readonly Candle[], hoveredTime: number | null = null) {
  if (!candles.length) return null;
  let index = candles.length - 1;
  if (hoveredTime !== null && Number.isFinite(hoveredTime)) {
    let left = 0, right = index;
    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const time = Number(candles[middle].time);
      if (time === hoveredTime) { index = middle; break; }
      if (time < hoveredTime) left = middle + 1;
      else right = middle - 1;
    }
  }
  const candle = candles[index];
  return { candle, changePercent: candleChangePercent(candle.close, candles[index - 1]?.close) };
}

export function formatCandleChange(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "—";
  const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${(Object.is(rounded, -0) ? 0 : rounded).toFixed(2)}%`;
}
