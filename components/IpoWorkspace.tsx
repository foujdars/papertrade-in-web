"use client";

import { BadgeIndianRupee, Bell, BellRing, Building2, CalendarDays, RefreshCw, Rocket, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  IPO_ALERT_ENABLED_STORAGE_KEY,
  IPO_ALERT_SETTINGS_EVENT,
  IPO_ALERT_STATE_STORAGE_KEY,
  IPO_GMP_ALERT_THRESHOLD_PERCENT,
  indiaDateKey,
  shouldSendDailyGmpAlert,
  type IpoListResponse,
  type IpoSummary,
} from "@/lib/ipo";
import { getNativeTradeAlert } from "@/lib/native-alert";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { IpoAllotments } from "@/components/IpoAllotments";

const IPO_REFRESH_INTERVAL_MS = 60_000;
type IpoFilter = "active" | "open" | "upcoming" | "allotments";
type AlertState = Record<string, { gmpPercent: number | null; lastAlertDate?: string }>;

function readAlertEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(IPO_ALERT_ENABLED_STORAGE_KEY) === "true";
}

function readAlertState(): AlertState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(IPO_ALERT_STATE_STORAGE_KEY) ?? "{}") as AlertState;
  } catch {
    return {};
  }
}

async function loadIpos(status = "open,upcoming", signal?: AbortSignal) {
  const response = await fetch(`/api/upstox/ipos?status=${encodeURIComponent(status)}`, { cache: "no-store", signal });
  const payload = await response.json() as IpoListResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "IPO information is unavailable.");
  return {
    ipos: payload.ipos ?? [],
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    gmpFeedConfigured: payload.gmpFeedConfigured ?? false,
  };
}

function formatIpoDate(value: string) {
  if (!value) return "To be announced";
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

function formatPriceBand(ipo: IpoSummary) {
  if (!ipo.minimumPrice && !ipo.maximumPrice) return "To be announced";
  if (ipo.minimumPrice === ipo.maximumPrice) return `₹${ipo.maximumPrice.toLocaleString("en-IN")}`;
  return `₹${ipo.minimumPrice.toLocaleString("en-IN")} – ₹${ipo.maximumPrice.toLocaleString("en-IN")}`;
}

function formatGmp(ipo: IpoSummary) {
  if (ipo.gmpAmount === null || ipo.gmpPercent === null) return "Not available";
  const sign = ipo.gmpAmount > 0 ? "+" : "";
  return `${sign}₹${ipo.gmpAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${sign}${ipo.gmpPercent.toFixed(2)}%)`;
}

function formatRefreshTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

async function setIpoAlertEnabled(enabled: boolean) {
  if (typeof window === "undefined") return false;
  if (enabled) {
    if (Capacitor.getPlatform() === "android") {
      const permission = await getNativeTradeAlert().requestPermission().catch(() => undefined);
      if (permission && permission.granted === false) return false;
    } else if ("Notification" in window) {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") return false;
    }
  }
  window.localStorage.setItem(IPO_ALERT_ENABLED_STORAGE_KEY, String(enabled));
  if (Capacitor.getPlatform() === "android") {
    await getNativeTradeAlert().setIpoAlerts({ enabled }).catch(() => undefined);
  }
  window.dispatchEvent(new CustomEvent(IPO_ALERT_SETTINGS_EVENT, { detail: { enabled } }));
  return true;
}

function showIpoAlert(ipo: IpoSummary) {
  const today = indiaDateKey();
  const title = `${ipo.symbol || ipo.name} IPO GMP is above ${IPO_GMP_ALERT_THRESHOLD_PERCENT}%`;
  const body = `Current GMP is ${formatGmp(ipo)} of the upper issue price. Bidding closes ${formatIpoDate(ipo.biddingEndDate)}.`;
  addPaperTradeNotification({ id: `ipo-gmp-${ipo.id}-${today}`, kind: "ipo", title, body });
  navigator.vibrate?.([180, 90, 180]);
  if (Capacitor.getPlatform() === "android") {
    void getNativeTradeAlert().show({ title, body, notificationId: `ipo-gmp-${ipo.id}-${today}` }).catch(() => undefined);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/papertrade-icon-192.png", tag: `papertrade-ipo-${ipo.id}` });
  }
}

function processIpoAlerts(ipos: IpoSummary[]) {
  const previous = readAlertState();
  const next = { ...previous };
  const today = indiaDateKey();
  for (const ipo of ipos.filter((item) => item.status === "open")) {
    const current = previous[ipo.id];
    const shouldAlert = shouldSendDailyGmpAlert(ipo.status, ipo.gmpPercent, current?.lastAlertDate, today);
    if (shouldAlert) showIpoAlert(ipo);
    next[ipo.id] = {
      gmpPercent: ipo.gmpPercent,
      lastAlertDate: shouldAlert ? today : current?.lastAlertDate,
    };
  }
  window.localStorage.setItem(IPO_ALERT_STATE_STORAGE_KEY, JSON.stringify(next));
}

export function IpoAlertMonitor() {
  useEffect(() => {
    let enabled = readAlertEnabled();
    if (enabled && Capacitor.getPlatform() === "android") {
      void getNativeTradeAlert().setIpoAlerts({ enabled: true }).catch(() => undefined);
    }
    let controller: AbortController | null = null;
    const check = async () => {
      if (!enabled || document.visibilityState !== "visible" || !navigator.onLine) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const { ipos } = await loadIpos("open", controller.signal);
        processIpoAlerts(ipos);
      } catch {
        // The Markets IPO screen surfaces data errors; the background monitor stays quiet.
      }
    };
    const onSettings = (event: Event) => {
      enabled = Boolean((event as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
      if (enabled) void check();
    };
    const onReady = () => void check();
    void check();
    const interval = window.setInterval(check, IPO_REFRESH_INTERVAL_MS);
    window.addEventListener(IPO_ALERT_SETTINGS_EVENT, onSettings);
    window.addEventListener("online", onReady);
    document.addEventListener("visibilitychange", onReady);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener(IPO_ALERT_SETTINGS_EVENT, onSettings);
      window.removeEventListener("online", onReady);
      document.removeEventListener("visibilitychange", onReady);
    };
  }, []);
  return null;
}

export function IpoWorkspace() {
  const [filter, setFilter] = useState<IpoFilter>("open");
  const [ipos, setIpos] = useState<IpoSummary[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [gmpFeedConfigured, setGmpFeedConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [alertsEnabled, setAlertsEnabledState] = useState(readAlertEnabled);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await loadIpos("open,upcoming", controller.signal);
      setIpos(result.ipos);
      setFetchedAt(result.fetchedAt);
      setGmpFeedConfigured(result.gmpFeedConfigured);
      setError("");
      if (readAlertEnabled()) processIpoAlerts(result.ipos);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "IPO refresh timed out. Pull down or tap Refresh to try again."
        : cause instanceof Error ? cause.message : "IPO information is unavailable.");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh(true);
    };
    const interval = window.setInterval(refreshWhenVisible, IPO_REFRESH_INTERVAL_MS);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const visibleIpos = useMemo(() => ipos
    .filter((ipo) => filter === "active" || ipo.status === filter)
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "open" ? -1 : 1;
      return (right.gmpPercent ?? Number.NEGATIVE_INFINITY) - (left.gmpPercent ?? Number.NEGATIVE_INFINITY);
    }), [filter, ipos]);
  const openCount = ipos.filter((ipo) => ipo.status === "open").length;
  const upcomingCount = ipos.filter((ipo) => ipo.status === "upcoming").length;

  const toggleAlerts = async () => {
    const next = !alertsEnabled;
    const changed = await setIpoAlertEnabled(next);
    if (!changed) {
      setError("Notification permission is blocked. Enable notifications for PaperTrade IN in your phone or browser settings.");
      return;
    }
    setAlertsEnabledState(next);
    setError("");
    if (next) processIpoAlerts(ipos);
  };

  return (
    <div className="ipo-workspace">
      <section className="ipo-overview-banner">
        <span className="ipo-overview-icon"><Rocket size={21} /></span>
        <div><small>IPO RADAR</small><h3>From opening day to allotment.</h3><p>Track upcoming issues, daily GMP alerts and official allotment results in one place.</p></div>
        <aside><BadgeIndianRupee size={16} /><span><small>ALERT RULE</small><b>GMP &gt; 15%</b></span></aside>
      </section>
      <div className="ipo-toolbar">
        <div className="ipo-filter-tabs" role="tablist" aria-label="IPO status">
          <button type="button" className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>All active <small>{ipos.length}</small></button>
          <button type="button" className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Open <small>{openCount}</small></button>
          <button type="button" className={filter === "upcoming" ? "active" : ""} onClick={() => setFilter("upcoming")}>Upcoming <small>{upcomingCount}</small></button>
          <button type="button" className={filter === "allotments" ? "active" : ""} onClick={() => setFilter("allotments")}>Allotments</button>
        </div>
        {filter !== "allotments" && <div className="ipo-toolbar-actions">
          <button type="button" className={`ipo-alert-toggle ${alertsEnabled ? "active" : ""}`} onClick={() => void toggleAlerts()} aria-pressed={alertsEnabled}>
            {alertsEnabled ? <BellRing size={16} /> : <Bell size={16} />}
            <span>{alertsEnabled ? "Daily GMP alert on" : "Alert above 15% GMP"}</span>
          </button>
          <button type="button" className="scanner-run-button ipo-refresh-button" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>}
      </div>

      {filter === "allotments" ? <IpoAllotments /> : <>
      <div className="ipo-source-line">
        <span><ShieldCheck size={14} /> IPO dates and prices from Upstox · GMP {gmpFeedConfigured ? "from IPOAlerts" : "feed not connected"}</span>
        {fetchedAt && <small>Updated {formatRefreshTime(fetchedAt)} IST · GMP checked periodically</small>}
      </div>
      {!gmpFeedConfigured && <div className="ipo-feed-note"><Bell size={16} /><span><b>GMP feed not connected</b><small>IPO dates and price bands remain available. GMP values and alerts will begin after the secure server feed is configured.</small></span></div>}
      {error && <div className="scanner-inline-error ipo-error"><Bell size={16} /><span>{error}</span></div>}

      <div className="ipo-card-list">
        {visibleIpos.map((ipo) => {
          const thresholdReached = ipo.gmpPercent !== null && ipo.gmpPercent > IPO_GMP_ALERT_THRESHOLD_PERCENT;
          return (
            <article className={`ipo-card ${ipo.status} ${thresholdReached ? "threshold-reached" : ""}`} key={ipo.id}>
              <header>
                <span className="ipo-company-mark"><Building2 size={19} /></span>
                <div><b>{ipo.name}</b><small>{ipo.symbol || ipo.isin} · {ipo.industry || "Industry not stated"}</small></div>
                <span className={`ipo-status-badge ${ipo.status}`}>{ipo.status}</span>
              </header>
              <div className="ipo-subscription-block">
                <small>Grey Market Premium (GMP)</small>
                <strong>{ipo.status === "upcoming" ? "Not open" : formatGmp(ipo)}</strong>
                {thresholdReached && <em><BellRing size={13} /> Above 15% GMP alert level</em>}
              </div>
              <div className="ipo-facts">
                <span><small>Price band</small><b>{formatPriceBand(ipo)}</b></span>
                <span><small>Issue size</small><b>{ipo.issueSizeCrore ? `₹${ipo.issueSizeCrore.toLocaleString("en-IN")} Cr` : "To be announced"}</b></span>
                <span><small>Issue type</small><b>{ipo.issueType === "sme" ? "SME" : "Mainboard"}</b></span>
              </div>
              <footer><CalendarDays size={14} /><span>{formatIpoDate(ipo.biddingStartDate)} – {formatIpoDate(ipo.biddingEndDate)}</span></footer>
            </article>
          );
        })}
        {loading && !visibleIpos.length && Array.from({ length: 5 }, (_, index) => <div className="ipo-card ipo-card-skeleton" key={`ipo-skeleton-${index}`} aria-hidden="true"><span /><span /><span /><span /></div>)}
        {!loading && !error && !visibleIpos.length && <div className="positions-empty"><Rocket size={30} /><b>No {filter === "active" ? "active" : filter} IPOs</b><span>This section will update automatically when a new IPO becomes available.</span></div>}
      </div>
      </>}
      <p className="ipo-disclaimer">GMP is unofficial, speculative and can change without notice. Verify information independently. PaperTrade IN provides educational information and does not recommend applying to an IPO.</p>
    </div>
  );
}
