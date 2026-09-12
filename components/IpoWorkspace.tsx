"use client";
import { CandleLoader } from "./CandleLoader";

import { Bell, Building2, Clock3, Rocket, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  IPO_ALERT_ENABLED_STORAGE_KEY,
  IPO_ALERT_SETTINGS_EVENT,
  IPO_ALERT_STATE_STORAGE_KEY,
  IPO_GMP_ALERT_THRESHOLD_PERCENT,
  indiaDateKey,
  formatIpoGmp,
  shouldSendIpoClosingAlert,
  shouldSendDailyGmpAlert,
  type IpoListResponse,
  type IpoSummary,
} from "@/lib/ipo";
import { getNativeTradeAlert } from "@/lib/native-alert";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { IpoLifecycleCard, IpoDetailView } from "./IpoLifecycleCard";
import { ipoStage, isRecentListing, sortIposByLifecycle } from "@/lib/ipo-lifecycle";
import { useIpoDirectory } from "@/components/IpoCompany";
import { filterIpoBoard, type IpoBoard } from "@/lib/ipo-directory";

const IPO_REFRESH_INTERVAL_MS = 60_000;
type IpoFilter = "active" | "open" | "upcoming" | "listed";
type AlertState = Record<string, { gmpPercent: number | null; lastAlertDate?: string; lastClosingAlertDate?: string }>;

function readAlertEnabled() {
  return typeof window !== "undefined" && window.localStorage.getItem(IPO_ALERT_ENABLED_STORAGE_KEY) !== "false";
}

function readAlertState(): AlertState {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(IPO_ALERT_STATE_STORAGE_KEY) ?? "{}") as AlertState;
  } catch {
    return {};
  }
}

async function loadIpos(status = "open,upcoming", signal?: AbortSignal, details = false) {
  const response = await fetch(`/api/upstox/ipos?status=${encodeURIComponent(status)}${details ? "&details=1" : ""}`, { cache: "no-store", signal });
  const payload = await response.json() as IpoListResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "IPO information is unavailable.");
  return {
    partial: payload.partial ?? false,
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

function formatRefreshTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
}


function showIpoGmpAlert(ipo: IpoSummary) {
  const today = indiaDateKey();
  const title = `${ipo.symbol || ipo.name} IPO GMP is above ${IPO_GMP_ALERT_THRESHOLD_PERCENT}%`;
  const body = `Current GMP is ${formatIpoGmp(ipo)} of the upper issue price. Bidding closes ${formatIpoDate(ipo.biddingEndDate)}.`;
  addPaperTradeNotification({ id: `ipo-gmp-${ipo.id}-${today}`, kind: "ipo", title, body });
  navigator.vibrate?.([180, 90, 180]);
  if (Capacitor.getPlatform() === "android") {
    void getNativeTradeAlert().show({ title, body, notificationId: `ipo-gmp-${ipo.id}-${today}` }).catch(() => undefined);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/papertrade-icon-192.png", tag: `papertrade-ipo-${ipo.id}` });
  }
}

function showIpoClosingAlert(ipo: IpoSummary) {
  const today = indiaDateKey();
  const title = `${ipo.name}: last day to apply`;
  const gmp = formatIpoGmp(ipo);
  const issueSize = ipo.issueSizeCrore ? `Issue size ₹${ipo.issueSizeCrore.toLocaleString("en-IN")} Cr. ` : "";
  const body = `${issueSize}${gmp ? `Current GMP: ${gmp}. ` : ""}Today is the last day to apply. Do not miss the deadline.`;
  addPaperTradeNotification({ id: `ipo-closing-${ipo.id}-${today}`, kind: "ipo", title, body });
  navigator.vibrate?.([180, 90, 180]);
  if (Capacitor.getPlatform() === "android") {
    void getNativeTradeAlert().show({ title, body, notificationId: `ipo-closing-${ipo.id}-${today}` }).catch(() => undefined);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "/papertrade-icon-192.png", tag: `papertrade-ipo-closing-${ipo.id}` });
  }
}

function processIpoAlerts(ipos: IpoSummary[]) {
  const previous = readAlertState();
  const next = { ...previous };
  const today = indiaDateKey();
  for (const ipo of ipos.filter((item) => item.status === "open")) {
    const current = previous[ipo.id];
    const shouldAlert = shouldSendDailyGmpAlert(ipo.status, ipo.gmpPercent, current?.lastAlertDate, today);
    const shouldClosingAlert = shouldSendIpoClosingAlert(ipo.status, ipo.biddingEndDate, current?.lastClosingAlertDate, today);
    if (shouldClosingAlert) showIpoClosingAlert(ipo);
    else if (shouldAlert) showIpoGmpAlert(ipo);
    next[ipo.id] = {
      gmpPercent: ipo.gmpPercent,
      lastAlertDate: shouldAlert && !shouldClosingAlert ? today : current?.lastAlertDate,
      lastClosingAlertDate: shouldClosingAlert ? today : current?.lastClosingAlertDate,
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
      if (Capacitor.getPlatform() === "android") return;
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
  const requestRef = useRef<AbortController | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [board, setBoard] = useState<IpoBoard>("regular");
  const [filter, setFilter] = useState<IpoFilter>("open");
  const [ipos, setIpos] = useState<IpoSummary[]>([]);
  const directory = useIpoDirectory(ipos.map(ipo => ipo.name));
  const [fetchedAt, setFetchedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (silent = false) => {
    requestRef.current?.abort();
    if (!silent) setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const result = await loadIpos("open,upcoming,closed,listed", controller.signal, true);
      if (controller.signal.aborted) return;
      setIpos(result.ipos);
      setFetchedAt(result.fetchedAt);
      setNow(new Date());
      setError(result.partial ? "Some IPO details could not be loaded. We will retry automatically; unverified listing dates are not included in Listed." : "");
      if (readAlertEnabled() && Capacitor.getPlatform() !== "android") processIpoAlerts(result.ipos);
    } catch (cause) {
      if (requestRef.current !== controller) return;
      setError(cause instanceof DOMException && cause.name === "AbortError"
        ? "IPO refresh timed out. Retrying automatically when online."
        : cause instanceof Error ? cause.message : "IPO information is unavailable.");
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) setLoading(false);
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
      requestRef.current?.abort();
      requestRef.current = null;
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const today = indiaDateKey(now);
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
  const boardIpos = useMemo(() => filterIpoBoard(ipos, board), [ipos, board]);
  const stageOf = (ipo: IpoSummary) => ipoStage(ipo, today, time);
  const active = boardIpos.filter(ipo => stageOf(ipo) !== "listed");
  const openCount = active.filter(ipo => stageOf(ipo) !== "upcoming").length;
  const upcomingCount = active.filter(ipo => stageOf(ipo) === "upcoming").length;
  const listed = boardIpos.filter(ipo => stageOf(ipo) === "listed" && isRecentListing(ipo.details?.listingDate, today))
    .sort((a, b) => (b.details?.listingDate ?? "").localeCompare(a.details?.listingDate ?? ""));
  const visibleIpos = filter === "listed" ? listed : sortIposByLifecycle(active.filter(ipo => filter === "active" || (filter === "upcoming" ? stageOf(ipo) === "upcoming" : stageOf(ipo) !== "upcoming")), today, time);
  const selectedIpo = ipos.find(ipo => ipo.id === selectedId);


  if (selectedIpo) return <IpoDetailView ipo={selectedIpo} stage={stageOf(selectedIpo)} directory={directory} onClose={() => setSelectedId(null)} />;

  return (
    <div className="ipo-workspace">
      <div className="ipo-board-tabs" role="group" aria-label="IPO market segment">
        <button type="button" className={board === "regular" ? "active" : ""} aria-pressed={board === "regular"} onClick={() => setBoard("regular")} title="Mainboard IPOs · NSE & BSE"><Building2 size={19} aria-hidden="true" /><b>Mainboard</b></button>
        <button type="button" className={board === "sme" ? "active" : ""} aria-pressed={board === "sme"} onClick={() => setBoard("sme")} title="SME IPOs · NSE Emerge & BSE SME"><Store size={19} aria-hidden="true" /><b>SME</b></button>
      </div>
      <div className="ipo-toolbar">
        <div className="ipo-filter-tabs" role="group" aria-label="IPO status">
          <button type="button" className={filter === "active" ? "active" : ""} aria-pressed={filter === "active"} onClick={() => setFilter("active")}>All active <small>{active.length}</small></button>
          <button type="button" className={filter === "open" ? "active" : ""} aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Open <small>{openCount}</small></button>
          <button type="button" className={filter === "upcoming" ? "active" : ""} aria-pressed={filter === "upcoming"} onClick={() => setFilter("upcoming")}>Upcoming <small>{upcomingCount}</small></button>
          <button type="button" className={filter === "listed" ? "active" : ""} aria-pressed={filter === "listed"} onClick={() => setFilter("listed")}>Listed <small>{listed.length}</small></button>
        </div>
      </div>

      <>

      {filter === "listed" && <p className="ipo-listed-caption">Listing-day price and return · retained for 30 days from listing.</p>}
      {fetchedAt && <p className="ipo-updated-caption"><Clock3 size={12} aria-hidden="true" />Updated {formatRefreshTime(fetchedAt)} IST</p>}
      {error && <div className="scanner-inline-error ipo-error"><Bell size={16} /><span>{error}</span></div>}

      <div className="ipo-card-list">
        {visibleIpos.map(ipo => <IpoLifecycleCard key={ipo.id} ipo={ipo} stage={stageOf(ipo)} directory={directory} onOpen={() => setSelectedId(ipo.id)} />)}
        {loading && !visibleIpos.length && <CandleLoader label="Loading IPOs" />}
        {!loading && !error && !visibleIpos.length && <div className="positions-empty"><Rocket size={30} /><b>No {filter === "active" ? "active" : filter} {board === "regular" ? "Mainboard" : "SME"} IPOs</b><span>Try the other market segment or Upcoming. New issues appear automatically.</span></div>}
      </div>
      </>

    </div>
  );
}
