import type { Candle } from './market';
import { emaSeries } from './ema5-reversal.ts';

export type BotEmaSetup = { side: 'BUY' | 'SELL'; bar: Candle; id: string };

/** Replay completed candles to find an unbroken alert/pullback; live prices trigger entries separately. */
export function botEmaSetup(candles: Candle[], strategy: 'ema5' | 'ema21'): BotEmaSetup | null {
  const period = strategy === 'ema5' ? 5 : 21;
  const averages = emaSeries(candles.map(c => c.close), period);
  let setup: BotEmaSetup | null = null;
  let cross: { side: 'BUY' | 'SELL'; index: number } | null = null;
  for (let i = period - 1; i < candles.length; i++) {
    const bar = candles[i], average = averages[i];
    // A historical break has already used this setup: do not replay it later.
    if (setup && (setup.side === 'BUY' ? bar.high > setup.bar.high : bar.low < setup.bar.low)) {
      setup = null;
      cross = null;
    }
    if (strategy === 'ema5') {
      if (bar.low > average) setup = { side: 'SELL', bar, id: `ema5:${bar.time}` };
      continue;
    }
    if (i < period) continue;
    const prior = candles[i - 1], priorAverage = averages[i - 1];
    if (prior.close <= priorAverage && bar.close > average) {
      cross = { side: 'BUY', index: i };
      setup = null;
    } else if (prior.close >= priorAverage && bar.close < average) {
      cross = { side: 'SELL', index: i };
      setup = null;
    }
    if (!cross) continue;
    if (cross.side === 'BUY' ? bar.close <= average : bar.close >= average) {
      cross = null;
      setup = null;
      continue;
    }
    const since = i - cross.index;
    if (!setup && since >= 1 && since <= 3 && (cross.side === 'BUY'
      ? bar.close < bar.open && bar.low > average
      : bar.close > bar.open && bar.high < average)) {
      setup = { side: cross.side, bar, id: `ema21:${cross.side}:${candles[cross.index].time}:${bar.time}` };
    }
    if (!setup && since > 3) cross = null;
  }
  return setup;
}
