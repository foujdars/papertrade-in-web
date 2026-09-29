import "server-only";
import { upstoxFetch } from "@/lib/upstox-server";
import { rankVolumeBreakouts, type HistoricalVolumePoint, type VolumeBreakoutCandidate, type VolumeBreakoutRow } from "@/lib/volume-breakout";
import { indiaClock } from "@/lib/notification-policy";
import { pickHistoryKeys, type ShockerInstrument } from "@/lib/volume-shocker-alerts";

type UpstoxQuote = {
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  net_change?: number;
  volume?: number;
  timestamp?: string;
  last_trade_time?: string;
  ohlc?: { close?: number };
};
type UpstoxQuotePayload = { data?: Record<string, UpstoxQuote> };
type UpstoxCandlePayload = { data?: { candles?: Array<[string | number, number, number, number, number, number?]> } };

const HISTORY_BATCH_SIZE = 15;
const volumeHistoryCache = new Map<string, { sessionDate: string; expiresAt: number; points: HistoricalVolumePoint[] }>();

function indiaDay(value: Date | number | string) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return indiaClock(Number.isFinite(time) ? time : Date.now()).day;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadVolumeHistory(candidate: VolumeBreakoutCandidate) {
  const cached = volumeHistoryCache.get(candidate.instrumentKey);
  if (cached && cached.sessionDate === candidate.sessionDate && cached.expiresAt > Date.now()) return cached.points;
  const fromDate = indiaDay(Date.now() - 50 * 86_400_000);
  const payload = await upstoxFetch<UpstoxCandlePayload>(`/v3/historical-candle/${encodeURIComponent(candidate.instrumentKey)}/days/1/${candidate.sessionDate}/${fromDate}`);
  const points = (payload.data?.candles ?? []).flatMap((candle): HistoricalVolumePoint[] => {
    const volume = Number(candle[5]);
    if (!Number.isFinite(volume) || volume < 0) return [];
    return [{ date: indiaDay(candle[0]), volume }];
  });
  volumeHistoryCache.set(candidate.instrumentKey, { sessionDate: candidate.sessionDate, expiresAt: Date.now() + 6 * 60 * 60_000, points });
  return points;
}

export type ShockerQuote = ShockerInstrument & { changePercent: number; todayVolume: number; sessionDate: string };

export async function scanWatchlistShockers(instruments: readonly ShockerInstrument[], options?: { maxHistories?: number; skipHistoryKeys?: ReadonlySet<string> }) {
  const requested = instruments.filter((item) => item.symbol && item.instrumentKey);
  if (!requested.length) return { rows: [] as VolumeBreakoutRow[], checkedKeys: [] as string[], quotes: [] as ShockerQuote[] };
  const quotes: ShockerQuote[] = [];
  const candidates: VolumeBreakoutCandidate[] = [];
  for (let offset = 0; offset < requested.length; offset += 500) {
    const batch = requested.slice(offset, offset + 500);
    const params = new URLSearchParams({ instrument_key: batch.map((item) => item.instrumentKey).join(",") });
    const payload = await upstoxFetch<UpstoxQuotePayload>(`/v2/market-quote/quotes?${params}`);
    const byKey = new Map(batch.map((item) => [item.instrumentKey, item]));
    const bySymbol = new Map(batch.map((item) => [item.symbol, item]));
    for (const quote of Object.values(payload.data ?? {})) {
      const instrumentKey = quote.instrument_token ?? "";
      const symbol = quote.symbol?.trim().toUpperCase() ?? "";
      const item = byKey.get(instrumentKey) ?? bySymbol.get(symbol);
      const lastPrice = Number(quote.last_price);
      const netChange = Number(quote.net_change);
      const previousClose = Number.isFinite(netChange) ? lastPrice - netChange : Number(quote.ohlc?.close);
      const todayVolume = Number(quote.volume);
      if (!item || !Number.isFinite(lastPrice) || !Number.isFinite(previousClose) || !Number.isFinite(todayVolume)) continue;
      const quoteTimestamp = quote.timestamp || (Number.isFinite(Number(quote.last_trade_time)) ? Number(quote.last_trade_time) : Date.now());
      const sessionDate = indiaDay(quoteTimestamp);
      const changePercent = previousClose > 0 ? ((lastPrice - previousClose) / previousClose) * 100 : 0;
      quotes.push({ ...item, symbol: item.symbol, changePercent, todayVolume, sessionDate });
      candidates.push({ ...item, symbol: item.symbol, name: item.name || item.symbol, lastPrice, previousClose, todayVolume, sessionDate });
    }
  }
  const cached = new Set(candidates.filter((candidate) => {
    const saved = volumeHistoryCache.get(candidate.instrumentKey);
    return Boolean(saved && saved.sessionDate === candidate.sessionDate && saved.expiresAt > Date.now());
  }).map((candidate) => candidate.instrumentKey));
  const selected = new Set(pickHistoryKeys(quotes, { cached, skip: options?.skipHistoryKeys, limit: options?.maxHistories ?? candidates.length }));
  const history = new Map<string, HistoricalVolumePoint[]>();
  for (const candidate of candidates) {
    const saved = volumeHistoryCache.get(candidate.instrumentKey);
    if (saved && saved.sessionDate === candidate.sessionDate && saved.expiresAt > Date.now()) history.set(candidate.symbol, saved.points);
  }
  const pending = candidates.filter((candidate) => selected.has(candidate.instrumentKey));
  const checkedKeys: string[] = [];
  for (let offset = 0; offset < pending.length; offset += HISTORY_BATCH_SIZE) {
    const batch = pending.slice(offset, offset + HISTORY_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((candidate) => loadVolumeHistory(candidate)));
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      history.set(batch[index].symbol, result.value);
      checkedKeys.push(batch[index].instrumentKey);
    });
    if (offset + HISTORY_BATCH_SIZE < pending.length) await delay(1_050);
  }
  return { rows: rankVolumeBreakouts(candidates, history, Math.max(candidates.length, 1)), checkedKeys, quotes };
}
