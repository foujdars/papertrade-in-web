"use client";

import { Activity, Cable, RefreshCw, ScanSearch, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveNetChange, formatInr, formatSignedMarketMove, type Instrument } from "@/lib/market";
import { NIMBLE_STRATEGIES, type NimbleStrategy, type TechnicalScannerRow } from "@/lib/nimble-scanner";
import type { NormalizedQuote } from "@/lib/upstox";
import type { OpenHighRow, VolumeBreakoutRow } from "@/lib/volume-breakout";

type ScannerId = "VOLUME" | "OPEN_HIGH" | NimbleStrategy;
type ScannerGroup = "TRADING" | "INVESTMENT";
type ScannerRow = VolumeBreakoutRow | OpenHighRow | TechnicalScannerRow;
type ScannerSnapshot = { rows: ScannerRow[]; scannedAt: string; error?: string };
type ScanInstrument = Pick<Instrument, "symbol" | "name" | "instrumentKey">;

// Bump this whenever scanner eligibility rules change so that an older result
// cannot survive in localStorage and contradict the current scanner.
const STORAGE_KEY = "papertrade-market-scanner-results-v4";
const SCAN_MODE_STORAGE_KEY = "papertrade-market-scanner-mode-v1";
const AUTO_SCAN_INTERVAL_MS = 60_000;
const PULL_REFRESH_THRESHOLD = 58;
const MAX_PULL_DISTANCE = 86;
const tradingScannerOptions: Array<{ id: ScannerId; label: string }> = [
  { id: "VOLUME", label: "Volume Shocker" },
  { id: "OPEN_HIGH", label: "Open = High" },
  ...Object.entries(NIMBLE_STRATEGIES)
    .filter(([id]) => id !== "ema-30-50-100" && id !== "rsi-divergence-daily")
    .map(([id, item]) => ({ id: id as NimbleStrategy, label: item.label })),
];
const investmentScannerOptions: Array<{ id: ScannerId; label: string }> = [
  { id: "ema-30-50-100", label: NIMBLE_STRATEGIES["ema-30-50-100"].label },
  { id: "rsi-divergence-daily", label: NIMBLE_STRATEGIES["rsi-divergence-daily"].label },
];
const allScannerOptions = [...tradingScannerOptions, ...investmentScannerOptions];
const nifty500ScannerIds = new Set<ScannerId>([
  "ema-30-50-100",
  "rsi-divergence-daily",
  "macd-orb",
  "adx-golden-cross",
  "macd-triple-ema",
]);

function isInvestmentScanner(scanner: ScannerId) {
  return scanner === "ema-30-50-100" || scanner === "rsi-divergence-daily";
}

function usesNifty500Universe(scanner: ScannerId) {
  return nifty500ScannerIds.has(scanner);
}

function normalizedScannerSymbol(symbol: string) {
  return symbol.trim().toUpperCase().replace(/-(?:EQ|BE|BZ|SM|ST)$/, "");
}

function dedupeScanInstruments(items: ScanInstrument[]) {
  const unique = new Map<string, ScanInstrument>();
  for (const item of items) {
    const key = normalizedScannerSymbol(item.symbol) || item.instrumentKey;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function dedupeScannerRows(rows: ScannerRow[]) {
  const unique = new Map<string, ScannerRow>();
  for (const row of rows) {
    const key = normalizedScannerSymbol(row.symbol) || row.instrumentKey;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

function validScannerRows(scanner: ScannerId, rows: ScannerRow[]) {
  const uniqueRows = dedupeScannerRows(rows);
  if (scanner !== "rsi-divergence-daily") return uniqueRows;
  // The first pivot is validated server-side as oversold. The second RSI low
  // may recover above 30, but the setup is no longer active at neutral RSI 50.
  return uniqueRows.filter((row) => isTechnicalRow(row)
    && typeof row.indicatorValue === "number"
    && Number.isFinite(row.indicatorValue)
    && row.indicatorValue < 50);
}

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
  const [scannerGroup, setScannerGroup] = useState<ScannerGroup>("TRADING");
  const [activeScanner, setActiveScanner] = useState<ScannerId>("VOLUME");
  const [snapshots, setSnapshots] = useState<Partial<Record<ScannerId, ScannerSnapshot>>>(readSavedSnapshots);
  const [loadingScanner, setLoadingScanner] = useState<ScannerId | null>(null);
  const [scanMode, setScanMode] = useState<"manual" | "auto">(readScanMode);
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  const initialScanAttemptedRef = useRef<Set<ScannerId>>(new Set());
  const marketListRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);

  const scannerOptions = scannerGroup === "INVESTMENT" ? investmentScannerOptions : tradingScannerOptions;
  const selectedOption = allScannerOptions.find((option) => option.id === activeScanner) ?? allScannerOptions[0];
  const activeSnapshot = snapshots[activeScanner];
  const activeRows = useMemo(
    () => validScannerRows(activeScanner, activeSnapshot?.rows ?? []),
    [activeScanner, activeSnapshot],
  );
  const instruments = useMemo(() => dedupeScanInstruments(stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }))), [stockUniverse]);
  const nifty500Instruments = useMemo(() => dedupeScanInstruments(stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey)
      && (item.categories.includes("NIFTY 500") || item.categories.includes("BANK NIFTY")))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }))), [stockUniverse]);
  const activeQuoteKeys = useMemo(() => activeRows.map((row) => row.instrumentKey).filter(Boolean), [activeRows]);

  useEffect(() => {
    onQuoteKeysChange(activeQuoteKeys);
    return () => onQuoteKeysChange([]);
  }, [activeQuoteKeys, onQuoteKeysChange]);

  const runSelectedScan = useCallback(async (requestedScanner?: ScannerId, force = false) => {
    if (scanInFlightRef.current) return;
    const scanner = requestedScanner ?? activeScanner;
    const scanInstruments = usesNifty500Universe(scanner) ? nifty500Instruments : instruments;
    if (!scanInstruments.length) return;
    const option = allScannerOptions.find((item) => item.id === scanner) ?? allScannerOptions[0];
    const controller = new AbortController();
    scanAbortRef.current?.abort();
    scanAbortRef.current = controller;
    scanInFlightRef.current = true;
    setLoadingScanner(scanner);
    const timeout = window.setTimeout(() => controller.abort(), usesNifty500Universe(scanner) ? 75_000 : 45_000);
    try {
      const technical = scanner !== "VOLUME" && scanner !== "OPEN_HIGH";
      const response = await fetch(technical ? "/api/market/technical-scanner" : "/api/market/volume-breakouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments: scanInstruments, force, ...(technical ? { strategy: scanner } : { mode: scanner }) }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json() as { ok?: boolean; rows?: ScannerRow[]; openHighRows?: OpenHighRow[]; fetchedAt?: string; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `${option.label} is unavailable.`);
      const rows = validScannerRows(scanner, scanner === "OPEN_HIGH" ? (payload.openHighRows ?? payload.rows ?? []) : (payload.rows ?? []));
      setSnapshots((current) => {
        const previousRows = current[scanner]?.rows ?? [];
        // An empty strict RSI-divergence scan means that there are currently
        // no eligible setups. Never substitute an old oversold reading here.
        const preservePrevious = scanner !== "rsi-divergence-daily" && rows.length === 0 && previousRows.length > 0;
        const next = {
          ...current,
          [scanner]: {
            rows: preservePrevious ? previousRows : rows,
            scannedAt: payload.fetchedAt ?? new Date().toISOString(),
            ...(preservePrevious ? { error: "No fresh matches were returned. The last successful list is still shown." } : {}),
          },
        };
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
  }, [activeScanner, instruments, nifty500Instruments]);

  // Refresh a missing/previously-empty scanner once per app session even when
  // the user had selected manual mode. Old empty snapshots should never leave
  // the Volume Shocker looking permanently broken.
  useEffect(() => {
    const universeAvailable = usesNifty500Universe(activeScanner) ? nifty500Instruments.length > 0 : instruments.length > 0;
    if (!universeAvailable || loadingScanner || activeRows.length > 0 || initialScanAttemptedRef.current.has(activeScanner)) return;
    initialScanAttemptedRef.current.add(activeScanner);
    void runSelectedScan(activeScanner, true);
  }, [activeRows.length, activeScanner, instruments.length, loadingScanner, nifty500Instruments.length, runSelectedScan]);

  useEffect(() => {
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode);
    const universeAvailable = usesNifty500Universe(activeScanner) ? nifty500Instruments.length > 0 : instruments.length > 0;
    if (scanMode !== "auto" || !universeAvailable) return;
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
  }, [activeScanner, instruments.length, nifty500Instruments.length, runSelectedScan, scanMode]);

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
    if (shouldRefresh) void runSelectedScan(undefined, true);
  }, [resetPullRefresh, runSelectedScan]);

  return (
    <section className="market-discovery-panel" aria-label="NSE market scanners">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE CASH · LIVE SCANNERS</span><h2>Markets</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <div className="scanner-family-tabs" role="tablist" aria-label="Scanner category">
        <button
          type="button"
          className={scannerGroup === "TRADING" ? "active" : ""}
          onClick={() => {
            setScannerGroup("TRADING");
            if (isInvestmentScanner(activeScanner)) setActiveScanner("VOLUME");
          }}
          role="tab"
          aria-selected={scannerGroup === "TRADING"}
        >
          Trading
        </button>
        <button
          type="button"
          className={scannerGroup === "INVESTMENT" ? "active" : ""}
          onClick={() => {
            setScannerGroup("INVESTMENT");
            if (!isInvestmentScanner(activeScanner)) setActiveScanner("ema-30-50-100");
          }}
          role="tab"
          aria-selected={scannerGroup === "INVESTMENT"}
        >
          Investment · NIFTY 500
        </button>
      </div>
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
        <button className="scanner-run-button" onClick={() => void runSelectedScan(undefined, true)} disabled={Boolean(loadingScanner)}>
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
                ? `${row.timeframe === "1D" ? "1D" : `${row.timeframe}m`} · ${row.signal === "breakdown" ? "Below EMA 21" : `${row.signal.toUpperCase()} ${row.setupStatus ?? "setup"}`}${row.entry ? ` · Entry ${formatInr(row.entry)}` : ""}`
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
