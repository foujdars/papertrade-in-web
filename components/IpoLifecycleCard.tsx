"use client";
import { ArrowLeft, ArrowUpRight, Bookmark, CalendarDays, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { indiaDateKey, type IpoSummary } from "@/lib/ipo";
import type { IpoDirectoryEntry } from "@/lib/ipo-directory";
import { compactIpoName, gmpTone, listingReturn, stageLabels, type IpoStage } from "@/lib/ipo-lifecycle";
import { nextIpoEvent, validIpoDay } from "@/lib/ipo-explorer";
import { IpoCompanyLogo, IpoResearchLink } from "./IpoCompany";
import { useTransientBack } from "./useTransientBack";
import { IpoChances } from "./IpoChances";

export function ipoDate(value?: string, weekday = false) {
  if (!validIpoDay(value)) return "To be announced";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", ...(weekday ? { weekday: "short" as const } : {}), timeZone: "Asia/Kolkata" }).format(new Date(`${value}T00:00:00+05:30`));
}
export function ipoTimestamp(value?: string) {
  const date = new Date(value ?? "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " IST" : "";
}
const rupees = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Not reported" : `${value < 0 ? "−" : ""}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Props = { ipo: IpoSummary; stage: IpoStage; directory: IpoDirectoryEntry[]; today?: string; onOpen?: () => void; saved?: boolean; onSave?: () => void };

function BookmarkButton({ ipo, saved, onSave }: Pick<Props, "ipo" | "saved" | "onSave">) {
  return onSave ? <button type="button" className="ipo-save-button" aria-label={`${saved ? "Unsave" : "Save"} ${ipo.name}`} aria-pressed={Boolean(saved)} onClick={onSave}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button> : null;
}
function IpoFacts({ ipo }: { ipo: IpoSummary }) {
  return <dl className="ipo-compact-facts"><div><dt>Price band</dt><dd>{ipo.minimumPrice > 0 && ipo.maximumPrice > 0 ? `${rupees(ipo.minimumPrice)}–${rupees(ipo.maximumPrice)}` : "To be announced"}</dd></div><div><dt>Issue size</dt><dd>{ipo.issueSizeCrore > 0 ? `${rupees(ipo.issueSizeCrore)} Cr` : "Not reported"}</dd></div><div><dt>Subscription</dt><dd>{ipo.totalSubscription > 0 ? `${ipo.totalSubscription.toFixed(2)}×` : "Not reported"}</dd></div></dl>;
}
function GmpSummary({ ipo }: { ipo: IpoSummary }) {
  const reported = ipo.gmpPercent != null && Number.isFinite(ipo.gmpPercent);
  return <div className={`ipo-compact-gmp ${gmpTone(ipo.gmpPercent)}`}><span>GMP <small>unofficial</small></span><b>{reported ? <>{ipo.gmpAmount != null && <>{rupees(ipo.gmpAmount)} <i>·</i> </>}{ipo.gmpPercent! > 0 ? "+" : ""}{ipo.gmpPercent!.toFixed(2)}%</> : "Not reported"}</b></div>;
}
function GmpSource({ ipo }: { ipo: IpoSummary }) {
  if (ipo.gmpAmount == null) return null;
  const source = ipo.gmpSource === "ipoalerts" ? "IPOAlerts" : ipo.gmpSource === "ipogram" ? "IPOGram" : "External source";
  return <p className="ipo-gmp-source">{source}{ipoTimestamp(ipo.gmpUpdatedAt) ? ` · Reported ${ipoTimestamp(ipo.gmpUpdatedAt)}` : ipoTimestamp(ipo.gmpCheckedAt) ? ` · Checked ${ipoTimestamp(ipo.gmpCheckedAt)} · source update time unavailable` : " · update time unavailable"}</p>;
}

export function IpoLifecycleCard({ ipo, stage, directory, onOpen, saved, onSave, today = indiaDateKey() }: Props) {
  const event = nextIpoEvent(ipo, stage, today), returns = listingReturn(ipo.details?.listingPrice, ipo.details?.issuePrice);
  return <article className="ipo-lifecycle-card ipo-compact-card" data-ipo-id={ipo.id}>
    <header><IpoCompanyLogo name={ipo.name} entries={directory}/><div className="ipo-card-identity"><h3><button onClick={onOpen}>{compactIpoName(ipo.name)}<ChevronRight size={15}/></button></h3><p>{ipo.industry || ipo.symbol || "Company information pending"}</p></div><BookmarkButton ipo={ipo} saved={saved} onSave={onSave}/></header>
    <div className="ipo-card-status"><span className={`ipo-stage ${stage}`}>{stageLabels[stage]}</span>{stage === "allotted" && ipo.details?.registrarUrl && <a href={ipo.details.registrarUrl} target="_blank" rel="noopener noreferrer">Check result<ArrowUpRight size={13}/></a>}</div>
    <button type="button" className={`ipo-next-event ${event.label === "Closes today" ? "urgent" : ""}`} onClick={onOpen} aria-label={`View ${ipo.name} timeline and details`}><CalendarDays size={17}/><span><small>{event.label}</small><b>{ipoDate(event.date)}</b></span><ChevronRight size={16}/></button>
    <IpoFacts ipo={ipo}/>
    {stage === "listed" ? <div className={`ipo-listing-result ${gmpTone(returns)}`}><span>Listing price<b>{rupees(ipo.details?.listingPrice)}</b></span><span>vs issue price<b>{returns === null ? "Not reported" : `${returns > 0 ? "+" : ""}${returns.toFixed(2)}%`}</b></span></div> : <><GmpSummary ipo={ipo}/><GmpSource ipo={ipo}/></>}
    <footer><IpoResearchLink name={ipo.name} entries={directory} compact/><button type="button" onClick={onOpen}>Details<ChevronRight size={14}/></button></footer>
  </article>;
}

export function IpoDetailView({ ipo, stage, directory, onClose, saved, onSave, today = indiaDateKey() }: Props & { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null), event = nextIpoEvent(ipo, stage, today);
  useTransientBack(true, onClose);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }, []);
  const timeline = [["Open date", ipo.biddingStartDate], ["Close date", ipo.biddingEndDate], ["Expected allotment", ipo.details?.allotmentDate], ["Expected refunds initiation", ipo.details?.refundDate], ["Expected demat transfer", ipo.details?.dematDate], [stage === "listed" ? "Listing date" : "Expected listing", ipo.details?.listingDate]];
  return <section className="ipo-detail-view ipo-detail-studio" aria-label={`${ipo.name} details`}>
    <div className="ipo-detail-navigation"><button onClick={onClose} className="ipo-back"><ArrowLeft size={17}/> Back to IPOs</button><BookmarkButton ipo={ipo} saved={saved} onSave={onSave}/></div>
    <header className="ipo-detail-company"><IpoCompanyLogo name={ipo.name} entries={directory}/><div><span className="ipo-eyebrow">{ipo.issueType === "sme" ? "SME" : "MAINBOARD"} · {ipo.symbol}</span><h2 ref={heading} tabIndex={-1}>{compactIpoName(ipo.name)}</h2><span className={`ipo-stage ${stage}`}>{stageLabels[stage]}</span></div></header>
    <section className="ipo-detail-overview"><div className="ipo-next-event"><CalendarDays size={20}/><span><small>{event.label}</small><b>{ipoDate(event.date,true)}</b></span></div><IpoFacts ipo={ipo}/>{stage !== "listed" && <><GmpSummary ipo={ipo}/><GmpSource ipo={ipo}/></>}<p className="ipo-context-note">Confirm lot size, minimum application and category eligibility in the issue's offer document. GMP is unofficial—not a promised listing return.</p><IpoResearchLink name={ipo.name} entries={directory} compact/></section>
    <details className="ipo-detail-section ipo-timeline-disclosure"><summary><CalendarDays size={19}/><span>Full timeline<small>Scheduled dates and milestones</small></span><ChevronDown size={17}/></summary><ol className="ipo-timeline">{timeline.map(([label,date])=><li key={label}><span>{label}</span><b>{ipoDate(date,true)}</b></li>)}</ol><p>Dates may change. A scheduled allotment date does not prove that results have been published.</p></details>
    <section className="ipo-detail-section ipo-registrar"><h3><ShieldCheck size={19}/> Allotment verification</h3><b>{ipo.details?.registrarName || "Registrar details awaiting confirmation"}</b><p>{ipo.details?.allotmentPublished ? "Publication has been reported. Use the evidence link below and check your own result with the registrar." : "Publication has not been verified here. Check the registrar directly; a passed expected date is not proof of release."}</p>{ipo.details?.registrarUrl && <a href={ipo.details.registrarUrl} target="_blank" rel="noopener noreferrer">Visit official status page<ArrowUpRight size={16}/></a>}{ipo.details?.allotmentEvidenceUrl && <a href={ipo.details.allotmentEvidenceUrl} target="_blank" rel="noopener noreferrer">{ipo.details.allotmentEvidenceLabel || "Publication evidence"}<ArrowUpRight size={14}/></a>}<p>Enter your PAN only on the official website. PaperTrade does not ask for or store it.</p></section>
    <IpoChances key={ipo.id} name={ipo.name} upcoming={stage === "upcoming"} issueType={ipo.issueType}/>
  </section>;
}
