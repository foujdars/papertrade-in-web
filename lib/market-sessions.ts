import { NSE_HOLIDAYS } from "./nse-holidays.ts";
import type { PushNotice } from "./notification-policy.ts";

export const SESSION_OPEN_WINDOW_MINUTES = 3;

export const MARKET_SESSIONS = [
  { id: "sydney", name: "Sydney", timeZone: "Australia/Sydney", openHour: 7, openMinute: 0 },
  { id: "tokyo", name: "Tokyo", timeZone: "Asia/Tokyo", openHour: 9, openMinute: 0 },
  { id: "india", name: "India", timeZone: "Asia/Kolkata", openHour: 9, openMinute: 15 },
  { id: "london", name: "London", timeZone: "Europe/London", openHour: 8, openMinute: 0 },
  { id: "newyork", name: "New York", timeZone: "America/New_York", openHour: 8, openMinute: 0 },
] as const;

export type MarketSessionId = (typeof MARKET_SESSIONS)[number]["id"];

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: get("weekday"), date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

function clockLabel(hour: number, minute: number) {
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** One notice for a session that opened in the last few minutes. Weekends and NSE holidays are skipped. */
export function sessionOpenNotice(now: number): PushNotice | null {
  const date = new Date(now);
  for (const session of MARKET_SESSIONS) {
    const local = zonedParts(date, session.timeZone);
    if (local.weekday === "Sat" || local.weekday === "Sun") continue;
    if (session.id === "india" && NSE_HOLIDAYS[local.date]) continue;
    const open = session.openHour * 60 + session.openMinute;
    if (local.minutes < open || local.minutes >= open + SESSION_OPEN_WINDOW_MINUTES) continue;
    const ist = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(date);
    return {
      id: `session-${session.id}-${local.date}`,
      kind: "session",
      title: `${session.name} session is open`,
      body: `${session.name} opened at ${clockLabel(session.openHour, session.openMinute)} local time. It is ${ist} IST.`,
      url: "/",
      expiresAt: now + 30 * 60_000,
      silent: false,
    };
  }
  return null;
}
