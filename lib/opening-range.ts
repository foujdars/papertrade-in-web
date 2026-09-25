import type { Candle } from "./market";

const IST_OFFSET_SECONDS = 19_800;
const OPEN_MINUTE = 9 * 60 + 15;
const RANGE_END_MINUTE = 9 * 60 + 30;

export type OpeningRangeBox = {
  date: string;
  high: number;
  low: number;
  start: number;
  end: number;
  extend: number;
  complete: boolean;
};

export function timeframeSeconds(timeframe: string) {
  const match = /^(\d+)([mh])$/i.exec(timeframe);
  if (!match) return null;
  return Number(match[1]) * (match[2].toLowerCase() === "h" ? 3600 : 60);
}

export function openingRangeSupported(timeframe: string) {
  const step = timeframeSeconds(timeframe);
  return step !== null && step > 0 && step <= 15 * 60;
}

function istDate(epochSeconds: number) {
  return new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

function istMinutes(epochSeconds: number) {
  const clock = new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

export function istClockToEpoch(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) / 1000 - IST_OFFSET_SECONDS;
}

/** High and low of the 9:15–9:30 IST window, extended to 15:30 once that window has closed. */
export function openingRanges(candles: Pick<Candle, "time" | "high" | "low">[], timeframe: string): OpeningRangeBox[] {
  const step = timeframeSeconds(timeframe);
  if (step === null || step <= 0 || step > 15 * 60) return [];
  const groups = new Map<string, OpeningRangeBox>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.time) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low)) continue;
    const minutes = istMinutes(candle.time);
    if (minutes < OPEN_MINUTE || minutes >= RANGE_END_MINUTE) continue;
    const date = istDate(candle.time);
    const current = groups.get(date);
    if (!current) {
      groups.set(date, {
        date,
        high: candle.high,
        low: candle.low,
        start: candle.time,
        end: istClockToEpoch(date, 9, 30),
        extend: istClockToEpoch(date, 15, 30),
        complete: false,
      });
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.start = Math.min(current.start, candle.time);
    }
  }
  for (const range of groups.values()) {
    const covered = candles.some((candle) => istDate(candle.time) === range.date && candle.time + step >= range.end && istMinutes(candle.time) >= OPEN_MINUTE);
    range.complete = covered;
  }
  return [...groups.values()];
}
