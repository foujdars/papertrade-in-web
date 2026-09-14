import { NSE_HOLIDAYS } from "./nse-holidays.ts";

export type NseSession = { date: string; checkedAt: number; status: string; sessions: Array<{ start: number; end: number }>; source: string };
export function nseDate(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
// Preserve the existing 30-minute intraday square-off buffer relative to the dated session close.
export function nseSquareOffMinute(date: Date, session: NseSession | null) {
  if (!session || session.date !== nseDate(date) || !session.sessions.length) return 15 * 60;
  const window = session.sessions.find(s => s.end > date.getTime()) ?? session.sessions.at(-1)!;
  const cutoff = new Date(Math.max(window.start, window.end - 30 * 60_000));
  const parts = indiaParts(cutoff);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export type NseMarketStatus = {
  isOpen: boolean;
  isTradingDay: boolean;
  minutesFromMidnight: number;
  message: string;
};

const NSE_OPEN_MINUTE = 9 * 60 + 15;
const NSE_CLOSE_MINUTE = 15 * 60 + 30;

function indiaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function getNseMarketStatus(date = new Date(), session?: NseSession | null): NseMarketStatus {
  const parts = indiaParts(date);
  const holiday = NSE_HOLIDAYS[nseDate(date)];
  const isTradingDay = !holiday && parts.weekday !== "Sat" && parts.weekday !== "Sun";
  const minutesFromMidnight = Number(parts.hour) * 60 + Number(parts.minute);
  if (session !== undefined) {
    const fresh = session && session.date === nseDate(date) && date.getTime() - session.checkedAt < 75_000 && session.checkedAt - date.getTime() < 30_000;
    const active = fresh ? session.sessions.find(s => date.getTime() >= s.start && date.getTime() < s.end) : undefined;
    const isOpen = Boolean(active && session?.status === "NORMAL_OPEN");
    return { isOpen, isTradingDay: Boolean(fresh && session.sessions.length), minutesFromMidnight,
      message: isOpen ? "NSE is open · Intraday orders enabled" : holiday && !active ? `NSE holiday · ${holiday} · Trading disabled` : !fresh || session?.status === "UNAVAILABLE" ? "Checking NSE session · Trading temporarily disabled" : "NSE session closed · Trading disabled" };
  }
  const isOpen =
    isTradingDay &&
    minutesFromMidnight >= NSE_OPEN_MINUTE &&
    minutesFromMidnight < NSE_CLOSE_MINUTE;

  let message = "NSE is open · Intraday orders enabled";
  if (holiday) {
    message = `NSE holiday · ${holiday} · Intraday orders disabled`;
  } else if (!isTradingDay) {
    message = "NSE is closed for the weekend · Intraday orders disabled";
  } else if (minutesFromMidnight < NSE_OPEN_MINUTE) {
    message = "NSE opens at 09:15 IST · Intraday orders disabled";
  } else if (minutesFromMidnight >= NSE_CLOSE_MINUTE) {
    message = "NSE closed at 15:30 IST · Intraday orders disabled";
  }

  return { isOpen, isTradingDay, minutesFromMidnight, message };
}
