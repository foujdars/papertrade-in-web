"use client";
import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, IndianRupee, CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import type { IpoSummary } from "@/lib/ipo";
import type { IpoDirectoryEntry } from "@/lib/ipo-directory";
import { compactIpoName, gmpTone, listingReturn, stageLabels, type IpoStage } from "@/lib/ipo-lifecycle";
import { IpoCompanyLogo, IpoResearchLink } from "./IpoCompany";
import { useTransientBack } from "./useTransientBack";
import { IpoChances } from "./IpoChances";

export function ipoDate(value?: string, weekday = false) {
  if (!value) return "To be announced";
  const date = new Date(`${value}T00:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? "To be announced" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", ...(weekday ? { weekday: "short" as const } : {}), timeZone: "Asia/Kolkata" }).format(date);
}
const rupees = (value: number | null | undefined) => value == null ? "Awaiting data" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Props = { ipo: IpoSummary; stage: IpoStage; directory: IpoDirectoryEntry[]; onOpen?: () => void };
export function IpoLifecycleCard({ ipo, stage, directory, onOpen }: Props) {
  const returns = listingReturn(ipo.details?.listingPrice, ipo.details?.issuePrice);
  const tone = gmpTone(ipo.gmpPercent);
  return <article className="ipo-lifecycle-card" onClick={event => { if (onOpen && !(event.target as HTMLElement).closest("a,button")) onOpen(); }}>
    <header>
      <IpoCompanyLogo name={ipo.name} entries={directory} />
      <div className="ipo-card-identity"><h3>{onOpen ? <button onClick={onOpen}>{compactIpoName(ipo.name)}<ChevronRight size={16} /></button> : compactIpoName(ipo.name)}</h3><p>{ipo.symbol} · {ipo.industry || (ipo.issueType === "sme" ? "SME" : "Mainboard")}</p></div>
      {stage === "allotted" && ipo.details?.registrarUrl ? <a className="ipo-stage allotted" href={ipo.details.registrarUrl} target="_blank" rel="noopener noreferrer">Allotment out <ArrowUpRight size={13} /></a> : <span className={`ipo-stage ${stage}`}>{stageLabels[stage]}</span>}
    </header>
    <button type="button" className="ipo-card-body" onClick={onOpen} disabled={!onOpen} aria-label={`View ${ipo.name} timeline and details`}>
      {stage === "listed" ? <div className={`ipo-gmp-panel ${returns === null ? "pending" : returns >= 0 ? "high" : "low"}`}><span>Listing price<small>{ipoDate(ipo.details?.listingDate)}</small></span><strong>{rupees(ipo.details?.listingPrice)}<small>{returns === null ? "Return awaiting issue price" : `${returns > 0 ? "+" : ""}${returns.toFixed(2)}% on issue price`}</small></strong></div>
        : <div className={`ipo-gmp-panel ${tone}`}><span>GMP (unofficial)<small>{ipo.gmpAmount !== null ? <><b className="ipo-gmp-amount">{rupees(ipo.gmpAmount)}</b> per share</> : "Not reported"}</small></span><strong>{ipo.gmpPercent === null ? "Not reported" : `${ipo.gmpPercent.toFixed(2)}%`}</strong></div>}
      <div className="ipo-card-facts"><span><small><IndianRupee size={13} />Price band</small><b>{ipo.maximumPrice ? `${rupees(ipo.minimumPrice)} – ${rupees(ipo.maximumPrice)}` : "To be announced"}</b></span><span><small><ChartNoAxesColumnIncreasing size={13} />Issue size</small><b>{ipo.issueSizeCrore ? `${rupees(ipo.issueSizeCrore)} Cr` : "To be announced"}</b></span><span><small><BriefcaseBusiness size={13} />{stage === "listed" ? "Subscription" : "Issue type"}</small><b>{stage === "listed" ? ipo.totalSubscription > 0 ? `${ipo.totalSubscription.toFixed(2)}×` : "Not reported" : ipo.issueType === "sme" ? "SME" : "Mainboard"}</b></span></div>
      {stage !== "listed" && <div className="ipo-date-pair"><span><small><CalendarDays size={13} />Opens</small><b>{ipoDate(ipo.biddingStartDate)}</b></span><span><small><CalendarDays size={13} />Closes</small><b>{ipoDate(ipo.biddingEndDate)}</b></span></div>}
      {onOpen && <span className="ipo-detail-hint">Timeline & allotment details <ChevronRight size={15} /></span>}
    </button>
    <IpoResearchLink name={ipo.name} entries={directory} />
  </article>;
}

export function IpoDetailView({ ipo, stage, directory, onClose }: Props & { onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useTransientBack(true, onClose);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); }, []);
  const timeline = [
    ["Open date", ipo.biddingStartDate], ["Close date", ipo.biddingEndDate], ["Allotment date", ipo.details?.allotmentDate],
    ["Refunds initiation", ipo.details?.refundDate], ["Demat transfer", ipo.details?.dematDate], ["Listing date", ipo.details?.listingDate],
  ];
  return <section className="ipo-detail-view" aria-label={`${ipo.name} details`}>
    <div className="ipo-detail-heading"><button onClick={onClose} className="ipo-back"><ArrowLeft size={18} /> All IPOs</button><h2 ref={heading} tabIndex={-1}>{compactIpoName(ipo.name)}</h2></div>
    <div className="ipo-detail-summary"><IpoCompanyLogo name={ipo.name} entries={directory} /><span><small>{ipo.symbol} · {ipo.issueType === "sme" ? "SME" : "Mainboard"}</small><b>{stageLabels[stage]}</b></span>{stage === "allotted" && ipo.details?.registrarUrl && <a href={ipo.details.registrarUrl} target="_blank" rel="noopener noreferrer">Check status <ArrowUpRight size={16} /></a>}</div>
    <section className="ipo-detail-section"><h3><CalendarDays size={21} /> Tentative timeline</h3><ol className="ipo-timeline">{timeline.map(([label, date]) => <li key={label} className={(stage === "open" && label === "Close date") || (stage === "waiting" && label === "Allotment date") || (stage === "allotted" && label === "Listing date") ? "current" : ""}><span>{label}</span><b>{ipoDate(date, true)}</b></li>)}</ol><p>Dates are tentative until confirmed. An expected allotment date is not proof that results are out.</p></section>
    <IpoChances key={ipo.id} name={ipo.name} upcoming={stage === "upcoming"} />
    <section className="ipo-detail-section ipo-registrar"><h3><ShieldCheck size={21} /> Check with the registrar</h3><b>{ipo.details?.registrarName || "Registrar details awaiting confirmation"}</b>{ipo.details?.registrarUrl && <a href={ipo.details.registrarUrl} target="_blank" rel="noopener noreferrer">{stage === "allotted" ? "Allotment out — check status" : "Visit official status page"}<ArrowUpRight size={17} /></a>}{ipo.details?.allotmentEvidenceUrl && <a href={ipo.details.allotmentEvidenceUrl} target="_blank" rel="noopener noreferrer">{ipo.details.allotmentEvidenceLabel}<ArrowUpRight size={14} /></a>}<p>Enter your PAN only on the official website. PaperTrade never asks for or stores it. If publication cannot be verified, check with the registrar directly.</p></section>
  </section>;
}
