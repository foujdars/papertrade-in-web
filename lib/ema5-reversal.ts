import { shadeChoice, type PushNotice } from "./notification-policy.ts";

export const EMA5_REVERSAL_FRAMES = { "5m": 300, "15m": 900 } as const;
export type Ema5Frame = keyof typeof EMA5_REVERSAL_FRAMES;

export type Ema5Bar = { time: number; open: number; high: number; low: number; close: number };

/** EMA seeded by the SMA of the first length, matching the chart average(). */
export function emaSeries(values: number[], length: number): number[] {
  const alpha = 2 / (length + 1);
  let state = Number.NaN;
  let seed: number[] = [];
  return values.map((value) => {
    if (!Number.isFinite(value)) { state = Number.NaN; seed = []; return Number.NaN; }
    if (!Number.isFinite(state)) {
      seed.push(value);
      if (seed.length < length) return Number.NaN;
      state = seed.reduce((sum, item) => sum + item, 0) / seed.length;
    } else state += alpha * (value - state);
    return state;
  });
}

/**
 * Alert candle: any colour, and only the first bar whose low stays strictly
 * above EMA 5 after the previous bar touched it. Later bars that stay above
 * are not new alerts.
 */
export function ema5ReversalAt(bars: Ema5Bar[], index: number, values: number[], seconds: number): boolean {
  const bar = bars[index];
  const prior = bars[index - 1];
  const ema = values[index];
  const priorEma = values[index - 1];
  if (!bar || !prior || bar.time - prior.time !== seconds) return false;
  if (![ema, priorEma, bar.low, prior.low, prior.high].every(Number.isFinite)) return false;
  const priorTouched = prior.low <= priorEma && priorEma <= prior.high;
  return priorTouched && bar.low > ema;
}

export function closedEmaBars(candles: Ema5Bar[], seconds: number, now: number): Ema5Bar[] {
  const valid = candles.filter((bar) => bar
    && [bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)
    && bar.high >= bar.low
    && bar.high >= Math.max(bar.open, bar.close)
    && bar.low <= Math.min(bar.open, bar.close));
  return [...new Map(valid.map((bar) => [bar.time, bar])).values()]
    .sort((a, b) => a.time - b.time)
    .filter((bar) => (bar.time + seconds) * 1000 + 5000 <= now);
}

/** Last closed candle only, and only while it is still fresh, so a deploy does not replay history. */
export function ema5ReversalSignal(candles: Ema5Bar[], frame: Ema5Frame, now: number): number | null {
  const seconds = EMA5_REVERSAL_FRAMES[frame];
  const closed = closedEmaBars(candles, seconds, now);
  const last = closed.at(-1);
  if (!last || closed.length < 6) return null;
  const age = now - (last.time + seconds) * 1000;
  if (age < 0 || age > 180000) return null;
  const values = emaSeries(closed.map((bar) => bar.close), 5);
  return ema5ReversalAt(closed, closed.length - 1, values, seconds) ? last.time : null;
}

export function ema5AlertTitle(frame: string) {
  return shadeChoice("📈", [`BTC ${frame} low above 5 EMA`, `BTC ${frame} 5 EMA reversal`]);
}

export function ema5AlertId(frame: string, candleTime: number) {
  return `ema5-BTCUSD-${frame}-${candleTime}`;
}

export function ema5AlertNotice(input: { frame: Ema5Frame; candleTime: number; now: number }): PushNotice {
  return {
    id: ema5AlertId(input.frame, input.candleTime),
    kind: "session",
    title: ema5AlertTitle(input.frame),
    body: "",
    url: `/?symbol=BTCUSD&timeframe=${input.frame}`,
    silent: false,
    expiresAt: input.now + 20 * 60 * 1000,
  };
}
