import type { IpoSummary } from "./ipo";
import { ipoStage, type IpoStage } from "./ipo-lifecycle.ts";

export type IpoFilter = "open" | "upcoming" | "allotment" | "listed";
export type IpoView = "explore" | "saved" | "calendar";
export type IpoSort = "event" | "name" | "size";
export type IpoChoices = { board: "regular" | "sme"; filter: IpoFilter; view: IpoView; sort: IpoSort };
export const DEFAULT_IPO_CHOICES: IpoChoices = { board: "regular", filter: "open", view: "explore", sort: "event" };
export const IPO_FILTERS: { value: IpoFilter; label: string }[] = [{ value: "open", label: "Open" }, { value: "upcoming", label: "Upcoming" }, { value: "allotment", label: "Allotment" }, { value: "listed", label: "Listed" }];
export function normalizeIpoChoices(input: unknown): IpoChoices {
  const v = input && typeof input === "object" ? input as Partial<IpoChoices> : {};
  return { board: v.board === "sme" ? "sme" : "regular", filter: IPO_FILTERS.some(f => f.value === v.filter) ? v.filter! : "open", view: v.view === "saved" || v.view === "calendar" ? v.view : "explore", sort: v.sort === "name" || v.sort === "size" ? v.sort : "event" };
}
export type SavedIpo = { id: string; name: string };
export function normalizeSavedIpos(value: unknown): SavedIpo[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(v => {
    if (!v || typeof v.id !== "string" || !v.id.trim() || v.id.length > 200 || seen.has(v.id) || typeof v.name !== "string") return [];
    seen.add(v.id); return [{ id: v.id, name: v.name.slice(0, 200) }];
  }).slice(0, 500);
}
export function matchesIpoFilter(stage: IpoStage, filter: IpoFilter) { return filter === "allotment" ? stage === "waiting" || stage === "allotted" : stage === filter; }
export function validIpoDay(value?: string) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value); }
export type IpoEvent = { id: string; ipo: IpoSummary; date: string; kind: "opens" | "closes" | "allotment" | "listing"; label: string; expected: boolean };
export function ipoEvents(ipos: IpoSummary[], today: string, time = "00:00:00"): IpoEvent[] {
  return ipos.flatMap(ipo => {
    const stage = ipoStage(ipo, today, time);
    const rows = [
      { kind: "opens" as const, date: ipo.biddingStartDate, label: "Opens", expected: true },
      { kind: "closes" as const, date: ipo.biddingEndDate, label: "Closes", expected: true },
      { kind: "allotment" as const, date: ipo.details?.allotmentDate, label: "Expected allotment", expected: true },
      { kind: "listing" as const, date: ipo.details?.listingDate, label: stage === "listed" ? "Listed" : "Expected listing", expected: stage !== "listed" },
    ];
    return rows.filter(row => validIpoDay(row.date)).map(row => ({ ...row, date: row.date!, ipo, id: `${ipo.id}:${row.kind}` }));
  }).sort((a,b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.ipo.name.localeCompare(b.ipo.name));
}
export function nextIpoEvent(ipo: IpoSummary, stage: IpoStage, today: string) {
  if (stage === "upcoming") return { label: "Opens", date: ipo.biddingStartDate };
  if (stage === "open") return { label: ipo.biddingEndDate === today ? "Closes today" : "Closes", date: ipo.biddingEndDate };
  if (stage === "waiting") return { label: "Expected allotment", date: ipo.details?.allotmentDate ?? "" };
  if (stage === "allotted") return { label: "Expected listing", date: ipo.details?.listingDate ?? "" };
  return { label: "Listed", date: ipo.details?.listingDate ?? "" };
}
export function sortExplorerIpos(ipos: IpoSummary[], sort: IpoSort, today: string, time: string) {
  return [...ipos].sort((a,b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "size") return b.issueSizeCrore - a.issueSizeCrore || a.name.localeCompare(b.name);
    const eventDate = (ipo: IpoSummary) => nextIpoEvent(ipo, ipoStage(ipo, today, time), today).date || "9999-12-31";
    return eventDate(a).localeCompare(eventDate(b)) || a.name.localeCompare(b.name);
  });
}
