import type { Candle } from './market.ts';

export type AlgoQuote = {
  instrumentKey: string;
  price: number;
  observedAt: number;
  tradedAt: number;
};

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const timestamp = (value: unknown) => typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;

/** Receipt time must never make an old exchange price eligible for a new fill. */
export function readAlgoQuote(value: unknown, key: string, now: number): AlgoQuote | null {
  if (!object(value) || value.instrumentKey !== key || !positive(value.lastPrice)) return null;
  const observedAt = timestamp(value.updatedAt), tradedAt = timestamp(value.lastTradeAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(tradedAt) ||
      now - observedAt > 20_000 || now - tradedAt > 60_000 ||
      observedAt > now + 2_000 || tradedAt > now + 2_000) return null;
  return { instrumentKey: key, price: value.lastPrice, observedAt, tradedAt };
}

function errorMessage(body: unknown, fallback: string) {
  if (object(body) && object(body.error) && typeof body.error.message === 'string') return body.error.message;
  return fallback;
}

export async function fetchAlgoQuotes(keys: string[], signal: AbortSignal, now = Date.now()): Promise<Record<string, AlgoQuote>> {
  const requested = [...new Set(keys)];
  const response = await fetch(`/api/upstox/quotes?${new URLSearchParams({ keys: requested.join(',') })}`, { cache: 'no-store', signal });
  const body: unknown = await response.json();
  if (!response.ok || !object(body) || body.ok !== true || !object(body.quotes)) throw new Error(errorMessage(body, 'Broker quotes are unavailable. No simulated fill was made.'));
  const quotes: Record<string, AlgoQuote> = {};
  for (const key of requested) {
    const quote = readAlgoQuote(body.quotes[key], key, Math.max(now, Date.now()));
    if (quote) quotes[key] = quote;
  }
  return quotes;
}

export function readAlgoCandles(value: unknown): Candle[] {
  if (!Array.isArray(value) || value.length > 100_000) throw new Error('Invalid candle history.');
  const byTime = new Map<number, Candle>();
  for (const row of value) {
    if (!object(row) || !positive(row.time) || !Number.isInteger(row.time) || !positive(row.open) || !positive(row.high) || !positive(row.low) || !positive(row.close) ||
        row.high < Math.max(row.open, row.close, row.low) || row.low > Math.min(row.open, row.close) ||
        typeof row.volume !== 'number' || !Number.isFinite(row.volume) || row.volume < 0) throw new Error('The provider returned an invalid candle. Test cancelled.');
    const candle = { time: row.time, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume };
    const previous = byTime.get(candle.time);
    if (previous && JSON.stringify(previous) !== JSON.stringify(candle)) throw new Error('Conflicting candles were returned for one timestamp.');
    byTime.set(candle.time, candle);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Exact contracts only. An unavailable option history is never replaced with its underlying. */
export async function fetchAlgoHistory(keys: string[], timeframe: string, date: string | undefined, signal: AbortSignal): Promise<Record<string, Candle[]>> {
  const unique = [...new Set(keys)];
  if (!unique.length || unique.length > 9) throw new Error('Choose between one and eight legs and an optional signal instrument.');
  const seconds = ({ '1m': 60, '5m': 300, '15m': 900 } as Record<string, number>)[timeframe];
  if (!seconds) throw new Error('Algo tests support 1, 5 or 15 minute candles.');
  const result: Record<string, Candle[]> = {};
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, unique.length) }, async () => {
    while (cursor < unique.length) {
      const key = unique[cursor++];
      const query = new URLSearchParams({ instrumentKey: key, timeframe, strict: '1' });
      if (date) query.set('date', date);
      const response = await fetch(`/api/upstox/candles?${query}`, { cache: 'no-store', signal });
      const body: unknown = await response.json();
      if (!response.ok || !object(body) || body.ok !== true) throw new Error(errorMessage(body, `History is unavailable for ${key}.`));
      const candles = readAlgoCandles(body.candles).filter(bar => (bar.time + seconds) * 1000 <= Date.now());
      if (!candles.length) throw new Error(`No candles are available for ${key}. Choose a trading day or try the labelled demo.`);
      result[key] = candles;
    }
  }));
  return result;
}
