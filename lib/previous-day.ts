import type { Candle } from "./market";

const IST_OFFSET_SECONDS = 19_800;
const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;

export type PreviousDayLevels = { date: string; high: number; low: number; close: number };

function istDate(epochSeconds: number) {
  return new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

function istMinutes(epochSeconds: number) {
  const clock = new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000);
  return clock.getUTCHours() * 60 + clock.getUTCMinutes();
}

function timeframeSeconds(timeframe: string) {
  const match = /^(\d+)([mh])$/i.exec(timeframe);
  if (!match) return timeframe === "1D" ? 86_400 : null;
  return Number(match[1]) * (match[2].toLowerCase() === "h" ? 3600 : 60);
}

/** Yesterday's high, low and close. NSE uses the cash session; other markets use the full IST day. */
export function previousDayLevels(candles: Pick<Candle, "time" | "high" | "low" | "close">[], timeframe: string, session = true): PreviousDayLevels | null {
  if (["1W", "1M", "1Y"].includes(timeframe)) return null;
  const step = timeframeSeconds(timeframe);
  if (step === null) return null;
  const rows = candles.filter((candle) => [candle.time, candle.high, candle.low, candle.close].every(Number.isFinite));
  if (rows.length < 2) return null;
  const today = istDate(rows.at(-1)!.time);
  const dates = [...new Set(rows.map((candle) => istDate(candle.time)))].filter((date) => date < today);
  const date = dates.at(-1);
  if (!date) return null;
  let day = rows.filter((candle) => istDate(candle.time) === date);
  if (timeframe !== "1D") {
    if (session) {
      day = day.filter((candle) => {
        const minutes = istMinutes(candle.time);
        return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
      });
      if (!day.length) return null;
      const first = istMinutes(day[0].time);
      const last = istMinutes(day.at(-1)!.time);
      if (first > OPEN_MINUTE + step / 60 || last + step / 60 < CLOSE_MINUTE - 15) return null;
    } else if (day.at(-1)!.time - day[0].time < 20 * 3600) return null;
  }
  return {
    date,
    high: Math.max(...day.map((candle) => candle.high)),
    low: Math.min(...day.map((candle) => candle.low)),
    close: day.at(-1)!.close,
  };
}
