"use client";

import { useEffect, useState } from "react";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { CandleLoader } from "./CandleLoader";
import type { IpoChances as Estimates } from "@/lib/ipo-chances";

const categories = [["bnii", "bNII"], ["snii", "sNII"], ["retail", "Retail"]] as const;

export function IpoChances({ name, upcoming, issueType = "regular" }: { name: string; upcoming: boolean; issueType?: "regular" | "sme" }) {
  const [result, setResult] = useState<{ name: string; estimates: Estimates | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (upcoming || issueType === "sme") return;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort(); controller = new AbortController();
      const request = controller, timeout = window.setTimeout(() => request.abort(), 12_000);
      try {
        const response = await fetch(`/api/ipo-chances?name=${encodeURIComponent(name)}`, { signal: request.signal });
        if (!response.ok) throw new Error("Application demand could not be refreshed. Previously checked figures may be outdated.");
        const data = await response.json() as { name: string; estimates: Estimates | null };
        if (!request.signal.aborted && data.name === name) { setResult(data); setError(""); }
        else if (!request.signal.aborted) throw new Error("The research source could not be matched to this issuer.");
      } catch (cause) {
        if (controller === request) setError(cause instanceof DOMException && cause.name === "AbortError" ? "Research check timed out. We will retry automatically." : cause instanceof Error ? cause.message : "Research is temporarily unavailable.");
      } finally { window.clearTimeout(timeout); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { controller?.abort(); controller = null; window.clearInterval(timer); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [name, upcoming, issueType]);
  const current = result?.name === name ? result : null;
  if (issueType === "sme") return <section className="ipo-detail-section ipo-demand-card"><h3><ChartNoAxesColumnIncreasing size={19}/> Category demand</h3><p>SME category rules differ from Mainboard. Issue-specific Individual Investor / NII data is not verified in the current research feed, so Mainboard retail estimates are not shown here.</p><a className="ipo-chance-source" href="https://www.nseindia.com/static/trade/e-ipo-faqs" target="_blank" rel="noopener noreferrer">Read NSE category guidance ↗</a></section>;
  return <section className="ipo-detail-section ipo-demand-card">
    <h3><ChartNoAxesColumnIncreasing size={19}/> Application demand</h3>
    {!upcoming && !current && !error ? <CandleLoader label="Checking application demand"/> : <>
      <div className="ipo-demand-rows">{categories.map(([key,label]) => {
        const ratio = current?.estimates?.[key] ?? null;
        return <div key={key}><span><b>{label}</b><small>{upcoming ? "Bidding not started" : ratio === null ? "Not published" : "Application-based multiple"}</small></span><strong>{!upcoming && ratio !== null ? `${ratio.toFixed(2)}×` : "—"}</strong></div>;
      })}</div>
      <p>{error || (upcoming ? "Figures appear after bidding starts and category data is available." : "Application demand is not share subscription or a personal allotment probability. Valid applications, category rules and the registrar's final basis determine the result.")}</p>
      {current?.estimates && <a className="ipo-chance-source" href={current.estimates.sourceUrl} target="_blank" rel="noopener noreferrer">IPO Ji · Checked {new Date(current.estimates.checkedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day:"numeric",month:"short",hour:"2-digit",minute:"2-digit" })} IST ↗</a>}
    </>}
  </section>;
}
