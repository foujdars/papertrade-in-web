"use client";
import { CandleLoader } from "./CandleLoader";

import { Bell, Bookmark, Building2, CalendarDays, Clock3, Compass, RefreshCw, Rocket, Search, Store, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ipoStage, isRecentListing } from "@/lib/ipo-lifecycle";
import { useIpoDirectory } from "@/components/IpoCompany";
import { filterIpoBoard } from "@/lib/ipo-directory";
import { ModernSelect } from "./ModernSelect";
import { IpoCalendar } from "./IpoCalendar";
import { IPO_FILTERS, matchesIpoFilter, normalizeIpoChoices, normalizeSavedIpos, sortExplorerIpos, type IpoChoices } from "@/lib/ipo-explorer";
import { IPO_VIEW_KEY, readPreference, writePreference } from "@/lib/interface-preferences";

const IPO_REFRESH_INTERVAL_MS = 60_000;
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
  if (!value || !Number.isFinite(Date.parse(value))) return "time unavailable";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
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

export function IpoWorkspace({ ownerId = "local" }: { ownerId?: string }) {
  const [choices, setChoices] = useState(() => normalizeIpoChoices(readPreference(IPO_VIEW_KEY)));
  const { board, filter, view, sort } = choices;
  const choose = (patch: Partial<IpoChoices>) => { const next = { ...choices, ...patch }; writePreference(IPO_VIEW_KEY, next); setChoices(next); };
  const savedKey = `papertrade-saved-ipos-v1:${ownerId}`;
  const [saved, setSaved] = useState(() => normalizeSavedIpos(readPreference(savedKey)));
  const [storageNotice, setStorageNotice] = useState("");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [ipos, setIpos] = useState<IpoSummary[]>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null), requestRef = useRef<AbortController | null>(null);
  const listReturn = useRef<{ element: HTMLElement; top: number; focus: HTMLElement | null }[]>([]);
  const directory = useIpoDirectory(ipos.map(ipo => ipo.name));

  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === savedKey || event.key === null) setSaved(normalizeSavedIpos(readPreference(savedKey))); };
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
  }, [savedKey]);
  function toggleSaved(ipo: { id: string; name: string }) {
    const next = saved.some(item => item.id === ipo.id) ? saved.filter(item => item.id !== ipo.id) : normalizeSavedIpos([...saved, { id: ipo.id, name: ipo.name }]);
    setStorageNotice(writePreference(savedKey, next) ? "" : "Device storage is unavailable. Saved IPOs will last for this session only.");
    setSaved(next);
  }
  function openDetail(id: string) {
    const snapshot: typeof listReturn.current = [];
    for (let element: HTMLElement | null = listRef.current; element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight) snapshot.push({ element, top: element.scrollTop, focus: document.activeElement instanceof HTMLElement ? document.activeElement : null });
    }
    listReturn.current = snapshot; setSelectedId(id);
  }
  useLayoutEffect(() => {
    if (selectedId || !listReturn.current.length) return;
    for (const item of listReturn.current) if (item.element.isConnected) item.element.scrollTop = item.top;
    listReturn.current[0]?.focus?.focus({ preventScroll: true }); listReturn.current = [];
  }, [selectedId]);

  const refresh = useCallback(async (silent = false) => {
    requestRef.current?.abort();
    if (!silent) setLoading(true);
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    try {
      const result = await loadIpos("open,upcoming,closed,listed", controller.signal, true);
      if (controller.signal.aborted) return;
      setIpos(result.ipos); setFetchedAt(result.fetchedAt); setNow(new Date());
      setSelectedId(id => id && result.ipos.some(ipo => ipo.id === id) ? id : null);
      setError(result.partial ? "Some details could not be verified. Missing dates and results remain unconfirmed; we will retry automatically." : "");
      if (readAlertEnabled() && Capacitor.getPlatform() !== "android") processIpoAlerts(result.ipos);
    } catch (cause) {
      if (requestRef.current !== controller) return;
      setError(cause instanceof DOMException && cause.name === "AbortError" ? "Refresh timed out. Previously loaded information remains below." : cause instanceof Error ? cause.message : "IPO information is unavailable.");
    } finally { window.clearTimeout(timeout); if (requestRef.current === controller) setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const ready = () => { setNow(new Date()); if (document.visibilityState === "visible" && navigator.onLine) void refresh(true); };
    const interval = window.setInterval(ready, IPO_REFRESH_INTERVAL_MS);
    window.addEventListener("online", ready); document.addEventListener("visibilitychange", ready);
    return () => { requestRef.current?.abort(); requestRef.current = null; window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("online", ready); document.removeEventListener("visibilitychange", ready); };
  }, [refresh]);

  const today = indiaDateKey(now), time = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
  const stageOf = (ipo: IpoSummary) => ipoStage(ipo, today, time);
  const boardIpos = useMemo(() => filterIpoBoard(ipos, board), [ipos, board]);
  const searched = boardIpos.filter(ipo => `${ipo.name} ${ipo.symbol} ${ipo.industry}`.toLowerCase().includes(search.trim().toLowerCase()));
  const recent = (ipo: IpoSummary) => stageOf(ipo) !== "listed" || isRecentListing(ipo.details?.listingDate, today);
  const visible = sortExplorerIpos(searched.filter(ipo => view === "saved" ? saved.some(item => item.id === ipo.id) : matchesIpoFilter(stageOf(ipo), filter) && recent(ipo)), sort, today, time);
  if (filter === "listed" && view === "explore") visible.sort((a,b) => sort === "event" ? (b.details?.listingDate ?? "").localeCompare(a.details?.listingDate ?? "") : 0);
  const unavailableSaved = saved.filter(item => !ipos.some(ipo => ipo.id === item.id) && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedIpo = ipos.find(ipo => ipo.id === selectedId);

  return <div className="ipo-workspace ipo-studio">
    <div ref={listRef} hidden={Boolean(selectedIpo)}>
      <header className="ipo-studio-heading"><div><span className="ipo-eyebrow">RESEARCH. FOLLOW. STAY INFORMED.</span><h2>IPO centre</h2></div><button className="ipo-icon-button" aria-label="Refresh IPOs" disabled={loading} onClick={() => void refresh()}><RefreshCw size={18} className={loading ? "spin" : ""} /></button></header>
      <nav className="ipo-view-tabs" role="tablist" aria-label="IPO views">{(["explore", "saved", "calendar"] as const).map((item, index, tabs) => <button key={item} role="tab" aria-selected={view === item} tabIndex={view === item ? 0 : -1} onClick={() => choose({ view: item })} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = (index + (event.key === "ArrowRight" ? 1 : 2)) % 3; choose({ view: tabs[next] }); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); } }}>{item === "explore" ? <Compass size={16} /> : item === "saved" ? <Bookmark size={16} /> : <CalendarDays size={16} />}<span>{item[0].toUpperCase() + item.slice(1)}</span>{item === "saved" && saved.length > 0 && <small>{saved.length}</small>}</button>)}</nav>
      <div className="ipo-discovery-controls"><div className="ipo-board-tabs" role="group" aria-label="IPO market segment"><button className={board === "regular" ? "active" : ""} aria-pressed={board === "regular"} onClick={() => choose({ board: "regular" })}><Building2 size={15} />Mainboard</button><button className={board === "sme" ? "active" : ""} aria-pressed={board === "sme"} onClick={() => choose({ board: "sme" })}><Store size={15} />SME</button></div>{view !== "calendar" && <ModernSelect label="Sort by" ariaLabel="Sort IPOs" value={sort} choices={[{ value: "event", label: "Next event", description: "Nearest date first; newest first for listed issues" }, { value: "name", label: "Company name" }, { value: "size", label: "Issue size", description: "Largest published issue size first" }]} onChange={sort => choose({ sort })} />}</div>
      <div className="ipo-search"><Search size={17} /><input type="search" aria-label="Search IPOs" placeholder="Search company, symbol or sector" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear IPO search" onClick={() => setSearch("")}><X size={16} /></button>}</div>
      {view === "explore" && <div className="ipo-status-chips" role="group" aria-label="IPO status">{IPO_FILTERS.map(item => <button key={item.value} aria-pressed={filter === item.value} onClick={() => choose({ filter: item.value })}>{item.label}<small>{searched.filter(ipo => matchesIpoFilter(stageOf(ipo), item.value) && recent(ipo)).length}</small></button>)}</div>}
      <div className="ipo-data-caption"><Clock3 size={12} /><span>{fetchedAt ? `Issue data · Upstox · Checked ${formatRefreshTime(fetchedAt)} IST` : loading ? "Checking issue data…" : "Issue data has not loaded."}{fetchedAt && <small>Source publication times may differ.</small>}</span></div>
      {view === "saved" && <p className="ipo-context-note">Your bookmarked IPOs across all stages in this segment. Saved on this device for this account; saving does not create an application or a reminder.</p>}
      {view === "explore" && filter === "listed" && <p className="ipo-context-note">Listing-day price and return · last 30 calendar days. Not a live quote or your personal P&amp;L.</p>}
      {error && <div className="ipo-status-message" role="status"><Bell size={16} /><span>{error}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {storageNotice && <p className="ipo-context-note" role="status">{storageNotice}</p>}
      {view === "calendar" ? <IpoCalendar ipos={searched} today={today} time={time} onOpen={openDetail} /> : <div className="ipo-card-list">
        {visible.map(ipo => <IpoLifecycleCard key={ipo.id} ipo={ipo} today={today} stage={stageOf(ipo)} directory={directory} saved={saved.some(item => item.id === ipo.id)} onSave={() => toggleSaved(ipo)} onOpen={() => openDetail(ipo.id)} />)}
        {view === "saved" && !loading && unavailableSaved.map(item => <div className="ipo-unavailable-saved" key={item.id}><span><b>{item.name}</b><small>Not in the latest feed. No current status assumed.</small></span><button aria-label={`Remove saved ${item.name}`} onClick={() => toggleSaved(item)}><X size={17} /></button></div>)}
        {loading && !visible.length && <CandleLoader label="Loading IPOs" />}
        {!loading && !visible.length && !(view === "saved" && unavailableSaved.length) && <div className="ipo-empty"><Rocket size={28} /><h3>{view === "saved" ? "Keep the IPOs you want to follow" : "No matching IPOs"}</h3><p>{view === "saved" ? "Use the bookmark on a company card. Check the other market segment if you saved an issue there." : "Try another status, market segment or search."}</p><button onClick={() => { setSearch(""); choose({ view: "explore", filter: "open" }); }}>Explore open IPOs</button></div>}
      </div>}
    </div>
    {selectedIpo && <IpoDetailView ipo={selectedIpo} today={today} stage={stageOf(selectedIpo)} directory={directory} saved={saved.some(item => item.id === selectedIpo.id)} onSave={() => toggleSaved(selectedIpo)} onClose={() => setSelectedId(null)} />}
  </div>;
}
