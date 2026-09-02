"use client";

import { Bell, BellRing, CalendarDays, ExternalLink, FileCheck2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ALLOTMENT_ALERT_EVENT, allotmentLink, type AllotmentResponse, type IpoAllotment } from "@/lib/ipo-allotment";
import { processAllotmentAlerts, readAllotmentAlertEnabled, setAllotmentAlertEnabled } from "@/lib/ipo-allotment-alerts";

const CHECK_INTERVAL = 5 * 60_000;
let pending: Promise<AllotmentResponse> | undefined;

function fetchAllotments() {
  if (!pending) pending = (async () => {
    const response = await fetch("/api/upstox/ipo-allotments", { cache: "no-store", signal: AbortSignal.timeout(45_000) });
    const data = await response.json() as AllotmentResponse;
    if (!response.ok || !data.ok) throw new Error(data.error?.message || "Allotment information is unavailable. Try refreshing shortly.");
    return data;
  })().finally(() => { pending = undefined; });
  return pending;
}

function displayDate(value: string) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${value}T00:00:00+05:30`));
}

export function IpoAllotmentMonitor() {
  useEffect(() => {
    let disposed = false;
    const check = async () => {
      if (!readAllotmentAlertEnabled() || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const data = await fetchAllotments();
        if (!disposed) await processAllotmentAlerts(data.allotments ?? []);
      } catch { /* Errors are displayed in the IPO panel, never as false release alerts. */ }
    };
    const onReady = () => { void check(); };
    void check();
    const interval = window.setInterval(onReady, CHECK_INTERVAL);
    window.addEventListener(ALLOTMENT_ALERT_EVENT, onReady);
    window.addEventListener("storage", onReady);
    window.addEventListener("online", onReady);
    document.addEventListener("visibilitychange", onReady);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener(ALLOTMENT_ALERT_EVENT, onReady);
      window.removeEventListener("storage", onReady);
      window.removeEventListener("online", onReady);
      document.removeEventListener("visibilitychange", onReady);
    };
  }, []);
  return null;
}

const stateLabels = {
  published: "Allotment published", listed: "Listed · check result", scheduled: "Expected soon",
  unconfirmed: "Awaiting confirmation", unavailable: "Details unavailable",
};

export function IpoAllotments() {
  const [items, setItems] = useState<IpoAllotment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [enabled, setEnabled] = useState(readAllotmentAlertEnabled);
  const [changing, setChanging] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllotments();
      setItems(data.allotments ?? []);
      setUpdatedAt(data.fetchedAt ?? "");
      setPartial(Boolean(data.partial));
      setError("");
      await processAllotmentAlerts(data.allotments ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Allotment information is unavailable."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const onReady = () => { if (navigator.onLine && document.visibilityState === "visible") void refresh(); };
    const onSettings = () => setEnabled(readAllotmentAlertEnabled());
    const interval = window.setInterval(onReady, CHECK_INTERVAL);
    window.addEventListener("online", onReady);
    window.addEventListener("storage", onSettings);
    window.addEventListener(ALLOTMENT_ALERT_EVENT, onSettings);
    document.addEventListener("visibilitychange", onReady);
    return () => {
      window.clearTimeout(initial); window.clearInterval(interval);
      window.removeEventListener("online", onReady);
      window.removeEventListener("storage", onSettings);
      window.removeEventListener(ALLOTMENT_ALERT_EVENT, onSettings);
      document.removeEventListener("visibilitychange", onReady);
    };
  }, [refresh]);

  const toggle = async () => {
    setChanging(true);
    try {
      if (!await setAllotmentAlertEnabled(!enabled)) { setError("Allow notifications for PaperTrade in your browser or phone settings. Official result links are still available below."); return; }
      setEnabled(!enabled); setError("");
      if (!enabled) await processAllotmentAlerts(items);
    } catch { setError("Could not enable notifications. Check browser notification permissions and try again."); }
    finally { setChanging(false); }
  };

  return <section className="allotment-workspace" aria-label="IPO allotments">
    <div className="allotment-heading">
      <div><span>AFTER BIDDING CLOSES</span><h3>Your next step: allotment.</h3><p>Recent closed and listed IPOs, with official result links.</p></div>
      <div className="allotment-controls">
        <button className={`ipo-alert-toggle ${enabled ? "active" : ""}`} aria-pressed={enabled} disabled={changing} onClick={() => void toggle()}>{enabled ? <BellRing size={16} /> : <Bell size={16} />}{enabled ? "Allotment alerts on" : "Notify me"}</button>
        <button className="scanner-run-button ipo-refresh-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? "spin" : ""} />Refresh</button>
      </div>
    </div>
    <div className="allotment-privacy"><ShieldCheck size={19} /><p><b>Your PAN stays private.</b> Select the IPO and enter your PAN only on the official website that opens. PaperTrade does not ask for or store it.</p></div>
    <p className="allotment-explainer">Dates are expected dates, not proof that results are out. Publication checks currently use MUFG Intime’s public basis-of-allotment documents. For other registrars, or when publication cannot be verified, a separately labelled reminder is sent once listing is confirmed. Checks run about every 5 minutes while PaperTrade is open and resume when you return—not while it is fully closed.</p>
    {updatedAt && <small className="allotment-updated">Last checked {new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(updatedAt))} IST · Recently closed issues, up to 30 days</small>}
    {error && <div className="scanner-inline-error" role="status">{error} {items.length > 0 && "Previously loaded information remains below."}</div>}
    {partial && <p className="allotment-explainer" role="status">Some registrar details could not be verified. Those issues are marked “Details unavailable”; no release alert is sent for them.</p>}
    <div className="allotment-list" aria-busy={loading}>
      {items.map((ipo) => <article className={`allotment-card state-${ipo.state}`} key={ipo.id}>
        <header><span className="allotment-mark"><FileCheck2 size={20} /></span><div><h4>{ipo.name}</h4><small>{ipo.symbol}</small></div></header>
        <span className="allotment-state">{stateLabels[ipo.state]}</span>
        <dl><div><dt><CalendarDays size={13} />Expected allotment</dt><dd>{displayDate(ipo.allotmentDate)}</dd></div><div><dt>Listing date</dt><dd>{displayDate(ipo.listingDate)}</dd></div></dl>
        <p className="allotment-registrar">Registrar <b>{ipo.registrarName}</b></p>
        {allotmentLink(ipo.registrar) && <a className="allotment-result-link" href={allotmentLink(ipo.registrar)!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{ipo.registrar === "bse" ? "Check on BSE" : "Check allotment"}<ExternalLink size={16} /></a>}
        <small className="allotment-link-note">{ipo.registrar === "bse" ? "BSE fallback: only issues available on BSE can be checked here." : "Opens the registrar’s website in a new tab."}</small>
      </article>)}
      {loading && !items.length && Array.from({ length: 4 }, (_, i) => <div className="ipo-card ipo-card-skeleton" key={i} aria-hidden="true"><span /><span /><span /><span /></div>)}
      {!loading && !error && !items.length && <div className="positions-empty"><FileCheck2 size={28} /><b>No recent allotments to track</b><span>Recently closed IPOs will appear here automatically.</span></div>}
    </div>
  </section>;
}
