export type VolumeCandle = { time: number; high: number; low: number; volume: number; open?: number; close?: number };

/** OHLCV estimate: spread each candle's volume across its high-low range, conserving total volume. */
export function buildVolumeProfile(candles: VolumeCandle[], from: number, to: number, rows = 40) {
  const selected = candles.filter(c => c.time >= Math.min(from, to) && c.time <= Math.max(from, to) && Number.isFinite(c.high) && Number.isFinite(c.low) && c.high >= c.low && Number.isFinite(c.volume) && c.volume > 0);
  if (!selected.length) return [];
  const low = Math.min(...selected.map(c => c.low)), high = Math.max(...selected.map(c => c.high));
  const count = Math.max(1, Math.min(80, Math.floor(rows)));
  const step = (high - low || Math.max(low * .001, .05)) / count;
  const bins = Array.from({ length: count }, (_, i) => ({ low: low + i * step, high: low + (i + 1) * step, volume: 0, upVolume: 0, downVolume: 0 }));
  for (const candle of selected) {
    const up = candle.open !== undefined && candle.close !== undefined ? (candle.close >= candle.open ? 1 : 0) : .5;
    const add = (bin: typeof bins[number], volume: number) => { bin.volume += volume; bin.upVolume += volume * up; bin.downVolume += volume * (1 - up); };
    if (candle.high === candle.low) {
      add(bins[Math.max(0, Math.min(count - 1, Math.floor((candle.low - low) / step)))], candle.volume);
    } else {
      for (const bin of bins) add(bin, candle.volume * Math.max(0, Math.min(candle.high, bin.high) - Math.max(candle.low, bin.low)) / (candle.high - candle.low));
    }
  }
  return bins;
}
