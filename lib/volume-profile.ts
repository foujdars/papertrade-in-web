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

export type FootprintRow = { low: number; high: number; buy: number; sell: number; volume: number };

/** Estimated bid/ask ladder from one OHLCV candle. Body rows carry more volume than wicks. */
export function footprintLadder(candle: VolumeCandle, rows = 8): FootprintRow[] {
  if (!Number.isFinite(candle.volume) || candle.volume <= 0 || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || candle.high < candle.low) return [];
  const count = Math.max(1, Math.min(16, Math.floor(rows)));
  const low = candle.low;
  const high = candle.high;
  const range = high - low || Math.max(Math.abs(low) * 0.001, 0.05);
  const close = candle.close ?? (high + low) / 2;
  const open = candle.open ?? close;
  const bodyLow = Math.min(open, close);
  const bodyHigh = Math.max(open, close);
  const buyShare = Math.min(1, Math.max(0, (Math.min(high, Math.max(low, close)) - low) / range));
  const draft = Array.from({ length: count }, (_, index) => {
    const binLow = low + (index * range) / count;
    const binHigh = low + ((index + 1) * range) / count;
    const mid = (binLow + binHigh) / 2;
    return { low: binLow, high: binHigh, weight: mid >= bodyLow && mid <= bodyHigh ? 3 : 1, position: (mid - low) / range };
  });
  const weightSum = draft.reduce((sum, row) => sum + row.weight, 0);
  const raw = draft.map((row) => {
    const volume = candle.volume * row.weight / weightSum;
    const sell = volume * (1 - row.position);
    const buy = volume * row.position;
    return { low: row.low, high: row.high, sell, buy };
  });
  const sellSum = raw.reduce((sum, row) => sum + row.sell, 0) || 1;
  const buySum = raw.reduce((sum, row) => sum + row.buy, 0) || 1;
  const sellBudget = candle.volume * (1 - buyShare);
  const buyBudget = candle.volume * buyShare;
  return raw.map((row) => {
    const sell = row.sell * sellBudget / sellSum;
    const buy = row.buy * buyBudget / buySum;
    return { low: row.low, high: row.high, sell, buy, volume: sell + buy };
  });
}

export function compactVolume(value: number) {
  const abs = Math.abs(value);
  const trim = (text: string) => text.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  if (abs >= 1e9) return `${trim((value / 1e9).toFixed(2))}B`;
  if (abs >= 1e6) return `${trim((value / 1e6).toFixed(3))}M`;
  if (abs >= 1e3) return `${trim((value / 1e3).toFixed(3))}K`;
  return String(Math.round(value));
}
