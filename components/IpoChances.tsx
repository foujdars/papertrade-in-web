"use client";
import { useEffect, useState } from "react";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { CandleLoader } from "./CandleLoader";
import { chanceLabel, type IpoChances as Estimates } from "@/lib/ipo-chances";

export function IpoChances({ name, upcoming }: { name: string; upcoming: boolean }) {
  const [result, setResult] = useState<{ name: string; estimates: Estimates | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (upcoming) return;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort(); controller = new AbortController(); const request = controller;
      const timeout = window.setTimeout(() => request.abort(), 12_000);
      try {
        const response = await fetch(`/api/ipo-chances?name=${encodeURIComponent(name)}`, { signal: request.signal });
        if (!response.ok) throw new Error("Application estimates could not be refreshed. Retrying automatically.");
        const data = await response.json() as { name: string; estimates: Estimates | null };
        if (!request.signal.aborted && data.name === name) { setResult(data); setError(""); }
      } catch (cause) { if (controller === request) setError(cause instanceof Error ? cause.message : "Research is temporarily unavailable."); }
      finally { window.clearTimeout(timeout); }
    };
    void refresh(); const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { controller?.abort(); controller = null; window.clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [name, upcoming]);
  const current = result?.name === name ? result : null;
  return <section className="ipo-detail-section"><h3><ChartNoAxesColumnIncreasing size={21} />Estimated allotment chances</h3>
    {!upcoming && !current && !error ? <CandleLoader label="Checking application-based estimates" /> : <>
      <div className="ipo-chance-list">{([['bnii', 'bNII · Above ₹10 lakh'], ['snii', 'sNII · ₹2–10 lakh'], ['retail', 'Retail']] as const).map(([key, label]) => <div key={key}><b>{label}</b><span>{upcoming ? "Bidding not started" : error && !current ? "Temporarily unavailable" : chanceLabel(current?.estimates?.[key] ?? null)}{current?.estimates?.[key] != null && <small>{current.estimates[key]!.toFixed(2)}× application demand</small>}</span></div>)}</div>
      <p>{error || (upcoming ? "Estimates appear after applications begin and category data is published." : current?.estimates ? "Indicative estimates from application demand, not share subscription. Valid applications, category rules and the registrar’s final basis determine allotment; these are not guaranteed odds." : "Application-based category estimates have not been published by the research source yet. We check again automatically.")}</p>
      {current?.estimates && <a className="ipo-chance-source" href={current.estimates.sourceUrl} target="_blank" rel="noopener noreferrer">Source: IPO Ji · Checked {new Date(current.estimates.checkedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST ↗</a>}
    </>}
  </section>;
}
