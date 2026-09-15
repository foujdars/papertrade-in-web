export type VolumeCandle = { time: number; high: number; low: number; volume: number; open?: number; close?: number };

/** Contiguous value area; ties prefer the nearer row, then the row above POC. */
export function volumeValueArea(bins: {volume:number}[], fraction=.7) {
  if(!bins.length)return {low:-1,high:-1,poc:-1};
  const max=Math.max(...bins.map(b=>b.volume)),poc=bins.findIndex(b=>b.volume===max);
  let low=poc,high=poc,covered=max;
  const target=bins.reduce((sum,b)=>sum+b.volume,0)*fraction;
  while(covered<target&&(low>0||high<bins.length-1)) {
    const below=low>0?bins[low-1].volume:-1,above=high<bins.length-1?bins[high+1].volume:-1;
    const up=above>below||(above===below&&high-poc<=poc-low);
    const next=up?above:below;
    if(covered+next>target)break;
    covered+=next;if(up)high++;else low--;
  }
  return {low,high,poc};
}

/** OHLCV estimate: spread each candle's volume across its high-low range, conserving total volume. */
export function buildVolumeProfile(candles: VolumeCandle[], from: number, to: number, rows = 24) {
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
