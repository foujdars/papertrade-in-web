import type { Candle } from './market.ts';
export type AlgoPaperSignal = { instrumentKey: string; fast: number; slow: number; direction: 'bullish' | 'bearish'; timeframe: '1m' | '5m' | '15m' };

export function algoPaperSignalReady(candles: Candle[], config: AlgoPaperSignal, now: number) {
  const seconds = { '1m': 60, '5m': 300, '15m': 900 }[config.timeframe];
  const closed = candles.filter(c => (c.time + seconds) * 1000 <= now - 1000).sort((a, b) => a.time - b.time);
  if (closed.length < config.slow + 1) return false;
  const last = closed.at(-1)!;
  if (now - (last.time + seconds) * 1000 > seconds * 1000 + 10_000) return false;
  let fast = closed[0].close, slow = fast, previousFast = fast, previousSlow = slow;
  for (const bar of closed.slice(1)) {
    previousFast = fast; previousSlow = slow;
    fast += 2 / (config.fast + 1) * (bar.close - fast);
    slow += 2 / (config.slow + 1) * (bar.close - slow);
  }
  return config.direction === 'bullish' ? previousFast <= previousSlow && fast > slow : previousFast >= previousSlow && fast < slow;
}
