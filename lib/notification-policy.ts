import type { IpoSummary } from "./ipo";
import type { IpoAllotment } from "./ipo-allotment";

export type NotificationPreferences = { ipo: boolean; allotment: boolean; trades: boolean; reviews: boolean; practice: boolean; sessions: boolean; hideAmounts: boolean; pausedUntil: number };
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = { ipo: true, allotment: true, trades: true, reviews: true, practice: true, sessions: true, hideAmounts: false, pausedUntil: 0 };
export type PushNotice = { id: string; title: string; body: string; url: string; kind: "ipo" | "allotment" | "portfolio" | "practice" | "trade" | "session"; expiresAt: number; silent: boolean };
const SHADE_LIMIT = 42;
export function shadeChoice(emoji: string, options: string[]) {
  const prefix = `${emoji} `;
  const text = options.find(option => option && prefix.length + option.length <= SHADE_LIMIT) ?? options.find(Boolean) ?? "";
  if (prefix.length + text.length <= SHADE_LIMIT) return prefix + text;
  return `${prefix}${text.slice(0, Math.max(0, SHADE_LIMIT - prefix.length - 1)).trimEnd()}…`;
}
export function shortIpoName(name: string) {
  return name.replace(/\s+IPO$/i, "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+(Limited|Ltd\.?|Private|Pvt\.?)$/i, "").replace(/\s+/g, " ").trim();
}
export function formatAlertPrice(price: number) {
  const rounded = Math.round(price * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
const gmpTag = (percent: number) => `GMP ${percent > 0 ? "+" : ""}${Math.abs(percent) >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10}%`;
export const priceHitTitle = (symbol: string, price?: number) => shadeChoice("💰", [Number.isFinite(price) && price! > 0 ? `${symbol} hit ₹${formatAlertPrice(price!)}` : "", `${symbol} hit your price`].filter(Boolean));
export const fillTitle = (symbol: string, price: number) => shadeChoice("✅", [`${symbol} filled at ₹${formatAlertPrice(price)}`, `${symbol} order filled`]);
export const setupTitle = (symbol: string, timeframe?: string) => shadeChoice("📈", [timeframe ? `${symbol} ${timeframe} setup confirmed` : "", `${symbol} setup confirmed`].filter(Boolean));
export const emaTitle = (symbol: string, timeframe?: string) => shadeChoice("📈", [timeframe ? `${symbol} ${timeframe} touched 21 EMA` : "", `${symbol} touched 21 EMA`].filter(Boolean));
export const divergenceTitle = (symbol: string, timeframe?: string) => shadeChoice("⚡", [timeframe ? `${symbol} ${timeframe} divergence` : "", `${symbol} divergence`].filter(Boolean));
export const levelHitTitle = (symbol: string) => shadeChoice("💰", [`${symbol} hit your level`]);
export function notificationPreferences(value: unknown): NotificationPreferences {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(([key, fallback]) => [key, key === "pausedUntil" ? typeof input[key] === "number" && Number.isFinite(input[key]) ? Math.max(0, Math.min(input[key] as number, Date.now() + 7 * 86400000)) : 0 : typeof input[key] === "boolean" ? input[key] : fallback])) as NotificationPreferences;
}
export function indiaClock(now: number) {
  const shifted = new Date(now + 330 * 60000);
  return { day: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
}
export function quietTime(now: number) { const { minutes } = indiaClock(now); return minutes >= 1260 || minutes < 480; }
export function notificationSlot(now: number) {
  const { minutes } = indiaClock(now);
  if (minutes >= 545 && minutes < 555) return "morning";
  if (minutes >= 810 && minutes < 820) return "closing";
  return null; // Never deliver missed digests when a device comes online later.
}
export function freshGmp(ipo: IpoSummary, now: number) {
  const updated = Date.parse(ipo.gmpUpdatedAt);
  return ipo.gmpPercent !== null && Number.isFinite(ipo.gmpPercent) && updated <= now && now - updated <= 36 * 3600000;
}
export function ipoDigest(ipos: IpoSummary[], now: number): PushNotice | null {
  const slot = notificationSlot(now), { day } = indiaClock(now);
  if (!slot) return null;
  const open = ipos.filter(ipo => ipo.status === "open" && ipo.biddingStartDate <= day && ipo.biddingEndDate >= day);
  const closing = open.filter(ipo => ipo.biddingEndDate === day && (slot === "morning" || !ipo.details?.dailyEndTime || ipo.details.dailyEndTime > "13:30:00"));
  const rows = (slot === "closing" ? closing : open.filter(ipo => closing.includes(ipo) || (freshGmp(ipo, now) && ipo.gmpPercent! >= 15)))
    .sort((a,b) => Number(b.biddingEndDate === day) - Number(a.biddingEndDate === day) || (b.gmpPercent ?? -Infinity) - (a.gmpPercent ?? -Infinity));
  if (!rows.length) return null;
  const name = shortIpoName(rows[0].name);
  const count = rows.length;
  const gmp = freshGmp(rows[0], now) && rows[0].gmpPercent !== null ? gmpTag(rows[0].gmpPercent!) : "";
  const title = slot === "closing"
    ? shadeChoice("⏳", count === 1 ? [`${name} bidding closes today`, `${name} closes today`] : [`${count} IPOs close today · ${name}`, `${count} IPOs close today`])
    : rows[0].biddingEndDate === day
      ? shadeChoice("⏳", count === 1 ? [`${name} bidding closes today`, `${name} closes today`] : [`${name} closes today · ${count - 1} more open`, `${name} closes today`])
      : shadeChoice("👀", count === 1 ? [gmp ? `${name} open · ${gmp}` : "", `${name} IPO is open today`].filter(Boolean) : [gmp ? `${count} IPOs open · ${name} ${gmp}` : "", `${count} IPOs open · ${name}`, `${count} IPOs open today`].filter(Boolean));
  return { id: `ipo-${slot}-${day}`, kind: "ipo", title, body: "", url: "/?screen=ipo", expiresAt: now + 30 * 60000, silent: false };
}
export function allotmentNotice(items: IpoAllotment[], now: number): PushNotice | null {
  const published = items.filter(item => item.state === "published" && !!item.evidenceUrl);
  if (!published.length) return null;
  const first = published[0];
  const name = shortIpoName(first.name);
  const title = published.length === 1 ? shadeChoice("🔔", [`${name} allotment is out`, `${name} allotment out`]) : shadeChoice("🔔", [`${published.length} allotments out · ${name}`, `${published.length} allotments are out`]);
  return { id: `allotment-${published.map(item => item.id).sort().join("-")}`, kind: "allotment", title, body: "", url: published.length === 1 ? `/ipo-allotment/${first.registrar}` : "/?screen=ipo", expiresAt: now + 6 * 3600000, silent: quietTime(now) };
}
export function reviewNotice(count: number, date: string, now: number): PushNotice | null {
  const { day, minutes, weekday } = indiaClock(now);
  if (date !== day || count < 1 || minutes < 1035 || minutes >= 1045 || weekday === 0 || weekday === 6) return null;
  return { id: `review-${day}`, kind: "portfolio", title: shadeChoice("✨", [`${count} paper trade${count === 1 ? "" : "s"} to review`, `${count} trades to review`]), body: "", url: "/?screen=pnl", expiresAt: now + 30 * 60000, silent: false };
}
