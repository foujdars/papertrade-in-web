import type { IpoSummary } from "./ipo";

export type IpoDetails = {
  listingDate: string; allotmentDate: string; refundDate: string; dematDate: string;
  listingPrice: number | null; issuePrice: number | null; dailyEndTime: string;
  registrarName: string; registrarUrl: string; allotmentPublished: boolean;
  allotmentEvidenceUrl?: string; allotmentEvidenceLabel?: string;
};
export type IpoStage = "upcoming" | "open" | "waiting" | "allotted" | "listed";
export const stageLabels: Record<IpoStage, string> = {
  upcoming: "Upcoming", open: "Open", waiting: "Waiting allotment", allotted: "Allotment out", listed: "Listed",
};
export function ipoStage(ipo: IpoSummary, today: string, time = "00:00:00"): IpoStage {
  const details = ipo.details;
  if (ipo.status === "listed" || (details?.listingDate && details.listingDate <= today && typeof details.listingPrice === "number" && details.listingPrice > 0)) return "listed";
  if (ipo.biddingStartDate > today || ipo.status === "upcoming") return "upcoming";
  const closed = ipo.status === "closed" || (ipo.biddingEndDate && (ipo.biddingEndDate < today || (ipo.biddingEndDate === today && Boolean(details?.dailyEndTime) && time >= details!.dailyEndTime)));
  if (closed) return details?.allotmentPublished ? "allotted" : "waiting";
  return "open";
}
/** Thirty calendar dates, including listing day; never substitute the closing date. */
export function isRecentListing(listingDate: string | undefined, today: string) {
  if (!listingDate || listingDate > today) return false;
  const days = (Date.parse(today) - Date.parse(listingDate)) / 86_400_000;
  return Number.isFinite(days) && days >= 0 && days < 30;
}
export function listingReturn(price: number | null | undefined, issuePrice: number | null | undefined) {
  return typeof price === "number" && Number.isFinite(price) && price > 0 && typeof issuePrice === "number" && Number.isFinite(issuePrice) && issuePrice > 0
    ? (price / issuePrice - 1) * 100 : null;
}
export function gmpTone(percent: number | null) { return percent === null || !Number.isFinite(percent) ? "pending" : percent >= 15 ? "high" : "low"; }

export function compactIpoName(name: string) { return name.replace(/\s+IPO\s*$/i, "").trim(); }
export function sortIposByLifecycle(ipos: IpoSummary[], today: string, time = "00:00:00") {
  const rank: Record<IpoStage, number> = { allotted: 0, waiting: 1, open: 2, upcoming: 3, listed: 4 };
  return [...ipos].sort((a, b) => {
    const first = ipoStage(a, today, time), second = ipoStage(b, today, time);
    if (first !== second) return rank[first] - rank[second];
    const date = (ipo: IpoSummary, stage: IpoStage) => stage === "allotted" || stage === "waiting" ? ipo.details?.allotmentDate : stage === "upcoming" ? ipo.biddingStartDate : stage === "listed" ? ipo.details?.listingDate : ipo.biddingEndDate;
    const left = date(a, first) || "9999-12-31", right = date(b, second) || "9999-12-31";
    return left.localeCompare(right) || a.name.localeCompare(b.name);
  });
}
