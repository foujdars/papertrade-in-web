import type { Candle } from "./market";
import { previousDayLevels } from "./previous-day.ts";

const IST_OFFSET_SECONDS = 19_800;
const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;

type Bar = Pick<Candle, "time" | "high" | "low" | "close">;
export type PriorSpan = { high: number; low: number };
export type PriorLevels = { day: PriorSpan | null; week: PriorSpan | null; month: PriorSpan | null };

function istDate(epochSeconds: number) {
  return new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

function istMinutes(epochSeconds: number) {
  const clock = new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function weekStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - weekday + 1);
  return utc.toISOString().slice(0, 10);
}

function span(bars: Bar[]): PriorSpan {
  return { high: Math.max(...bars.map((bar) => bar.high)), low: Math.min(...bars.map((bar) => bar.low)) };
}

/** Previous completed day, week and month highs and lows, in IST. A period is used only when the loaded candles start on or before it. */
export function priorHighLows(candles: Bar[], timeframe: string, session = true): PriorLevels | null {
  if (timeframe === "1Y") return null;
  const rows = candles.filter((candle) => [candle.time, candle.high, candle.low, candle.close].every(Number.isFinite));
  if (rows.length < 2) return null;
  const today = istDate(rows.at(-1)!.time);
  const first = istDate(rows[0].time);
  const intraday = !["1D", "1W", "1M"].includes(timeframe);
  const source = intraday && session ? rows.filter((candle) => { const minutes = istMinutes(candle.time); return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE; }) : rows;
  const dayLevels = timeframe === "1W" || timeframe === "1M" ? null : previousDayLevels(rows, timeframe, session);
  const day = dayLevels ? { high: dayLevels.high, low: dayLevels.low } : null;

  let week: PriorSpan | null = null;
  let month: PriorSpan | null = null;
  if (timeframe === "1W") {
    const current = weekStart(today);
    const previous = [...source].reverse().find((candle) => istDate(candle.time) < current);
    week = previous ? { high: previous.high, low: previous.low } : null;
  } else if (timeframe !== "1M") {
    const current = weekStart(today);
    const start = addDays(current, -7);
    const end = addDays(current, -1);
    const bars = source.filter((candle) => { const date = istDate(candle.time); return date >= start && date <= end; });
    if (first <= start && bars.length) week = span(bars);
  }
  if (timeframe === "1M") {
    const previous = source.slice(0, -1).at(-1);
    month = previous ? { high: previous.high, low: previous.low } : null;
  } else {
    const start = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
    const end = addDays(`${today.slice(0, 7)}-01`, -1);
    const bars = source.filter((candle) => { const date = istDate(candle.time); return date >= start && date <= end; });
    if (first <= start && bars.length) month = span(bars);
  }
  if (!day && !week && !month) return null;
  return { day, week, month };
}
