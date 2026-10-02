import type { IpoSummary } from "./ipo";
import type { IpoAllotment } from "./ipo-allotment";
import { ipoEventTitle, ipoBiddingContext, allotmentContext, listingContext } from "./ipo-notification-content.ts";

export type NotificationPreferences = { ipo: boolean; allotment: boolean; trades: boolean; reviews: boolean; practice: boolean; sessions: boolean; ema21: boolean; ema5: boolean; hideAmounts: boolean; pausedUntil: number };
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = { ipo: true, allotment: true, trades: true, reviews: true, practice: true, sessions: true, ema21: true, ema5: true, hideAmounts: false, pausedUntil: 0 };
export type PushNotice = { id: string; title: string; body: string; url: string; kind: "ipo" | "allotment" | "portfolio" | "practice" | "trade" | "session"; expiresAt: number; silent: boolean };
export function automaticEmaAllowed(id: string, preferences: NotificationPreferences) {
  return !(id.startsWith("ema21-") && !preferences.ema21) && !(id.startsWith("ema5-") && !preferences.ema5);
}
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
  const count = rows.length;
  const event = rows[0].biddingEndDate === day ? "bidding closes today" : "bidding open";
  const title = count === 1 ? ipoEventTitle(rows[0].name, event)
    : `IPO: ${count} ${slot === "closing" ? "issues close today" : "bidding updates"}`;
  const body = rows.slice(0, 3).map(ipo => ipoBiddingContext(ipo, now)).join("\n")
    + (count > 3 ? `\n${count - 3} more issues. Open IPOs for the full list.` : "\nOpen IPOs to view issue details.");
  return { id: `ipo-${slot}-${day}`, kind: "ipo", title, body, url: "/?screen=ipo", expiresAt: now + 30 * 60000, silent: false };
}
export function allotmentNotice(items: IpoAllotment[], now: number): PushNotice | null {
  const published = items.filter(item => item.state === "published" && !!item.evidenceUrl);
  if (!published.length) return null;
  const first = published[0];
  const title = published.length === 1 ? ipoEventTitle(first.name, "allotment published") : `IPO: ${published.length} allotments published`;
  const body = published.slice(0, 3).map(allotmentContext).join("\n") + (published.length > 3 ? `\n${published.length - 3} more results. Open IPOs for the full list.` : "");
  return { id: `allotment-${published.map(item => item.id).sort().join("-")}`, kind: "allotment", title, body, url: published.length === 1 ? `/ipo-allotment/${first.registrar}` : "/?screen=ipo", expiresAt: now + 6 * 3600000, silent: quietTime(now) };
}
export function listingNotice(items: IpoSummary[], now: number): PushNotice | null {
  const listings = items.filter(ipo => ipo.status === "listed" && ipo.details?.listingDate === indiaClock(now).day
    && Number.isFinite(ipo.details.listingPrice) && ipo.details.listingPrice! > 0 && Number.isFinite(ipo.details.issuePrice) && ipo.details.issuePrice! > 0);
  if (!listings.length) return null;
  return { id: `listing-${listings.map(ipo => ipo.id).sort().join("-")}`, kind: "ipo",
    title: listings.length === 1 ? ipoEventTitle(listings[0].name, "listed today") : `IPO: ${listings.length} issues listed today`,
    body: listings.slice(0, 3).map(listingContext).join("\n") + (listings.length > 3 ? `\n${listings.length - 3} more listings.` : "") + "\nOpen IPOs for listing details.",
    url: "/?screen=ipo", expiresAt: now + 2 * 3600000, silent: true };
}
export function reviewNotice(count: number, date: string, now: number): PushNotice | null {
  const { day, minutes, weekday } = indiaClock(now);
  if (date !== day || count < 1 || minutes < 1035 || minutes >= 1045 || weekday === 0 || weekday === 6) return null;
  return { id: `review-${day}`, kind: "portfolio", title: shadeChoice("✨", [`${count} paper trade${count === 1 ? "" : "s"} to review`, `${count} trades to review`]), body: "", url: "/?screen=pnl", expiresAt: now + 30 * 60000, silent: false };
}
