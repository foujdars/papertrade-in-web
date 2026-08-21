"use client";

import { Activity, Cable, RefreshCw, ScanSearch, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveNetChange, formatInr, formatSignedMarketMove, type Instrument } from "@/lib/market";
import { NIMBLE_STRATEGIES, type NimbleStrategy, type TechnicalScannerRow } from "@/lib/nimble-scanner";
import type { NormalizedQuote } from "@/lib/upstox";
import type { OpenHighRow, VolumeBreakoutRow } from "@/lib/volume-breakout";

type ScannerId = "VOLUME" | "OPEN_HIGH" | NimbleStrategy;
type ScannerRow = VolumeBreakoutRow | OpenHighRow | TechnicalScannerRow;
type ScannerSnapshot = { rows: ScannerRow[]; scannedAt: string; error?: string };

const STORAGE_KEY = "papertrade-market-scanner-results-v1";
const SCAN_MODE_STORAGE_KEY = "papertrade-market-scanner-mode-v1";
const AUTO_SCAN_INTERVAL_MS = 60_000;
const PULL_REFRESH_THRESHOLD = 58;
const MAX_PULL_DISTANCE = 86;
const scannerOptions: Array<{ id: ScannerId; label: string }> = [
  { id: "VOLUME", label: "Volume Shocker" },
  { id: "OPEN_HIGH", label: "Open = High" },
  ...Object.entries(NIMBLE_STRATEGIES).map(([id, item]) => ({ id: id as NimbleStrategy, label: item.label })),
];

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function isVolumeRow(row: ScannerRow): row is VolumeBreakoutRow {
  return "volumeMultiple" in row;
}

function isOpenHighRow(row: ScannerRow): row is OpenHighRow {
  return "open" in row && "high" in row;
}

function isTechnicalRow(row: ScannerRow): row is TechnicalScannerRow {
  return "signal" in row;
}

function readSavedSnapshots() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Record<ScannerId, ScannerSnapshot>>;
  } catch {
    return {};
  }
}

function formatScanTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function readScanMode(): "manual" | "auto" {
  if (typeof window === "undefined") return "auto";
  return window.localStorage.getItem(SCAN_MODE_STORAGE_KEY) === "manual" ? "manual" : "auto";
}

export function MarketsWorkspace({
  stockUniverse,
  quotes,
  onQuoteKeysChange,
  onSelectCash,
  onClose,
}: {
  stockUniverse: Instrument[];
  quotes: Record<string, NormalizedQuote>;
  onQuoteKeysChange: (keys: string[]) => void;
  onSelectCash: (instrument: Instrument, price: number) => void;
  onClose: () => void;
}) {
  const [activeScanner, setActiveScanner] = useState<ScannerId>("VOLUME");
  const [snapshots, setSnapshots] = useState<Partial<Record<ScannerId, ScannerSnapshot>>>(readSavedSnapshots);
  const [loadingScanner, setLoadingScanner] = useState<ScannerId | null>(null);
  const [scanMode, setScanMode] = useState<"manual" | "auto">(readScanMode);
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);

  const selectedOption = scannerOptions.find((option) => option.id === activeScanner) ?? scannerOptions[0];
  const activeSnapshot = snapshots[activeScanner];
  const activeRows = useMemo(() => activeSnapshot?.rows ?? [], [activeSnapshot]);
  const instruments = useMemo(() => stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey })), [stockUniverse]);
  const activeQuoteKeys = useMemo(() => activeRows.map((row) => row.instrumentKey).filter(Boolean), [activeRows]);

  useEffect(() => {
    onQuoteKeysChange(activeQuoteKeys);
    return () => onQuoteKeysChange([]);
  }, [activeQuoteKeys, onQuoteKeysChange]);

  const runSelectedScan = useCallback(async (requestedScanner?: ScannerId) => {
    if (scanInFlightRef.current || !instruments.length) return;
    const scanner = requestedScanner ?? activeScanner;
    const option = scannerOptions.find((item) => item.id === scanner) ?? scannerOptions[0];
    const controller = new AbortController();
    scanAbortRef.current?.abort();
    scanAbortRef.current = controller;
    scanInFlightRef.current = true;
    setLoadingScanner(scanner);
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const technical = scanner !== "VOLUME" && scanner !== "OPEN_HIGH";
      const response = await fetch(technical ? "/api/market/technical-scanner" : "/api/market/volume-breakouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments, ...(technical ? { strategy: scanner } : { mode: scanner }) }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json() as { ok?: boolean; rows?: ScannerRow[]; openHighRows?: OpenHighRow[]; fetchedAt?: string; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `${option.label} is unavailable.`);
      const rows = scanner === "OPEN_HIGH" ? (payload.openHighRows ?? payload.rows ?? []) : (payload.rows ?? []);
      setSnapshots((current) => {
        const next = { ...current, [scanner]: { rows, scannedAt: payload.fetchedAt ?? new Date().toISOString() } };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? `${option.label} timed out. Please try again.`
        : error instanceof Error ? error.message : `${option.label} is unavailable.`;
      setSnapshots((current) => ({ ...current, [scanner]: { rows: current[scanner]?.rows ?? [], scannedAt: current[scanner]?.scannedAt ?? "", error: message } }));
    } finally {
      window.clearTimeout(timeout);
      if (scanAbortRef.current === controller) scanAbortRef.current = null;
      scanInFlightRef.current = false;
      setLoadingScanner((current) => current === scanner ? null : current);
    }
  }, [activeScanner, instruments]);

  useEffect(() => {
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode);
    if (scanMode !== "auto" || !instruments.length) return;
    const scanWhenReady = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void runSelectedScan(activeScanner);
    };
    scanWhenReady();
    const interval = window.setInterval(scanWhenReady, AUTO_SCAN_INTERVAL_MS);
    window.addEventListener("online", scanWhenReady);
    document.addEventListener("visibilitychange", scanWhenReady);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", scanWhenReady);
      document.removeEventListener("visibilitychange", scanWhenReady);
    };
  }, [activeScanner, instruments.length, runSelectedScan, scanMode]);

  useEffect(() => () => scanAbortRef.current?.abort(), []);

  const resetPullRefresh = useCallback(() => {
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const handlePullStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (loadingScanner || (marketListRef.current?.scrollTop ?? 0) > 0) return;
    pullStartYRef.current = event.touches[0]?.clientY ?? null;
  }, [loadingScanner]);

  const handlePullMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartYRef.current === null || (marketListRef.current?.scrollTop ?? 0) > 0) return;
    const rawDistance = (event.touches[0]?.clientY ?? pullStartYRef.current) - pullStartYRef.current;
    const distance = Math.min(MAX_PULL_DISTANCE, Math.max(0, rawDistance * 0.52));
    pullDistanceRef.current = distance;
    setPullDistance(distance);
  }, []);

  const handlePullEnd = useCallback(() => {
    const shouldRefresh = pullDistanceRef.current >= PULL_REFRESH_THRESHOLD;
    resetPullRefresh();
    if (shouldRefresh) void runSelectedScan();
  }, [resetPullRefresh, runSelectedScan]);

  return (
    <section className="market-discovery-panel" aria-label="NSE market scanners">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE CASH · LIVE SCANNERS</span><h2>Markets</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <div className="trend-tabs market-scanner-tabs" role="tablist" aria-label="Market scanners">
        {scannerOptions.map((option) => <button key={option.id} className={activeScanner === option.id ? "active" : ""} onClick={() => setActiveScanner(option.id)} role="tab" aria-selected={activeScanner === option.id}>{option.label}</button>)}
      </div>
      <div className="scanner-run-row">
        <span>
          {activeSnapshot?.scannedAt && <small>Last scan {formatScanTime(activeSnapshot.scannedAt)} IST · list stays until refreshed</small>}
          <span className="scanner-mode-toggle" role="group" aria-label="Scanner refresh mode">
            <button type="button" className={scanMode === "manual" ? "active" : ""} onClick={() => setScanMode("manual")}>Manual</button>
            <button type="button" className={scanMode === "auto" ? "active" : ""} onClick={() => setScanMode("auto")}>Automatic</button>
          </span>
          {scanMode === "auto" && <small>Refreshes this scanner every minute while the app is open.</small>}
        </span>
        <button className="scanner-run-button" onClick={() => void runSelectedScan()} disabled={Boolean(loadingScanner)}>
          {loadingScanner === activeScanner ? <RefreshCw size={16} className="spin" /> : <ScanSearch size={16} />}
          {activeSnapshot?.scannedAt ? "Refresh scan" : "Scan now"}
        </button>
      </div>
      {activeSnapshot?.error && <div className="scanner-inline-error"><Cable size={16} /><span>{activeSnapshot.error} The previous result is preserved.</span></div>}
      <div
        ref={marketListRef}
        className="market-discovery-list"
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={handlePullEnd}
        onTouchCancel={resetPullRefresh}
      >
        <div
          className={`scanner-pull-indicator ${pullDistance > 0 ? "visible" : ""} ${pullDistance >= PULL_REFRESH_THRESHOLD ? "ready" : ""}`}
          style={{ height: pullDistance > 0 ? `${pullDistance}px` : undefined }}
          aria-hidden={pullDistance <= 0}
        >
          <RefreshCw size={17} />
          <span>{pullDistance >= PULL_REFRESH_THRESHOLD ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
        {activeRows.map((row) => {
          const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
          if (!item) return null;
          const liveQuote = quotes[item.instrumentKey] ?? quotes[row.symbol];
          const displayPrice = liveQuote?.lastPrice ?? row.lastPrice;
          const displayChangePercent = liveQuote?.changePercent ?? row.changePercent;
          const rowNetChange = "netChange" in row && Number.isFinite(row.netChange)
            ? row.netChange
            : deriveNetChange(row.lastPrice, row.changePercent);
          const displayNetChange = liveQuote?.netChange ?? rowNetChange;
          const detail = isVolumeRow(row)
            ? `Volume ${compactNumber(row.todayVolume)} · SMA20 ${compactNumber(row.sma20Volume)}`
            : isOpenHighRow(row)
              ? `Open ${formatInr(row.open)} · High ${formatInr(row.high)}`
              : isTechnicalRow(row)
                ? `${row.timeframe}m · ${row.signal === "breakdown" ? "Below EMA 21" : `${row.signal.toUpperCase()} ${row.setupStatus ?? "setup"}`}${row.entry ? ` · Entry ${formatInr(row.entry)}` : ""}`
                : "NSE scanner match";
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, displayPrice)}>
              <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>{detail}</small></span>
              <span><b>{formatInr(displayPrice)}</b><small className={`market-move-line ${displayChangePercent >= 0 ? "positive" : "negative"}`}>{formatSignedMarketMove(displayNetChange, displayChangePercent)}</small>{isVolumeRow(row) && <small>{row.volumeMultiple.toFixed(2)}× volume</small>}</span>
            </button>
          );
        })}
        {loadingScanner === activeScanner && !activeRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning {selectedOption.label}</b><span>Only this scanner is running. Other saved lists are unchanged.</span></div>}
        {!loadingScanner && !activeSnapshot?.scannedAt && <div className="positions-empty"><ScanSearch size={30} /><b>Ready to scan</b><span>Press Scan to load {selectedOption.label}. Nothing is fetched merely by changing tabs.</span></div>}
        {!loadingScanner && activeSnapshot?.scannedAt && !activeRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass this scan</b><span>The completed Upstox candles returned no current {selectedOption.label} setup.</span></div>}
      </div>
    </section>
  );
}
