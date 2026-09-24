import { NSE_HOLIDAYS } from "./nse-holidays.ts";
import type { PushNotice } from "./notification-policy.ts";

export const SESSION_OPEN_WINDOW_MINUTES = 3;

export const MARKET_SESSIONS = [
  { id: "sydney", name: "Sydney", timeZone: "Australia/Sydney", openHour: 7, openMinute: 0, closeHour: 16, closeMinute: 0, color: "rgba(14,165,164,0.14)" },
  { id: "tokyo", name: "Tokyo", timeZone: "Asia/Tokyo", openHour: 9, openMinute: 0, closeHour: 18, closeMinute: 0, color: "rgba(59,130,246,0.13)" },
  { id: "india", name: "India", timeZone: "Asia/Kolkata", openHour: 9, openMinute: 15, closeHour: 15, closeMinute: 30, color: "rgba(245,158,11,0.16)" },
  { id: "london", name: "London", timeZone: "Europe/London", openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0, color: "rgba(117,59,206,0.13)" },
  { id: "newyork", name: "New York", timeZone: "America/New_York", openHour: 8, openMinute: 0, closeHour: 17, closeMinute: 0, color: "rgba(16,185,129,0.14)" },
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

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** UTC instant of a wall-clock time in `timeZone`. Opens are away from daylight-saving transitions. */
export function zonedInstant(dateKey: string, hour: number, minute: number, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const local = zonedParts(new Date(guess), timeZone);
  const [localYear, localMonth, localDay] = local.date.split("-").map(Number);
  const actual = Date.UTC(localYear, localMonth - 1, localDay, Math.floor(local.minutes / 60), local.minutes % 60);
  return guess + (guess - actual);
}

function isSessionDay(session: (typeof MARKET_SESSIONS)[number], dateKey: string, openMs: number) {
  const weekday = zonedParts(new Date(openMs), session.timeZone).weekday;
  if (weekday === "Sat" || weekday === "Sun") return false;
  return session.id !== "india" || !NSE_HOLIDAYS[dateKey];
}

export type SessionInterval = { id: MarketSessionId; name: string; start: number; end: number; color: string };

export function sessionIntervals(fromMs: number, toMs: number): SessionInterval[] {
  const intervals: SessionInterval[] = [];
  for (const session of MARKET_SESSIONS) {
    const first = zonedParts(new Date(fromMs - 36 * 3_600_000), session.timeZone).date;
    const last = zonedParts(new Date(toMs + 36 * 3_600_000), session.timeZone).date;
    for (let date = first; date <= last; date = addDays(date, 1)) {
      const start = zonedInstant(date, session.openHour, session.openMinute, session.timeZone);
      const end = zonedInstant(date, session.closeHour, session.closeMinute, session.timeZone);
      if (!isSessionDay(session, date, start) || end <= fromMs || start >= toMs) continue;
      intervals.push({ id: session.id, name: session.name, start, end, color: session.color });
    }
  }
  return intervals;
}

export type SessionSnapshot = {
  id: MarketSessionId;
  name: string;
  color: string;
  open: boolean;
  opensAt: number;
  closesAt: number;
  label: string;
  period: string;
};

function istClock(ms: number) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function sessionPeriod(start: number, end: number) {
  return `${istClock(start)}–${istClock(end)}`;
}

function lead(now: number, at: number) {
  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).format(new Date(at));
}

function upcomingOpen(session: (typeof MARKET_SESSIONS)[number], now: number) {
  const today = zonedParts(new Date(now), session.timeZone).date;
  for (let day = 0; day < 12; day += 1) {
    const date = addDays(today, day);
    const start = zonedInstant(date, session.openHour, session.openMinute, session.timeZone);
    const end = zonedInstant(date, session.closeHour, session.closeMinute, session.timeZone);
    if (!isSessionDay(session, date, start) || end <= now) continue;
    return { start, end, open: start <= now };
  }
  return null;
}

export function sessionBoard(now: number): SessionSnapshot[] {
  return MARKET_SESSIONS.flatMap((session) => {
    const next = upcomingOpen(session, now);
    if (!next) return [];
    return [{
      id: session.id,
      name: session.name,
      color: session.color,
      open: next.open,
      opensAt: next.start,
      closesAt: next.end,
      label: next.open ? "Open" : lead(now, next.start),
      period: sessionPeriod(next.start, next.end),
    }];
  }).sort((a, b) => Number(b.open) - Number(a.open) || a.opensAt - b.opensAt);
}

export function sessionChipLabel(now: number) {
  const board = sessionBoard(now);
  const open = board.filter((item) => item.open);
  const next = board.find((item) => !item.open);
  if (!open.length) return next ? `${next.name} ${next.label}` : "Markets closed";
  const names = open.slice(0, 2).map((item) => item.name).join(", ");
  const extra = open.length > 2 ? ` +${open.length - 2}` : "";
  return next ? `${names}${extra} open · ${next.name} ${next.label}` : `${names}${extra} open`;
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
