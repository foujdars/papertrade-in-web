import type { IpoSummary } from "./ipo";
import type { IpoAllotment } from "./ipo-allotment";

/** Keep the category and event visible even when the issuer name is long. */
export function ipoEventTitle(name: string, event: string) {
  const issuer = name.replace(/\s+IPO$/i, "").replace(/\s+(Limited|Ltd\.?)$/i, "").trim();
  const room = Math.max(1, 42 - "IPO: ".length - ` — ${event}`.length);
  const short = issuer.length > room ? issuer.slice(0, room - 1).trimEnd() + "…" : issuer;
  return `IPO: ${short} — ${event}`;
}
export function ipoPrefixedTitle(title: string) {
  return /^IPO\b/i.test(title.trim()) ? title.trim() : `IPO: ${title.replace(/^[^\p{L}\p{N}]+/u, "").trim()}`;
}
export function ipoDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date not confirmed";
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "date not confirmed";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
export function alertTime(now: number) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now) + " IST";
}
export function ipoGmpContext(ipo: IpoSummary, now: number) {
  const updated = Date.parse(ipo.gmpUpdatedAt);
  if (ipo.gmpPercent === null || !Number.isFinite(ipo.gmpPercent) || !Number.isFinite(updated) || updated > now || now - updated > 36 * 3600000) return "";
  const amount = ipo.gmpAmount !== null && Number.isFinite(ipo.gmpAmount) ? `₹${ipo.gmpAmount.toLocaleString("en-IN")} / ` : "";
  return `Unofficial GMP: ${amount}${ipo.gmpPercent > 0 ? "+" : ""}${Math.round(ipo.gmpPercent * 10) / 10}% of issue price, updated ${alertTime(updated)}. This is not a confirmed listing gain.`;
}
export function ipoBiddingContext(ipo: IpoSummary, now: number) {
  const cutoff = ipo.details?.dailyEndTime;
  const time = cutoff && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(cutoff) ? ` at ${cutoff.slice(0, 5)} IST` : "";
  const price = ipo.maximumPrice > 0 && Number.isFinite(ipo.maximumPrice) ? ` Upper issue price ₹${ipo.maximumPrice.toLocaleString("en-IN")}.` : "";
  const gmp = ipoGmpContext(ipo, now);
  return `${ipo.name}: bidding closes ${ipoDate(ipo.biddingEndDate)}${time}.${price}${gmp ? ` ${gmp}` : ""}`;
}
export function ipoLocalContent(ipo: IpoSummary, event: "gmp" | "gmp-move" | "closing", now: number) {
  return { title: ipoEventTitle(ipo.name, event === "closing" ? "bidding closes today" : event === "gmp" ? "GMP above 15%" : "GMP updated"),
    body: `${ipoBiddingContext(ipo, now)} Open IPOs to review issue details.` };
}
export function allotmentContext(ipo: IpoAllotment) {
  const event = ipo.state === "published" ? `Allotment results published; scheduled allotment date ${ipoDate(ipo.allotmentDate)}.`
    : `Listed on ${ipoDate(ipo.listingDate)}. Listing alone does not confirm that allotment results are published.`;
  return `${ipo.name}: ${event} Check your result on ${ipo.registrarName || "the official registrar"}; enter PAN only on the official result website.`;
}
export function listingContext(ipo: IpoSummary) {
  const listing = ipo.details!.listingPrice!, issue = ipo.details!.issuePrice!;
  const pct = Math.round((listing / issue - 1) * 1000) / 10;
  return `${ipo.name}: listed ${ipoDate(ipo.details?.listingDate)} at ₹${listing.toLocaleString("en-IN")}; issue price ₹${issue.toLocaleString("en-IN")} (${pct > 0 ? "+" : ""}${pct}%). These are listing prices, not a live quote.`;
}
