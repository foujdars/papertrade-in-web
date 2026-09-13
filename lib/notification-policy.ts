import type { IpoSummary } from "./ipo";
import type { IpoAllotment } from "./ipo-allotment";

export type NotificationPreferences = { ipo: boolean; allotment: boolean; trades: boolean; reviews: boolean; practice: boolean; hideAmounts: boolean; pausedUntil: number };
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = { ipo: true, allotment: true, trades: true, reviews: false, practice: false, hideAmounts: true, pausedUntil: 0 };
export type PushNotice = { id: string; title: string; body: string; url: string; kind: "ipo" | "allotment" | "portfolio" | "practice"; expiresAt: number; silent: boolean };
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
  const body = rows.slice(0, 3).map(ipo => `${ipo.name.replace(/\s+IPO$/i, "")}${ipo.issueType === "sme" ? " (SME)" : ""}: ${freshGmp(ipo, now) ? `GMP ${ipo.gmpPercent!.toFixed(2)}%` : "GMP not current"}${ipo.biddingEndDate === day ? ", closes today" : ""}`).join("; ");
  return { id: `ipo-${slot}-${day}`, kind: "ipo", title: slot === "closing" ? "Your afternoon IPO reminder ⏳" : `Today's IPO spotlight 👀 · ${rows.length} issue${rows.length === 1 ? "" : "s"}`, body: `${body}. ${slot === "closing" ? "Check your broker’s cutoff. " : ""}GMP is unofficial—not assured profit.`, url: "/?screen=ipo", expiresAt: now + 30 * 60000, silent: false };
}
export function allotmentNotice(items: IpoAllotment[], now: number): PushNotice | null {
  const published = items.filter(item => item.state === "published" && !!item.evidenceUrl);
  if (!published.length) return null;
  const first = published[0];
  return { id: `allotment-${published.map(item => item.id).sort().join("-")}`, kind: "allotment", title: published.length === 1 ? `The wait is over—${first.name.replace(/\s+IPO$/i, "")} allotment is out 🔔` : `Allotments are out 🔔 · ${published.length} IPOs`, body: published.length === 1 ? "Applied? Check your result securely on the official registrar website. Enter your PAN only there." : `${published.slice(0,3).map(item => item.name).join(", ")}. Check the official registrar links in the app.`, url: published.length === 1 ? `/ipo-allotment/${first.registrar}` : "/?screen=ipo", expiresAt: now + 6 * 3600000, silent: quietTime(now) };
}
export function reviewNotice(count: number, date: string, now: number): PushNotice | null {
  const { day, minutes, weekday } = indiaClock(now);
  if (date !== day || count < 1 || minutes < 1035 || minutes >= 1045 || weekday === 0 || weekday === 6) return null;
  return { id: `review-${day}`, kind: "portfolio", title: "The market has closed. Your lesson hasn’t.", body: `${count} paper trade${count === 1 ? "" : "s"} today. Revisit one decision in a two-minute replay.`, url: "/?screen=pnl", expiresAt: now + 30 * 60000, silent: false };
}
