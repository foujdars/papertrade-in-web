import type { Candle } from './market';
import { psbbAnalysis, type PsbbSetup } from './psbb.ts';

export const TRADING_WATCHLIST_ID = 'psbb-trading';
export const TRADING_TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H'] as const;
export type TradingTimeframe = typeof TRADING_TIMEFRAMES[number];
export type TradingStatus = 'pending' | 'active' | 'failed' | 'success';
export const PSBB_SCAN_VERSION = 'rsi-peak-level-touch-1r-v5';
export const FRAME_SECONDS: Record<TradingTimeframe, number> = { '1m': 60, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400 };
const DAY = 86400, IST = 19800;
export type TradingSetup = { id: string; status: TradingStatus; setup: PsbbSetup };
export type TradingReport = {
  instrumentKey: string; timeframe: TradingTimeframe; month: string; rows: TradingSetup[];
  counts: Record<TradingStatus, number>; lastCandleAt: number | null; scannedAt: number;
  coverage: 'available' | 'limited'; message?: string;
};

export const emptyTradingCounts = (): Record<TradingStatus, number> => ({ pending: 0, active: 0, failed: 0, success: 0 });
export function indiaMonth(now = Date.now()) { return new Date(now + IST * 1000).toISOString().slice(0, 7); }
export function monthWindow(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [year, m] = month.split('-').map(Number);
  return { start: Date.UTC(year, m - 1, 1) / 1000 - IST, end: Date.UTC(year, m, 1) / 1000 - IST };
}
export function setupStatus(setup: PsbbSetup): TradingStatus {
  if (!setup.shifted) return 'pending';
  return setup.status === 'passed' ? 'success' : setup.status === 'failed' ? 'failed' : 'active';
}
export function monthlySetups(setups: PsbbSetup[], month: string): TradingSetup[] {
  const { start, end } = monthWindow(month);
  return setups.flatMap((setup) => {
    const timestamp = setup.mssTime ?? setup.confirmedTime;
    if (timestamp < start || timestamp >= end) return [];
    return [{ id: `${setup.side}:${setup.firstTime}:${setup.secondTime}:${setup.mssTime ?? 'pending'}`, status: setupStatus(setup), setup }];
  });
}
// An NSE session's final 4H/1H candle closes at 15:30, even if its normal
// duration would extend beyond the session. No forming candles enter reports.
export function nseCandleEnd(time: number, timeframe: TradingTimeframe) {
  const dayStart = Math.floor((time + IST) / DAY) * DAY - IST;
  return Math.min(time + FRAME_SECONDS[timeframe], dayStart + 15.5 * 3600);
}
export function psbbHistoryPlan(month: string, timeframe: TradingTimeframe, now = Date.now()) {
  const { start, end } = monthWindow(month);
  if (month < '2022-01' || month > indiaMonth(now)) throw new Error('Choose a month from January 2022 through this month.');
  const cutoff = Math.min(end, now / 1000);
  const warmupDays = timeframe === '4H' ? 120 : timeframe === '1H' ? 45 : 14;
  const from = Math.max(Date.parse('2022-01-01T00:00:00+05:30') / 1000, start - warmupDays * DAY);
  const to = Math.floor((cutoff - 1 + IST) / DAY) * DAY - IST;
  const date = (seconds: number) => new Date((seconds + IST) * 1000).toISOString().slice(0, 10);
  // Upstox allows one month per request for 1–15m and a quarter for hours.
  // Conservative fixed windows avoid variable month lengths and overlap.
  const days = timeframe.endsWith('H') ? 80 : 28;
  const chunks: Array<{ from: string; to: string }> = [];
  for (let cursor = from; cursor <= to; cursor += days * DAY) chunks.push({ from: date(cursor), to: date(Math.min(to, cursor + (days - 1) * DAY)) });
  return { start, end, cutoff, chunks, currentMonth: month === indiaMonth(now), unit: timeframe.endsWith('H') ? 'hours' : 'minutes', interval: String(parseInt(timeframe, 10)) };
}

export function buildTradingReport(instrumentKey: string, timeframe: TradingTimeframe, month: string, candles: Candle[], inputs: Record<string, number> = {}, now = Date.now()): TradingReport {
  const { start, cutoff } = psbbHistoryPlan(month, timeframe, now);
  const unique = new Map(candles.map((bar) => [bar.time, bar]));
  const closed = [...unique.values()].filter((bar) => bar.time < cutoff && nseCandleEnd(bar.time, timeframe) <= cutoff).sort((a, b) => a.time - b.time);
  const rows = monthlySetups(psbbAnalysis(closed, inputs, timeframe, true).setups, month);
  const counts = emptyTradingCounts();
  rows.forEach((row) => { counts[row.status] += 1; });
  const warmup = closed.filter((bar) => bar.time < start).length;
  const limited = warmup < Math.max(50, (inputs.length || 14) * 5) || !closed.some((bar) => bar.time >= start);
  return { instrumentKey, timeframe, month, rows, counts, lastCandleAt: closed.at(-1)?.time ?? null, scannedAt: now, coverage: limited ? 'limited' : 'available', ...(limited ? { message: 'Limited history or RSI warm-up; counts may be incomplete.' } : {}) };
}
