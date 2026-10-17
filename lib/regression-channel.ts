export type RegressionBar = { time: number; close?: number };
export type RegressionChannel = {
  from: number; to: number; start: number; end: number;
  deviation: number; correlation: number; count: number;
};

/** Least squares over bar positions, with population deviation of the residuals. */
export function regressionChannel(bars: readonly RegressionBar[], from: number, to: number): RegressionChannel | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const first = Math.min(from, to), last = Math.max(from, to);
  const selected = bars.filter(bar => bar.time >= first && bar.time <= last);
  if (selected.length < 2 || selected.some(bar => !Number.isFinite(bar.close))) return null;
  const count = selected.length, meanX = (count - 1) / 2;
  // Center prices before summing to preserve precision for large prices and small moves.
  const origin = selected[0].close!;
  const meanY = selected.reduce((sum, bar) => sum + (bar.close! - origin), 0) / count;
  let xx = 0, xy = 0, yy = 0;
  for (let i = 0; i < count; i++) {
    const x = i - meanX, y = selected[i].close! - origin - meanY;
    xx += x * x; xy += x * y; yy += y * y;
  }
  const slope = xy / xx, intercept = meanY - slope * meanX;
  let residual = 0;
  for (let i = 0; i < count; i++) residual += (selected[i].close! - origin - intercept - slope * i) ** 2;
  return {
    from: selected[0].time, to: selected[count - 1].time,
    start: origin + intercept, end: origin + intercept + slope * (count - 1),
    deviation: Math.sqrt(residual / count),
    correlation: yy === 0 ? 0 : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))), count,
  };
}
