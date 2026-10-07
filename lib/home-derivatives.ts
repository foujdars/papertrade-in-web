import type { OptionChainRow } from './fno.ts';
import type { NseSession } from './market-hours.ts';
import { nseDate } from './market-hours.ts';

export function oiSummary(rows: OptionChainRow[]) {
  const point = (data: OptionChainRow['call']) => {
    if (!data || data.marketData.oiAvailable === false || !Number.isFinite(data.marketData.oi) || data.marketData.oi < 0) return { oi: null, change: null };
    const oi = data.marketData.oi, prev = data.marketData.prevOi;
    return { oi, change: typeof prev === 'number' && Number.isFinite(prev) && prev >= 0 ? oi - prev : null };
  };
  const strikes = rows.filter(row => Number.isFinite(row.strikePrice) && row.strikePrice > 0).map(row => ({ strike: row.strikePrice, call: point(row.call), put: point(row.put) })).sort((a,b) => a.strike-b.strike);
  const total = (side: 'call' | 'put', field: 'oi' | 'change') => strikes.length && strikes.every(row => row[side][field] !== null) ? strikes.reduce((sum,row) => sum + row[side][field]!,0) : null;
  const callOi = total('call','oi'), putOi = total('put','oi');
  return { strikes, callOi, putOi, callChange: total('call','change'), putChange: total('put','change'), pcr: callOi !== null && callOi > 0 && putOi !== null ? putOi / callOi : null };
}
export type DailyClose = { price: number; date: string };
export function completedFutureClose(candles: unknown, now: Date, session: NseSession | null): DailyClose | null {
  if (!Array.isArray(candles)) return null;
  const today = nseDate(now);
  const todayEnded = session?.date === today && session.sessions.length > 0 && session.sessions.every(window => Number.isFinite(window.start) && Number.isFinite(window.end) && window.end > window.start && nseDate(new Date(window.start)) === today && window.end <= +now);
  const completed = candles.flatMap(row => {
    if (!Array.isArray(row)) return [];
    const time = Date.parse(row[0]), price = Number(row[4]);
    if (!Number.isFinite(time) || !Number.isFinite(price) || price <= 0) return [];
    const date = nseDate(new Date(time));
    return date < today || date === today && todayEnded ? [{ price, date, time }] : [];
  }).sort((a,b) => b.time-a.time);
  const last = completed[0];
  return last ? { price: last.price, date: last.date } : null;
}
export type GiftSnapshot = { gift: { price: number; asOf: string } | null; futureClose: DailyClose | null; checkedAt: string; futureKey?: string };
