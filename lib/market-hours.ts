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

export function getNseMarketStatus(date = new Date()): NseMarketStatus {
  const parts = indiaParts(date);
  const isTradingDay = parts.weekday !== "Sat" && parts.weekday !== "Sun";
  const minutesFromMidnight = Number(parts.hour) * 60 + Number(parts.minute);
  const isOpen =
    isTradingDay &&
    minutesFromMidnight >= NSE_OPEN_MINUTE &&
    minutesFromMidnight < NSE_CLOSE_MINUTE;

  let message = "NSE is open · Intraday orders enabled";
  if (!isTradingDay) {
    message = "NSE is closed for the weekend · Intraday orders disabled";
  } else if (minutesFromMidnight < NSE_OPEN_MINUTE) {
    message = "NSE opens at 09:15 IST · Intraday orders disabled";
  } else if (minutesFromMidnight >= NSE_CLOSE_MINUTE) {
    message = "NSE closed at 15:30 IST · Intraday orders disabled";
  }

  return { isOpen, isTradingDay, minutesFromMidnight, message };
}
