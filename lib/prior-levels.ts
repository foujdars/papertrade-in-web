import type { Candle } from "./market";

const IST_OFFSET_SECONDS = 19_800;

type Bar = Pick<Candle, "time" | "open" | "high" | "low" | "close">;
export type PriorTone = "day" | "week" | "month" | "year" | "custom";
export type PriorMark = { id: string; label: string; price: number; time: number; tone: PriorTone };
export type PriorOptions = { day: boolean; week: boolean; month: boolean; year: boolean; custom: number; high: boolean; low: boolean; open: boolean; close: boolean };

const DEFAULTS: PriorOptions = { day: true, week: true, month: true, year: false, custom: 0, high: true, low: true, open: false, close: false };

export function priorOptionsFromInputs(inputs?: Record<string, number>): PriorOptions {
  if (!inputs || !("day" in inputs)) return DEFAULTS;
  const on = (key: "day" | "week" | "month" | "year" | "high" | "low" | "open" | "close") => inputs[key] !== 0;
  return { day: on("day"), week: on("week"), month: on("month"), year: on("year"), custom: Math.max(0, Math.floor(inputs.custom || 0)), high: on("high"), low: on("low"), open: on("open"), close: on("close") };
}

function istDate(epochSeconds: number) {
  return new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
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

function previousFinancialYear(today: string) {
  const [year, month] = today.split("-").map(Number);
  const endYear = month >= 4 ? year : year - 1;
  return { start: `${endYear - 1}-04-01`, end: `${endYear}-03-31` };
}

function between(rows: Bar[], start: string, end: string) {
  return rows.filter((candle) => { const date = istDate(candle.time); return date >= start && date <= end; });
}

function marksFor(prefix: string, tone: PriorTone, bars: Bar[], options: PriorOptions): PriorMark[] {
  if (!bars.length) return [];
  const marks: PriorMark[] = [];
  if (options.high) {
    const bar = bars.reduce((best, candle) => candle.high > best.high ? candle : best);
    marks.push({ id: `${prefix}H`, label: `${prefix}H`, price: bar.high, time: bar.time, tone });
  }
  if (options.low) {
    const bar = bars.reduce((best, candle) => candle.low < best.low ? candle : best);
    marks.push({ id: `${prefix}L`, label: `${prefix}L`, price: bar.low, time: bar.time, tone });
  }
  if (options.open) {
    const bar = bars[0];
    marks.push({ id: `${prefix}O`, label: `${prefix}O`, price: bar.open, time: bar.time, tone });
  }
  if (options.close) {
    const bar = bars.at(-1)!;
    marks.push({ id: `${prefix}C`, label: `${prefix}C`, price: bar.close, time: bar.time, tone });
  }
  return marks;
}

/** Levels from daily candles. Each mark keeps the time of the candle that printed it. */
export function priorMarks(candles: Bar[], options: PriorOptions = DEFAULTS): PriorMark[] {
  const rows = candles.filter((candle) => [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)).slice().sort((a, b) => a.time - b.time);
  if (rows.length < 2) return [];
  const today = istDate(rows.at(-1)!.time);
  const past = rows.filter((candle) => istDate(candle.time) < today);
  if (!past.length) return [];
  const marks: PriorMark[] = [];
  if (options.day) {
    const date = istDate(past.at(-1)!.time);
    marks.push(...marksFor("PD", "day", past.filter((candle) => istDate(candle.time) === date), options));
  }
  if (options.week) {
    const start = addDays(weekStart(today), -7);
    marks.push(...marksFor("PW", "week", between(past, start, addDays(start, 6)), options));
  }
  if (options.month) {
    const start = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
    marks.push(...marksFor("PM", "month", between(past, start, addDays(`${today.slice(0, 7)}-01`, -1)), options));
  }
  if (options.year) {
    const year = previousFinancialYear(today);
    marks.push(...marksFor("FY", "year", between(past, year.start, year.end), options));
  }
  if (options.custom > 0) {
    const bar = past.at(-options.custom);
    if (bar) marks.push(...marksFor(String(options.custom), "custom", [bar], options));
  }
  return marks;
}
