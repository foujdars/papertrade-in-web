"use client";

import { Activity, ArrowRight, Clock3, RefreshCw, ScanSearch } from "lucide-react";
import { MarketSectionTabs } from "@/components/MarketSectionTabs";
import { CandleLoader } from "./CandleLoader";
import { usePullToRefresh } from "./usePullToRefresh";
import { StockLogo } from "@/components/StockLogo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deriveNetChange, formatInr, formatSignedMarketMove, type Instrument } from "@/lib/market";
import { NIMBLE_STRATEGIES, type NimbleStrategy, type TechnicalScannerRow } from "@/lib/nimble-scanner";
import type { NormalizedQuote } from "@/lib/upstox";
import type { OpenHighRow, VolumeBreakoutRow } from "@/lib/volume-breakout";

type ScannerId = "VOLUME" | "OPEN_HIGH" | NimbleStrategy;
export type ScannerGroup = "TRADING" | "INVESTMENT" | "IPO";
type ScannerRow = VolumeBreakoutRow | OpenHighRow | TechnicalScannerRow;
type ScannerSnapshot = { rows: ScannerRow[]; scannedAt: string; error?: string };
type ScanInstrument = Pick<Instrument, "symbol" | "name" | "instrumentKey">;
type ScannerOption = { id: ScannerId; label: string; description: string; cadence: string };

// Bump this whenever scanner eligibility rules change so that an older result
// cannot survive in localStorage and contradict the current scanner.
const STORAGE_KEY = "papertrade-market-scanner-results-v4";
const SCAN_MODE_STORAGE_KEY = "papertrade-market-scanner-mode-v1";
const SCANNER_SELECTION_STORAGE_KEY = "papertrade-market-scanner-selection-v1";
const AUTO_SCAN_INTERVAL_MS = 60_000;
const tradingScannerOptions: ScannerOption[] = [
  { id: "VOLUME", label: "Volume Shocker", description: "Unusual participation versus the 20-day average", cadence: "Live" },
  { id: "OPEN_HIGH", label: "Open = High", description: "Stocks holding the session high from the opening print", cadence: "1D" },
  ...Object.entries(NIMBLE_STRATEGIES)
    .filter(([id]) => id !== "ema-30-50-100" && id !== "rsi-divergence-daily")
    .map(([id, item]) => ({ id: id as NimbleStrategy, label: item.label, description: item.description, cadence: item.timeframe === "1D" ? "1D" : `${item.timeframe}m` })),
];
const investmentScannerOptions: ScannerOption[] = [
  { id: "ema-30-50-100", label: NIMBLE_STRATEGIES["ema-30-50-100"].label, description: NIMBLE_STRATEGIES["ema-30-50-100"].description, cadence: "1D" },
  { id: "rsi-divergence-daily", label: NIMBLE_STRATEGIES["rsi-divergence-daily"].label, description: NIMBLE_STRATEGIES["rsi-divergence-daily"].description, cadence: "1D" },
];
const allScannerOptions = [...tradingScannerOptions, ...investmentScannerOptions];
const nifty500ScannerIds = new Set<ScannerId>([
  "ema-30-50-100",
  "rsi-divergence-daily",
  "macd-orb",
  "adx-golden-cross",
  "macd-triple-ema",
]);

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



function readSavedScanner(group: ScannerGroup): ScannerId {
  if (typeof window === "undefined") return group === "INVESTMENT" ? "ema-30-50-100" : "VOLUME";
  try {
    const saved = JSON.parse(window.localStorage.getItem(SCANNER_SELECTION_STORAGE_KEY) ?? "{}") as { scannerGroup?: ScannerGroup; activeScanner?: ScannerId };
    if (saved.scannerGroup === group && allScannerOptions.some((option) => option.id === saved.activeScanner)) return saved.activeScanner!;
  } catch { /* Ignore malformed device preferences. */ }
  return group === "INVESTMENT" ? "ema-30-50-100" : "VOLUME";
}

export function MarketsWorkspace({
  stockUniverse,
  quotes,
  onQuoteKeysChange,
  onSelectCash,
  onOpenWatchlist,
  group,
  onGroupChange,
  onScannerViewed,
}: {
  stockUniverse: Instrument[];
  quotes: Record<string, NormalizedQuote>;
  onQuoteKeysChange: (keys: string[]) => void;
  onSelectCash: (instrument: Instrument, price: number) => void;
  onOpenWatchlist: () => void;
  group: "TRADING" | "INVESTMENT";
  onGroupChange: (group: "TRADING" | "INVESTMENT") => void;
  onScannerViewed?: (label: string) => void;
}) {
  const scannerGroup = group;
  const setScannerGroup = onGroupChange;
  const [activeScanner, setActiveScanner] = useState<ScannerId>(() => readSavedScanner(group));
  const [snapshots, setSnapshots] = useState<Partial<Record<ScannerId, ScannerSnapshot>>>(readSavedSnapshots);
  const [loadingScanner, setLoadingScanner] = useState<ScannerId | null>(null);
  const scanMode = "auto";
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  const marketListRef = useRef<HTMLElement | null>(null);
  const pullStageRef = useRef<HTMLDivElement | null>(null);

  const scannerOptions = scannerGroup === "INVESTMENT" ? investmentScannerOptions : tradingScannerOptions;
  const selectedOption = allScannerOptions.find((option) => option.id === activeScanner) ?? allScannerOptions[0];
  const activeSnapshot = snapshots[activeScanner];
  const activeRows = useMemo(
    () => validScannerRows(activeScanner, activeSnapshot?.rows ?? []),
    [activeScanner, activeSnapshot],
  );
  const activeAdvancers = useMemo(() => activeRows.filter((row) => row.changePercent >= 0).length, [activeRows]);
  const activeDecliners = activeRows.length - activeAdvancers;
  const instruments = useMemo(() => dedupeScanInstruments(stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }))), [stockUniverse]);
  const nifty500Instruments = useMemo(() => dedupeScanInstruments(stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey)
      && (item.categories.includes("NIFTY 500") || item.categories.includes("BANK NIFTY")))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey }))), [stockUniverse]);
  const activeQuoteKeys = useMemo(
    () => activeRows.map((row) => row.instrumentKey).filter(Boolean),
    [activeRows, scannerGroup],
  );

  useEffect(() => {
    onQuoteKeysChange(activeQuoteKeys);
    return () => onQuoteKeysChange([]);
  }, [activeQuoteKeys, onQuoteKeysChange]);

  useEffect(() => {
    window.localStorage.setItem(SCANNER_SELECTION_STORAGE_KEY, JSON.stringify({ scannerGroup, activeScanner }));
    onScannerViewed?.(selectedOption.label);
  }, [activeScanner, onGroupChange, onScannerViewed, scannerGroup, selectedOption.label]);

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
        // A successful empty result is current data, not a failed request.
        // Only failures retain the last successful snapshot and its timestamp.
        const next = {
          ...current,
          [scanner]: {
            rows,
            scannedAt: payload.fetchedAt ?? new Date().toISOString(),
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
  }, [activeScanner, instruments.length, nifty500Instruments.length, runSelectedScan, scanMode, scannerGroup]);

  useEffect(() => () => scanAbortRef.current?.abort(), []);

  usePullToRefresh(marketListRef, pullStageRef, Boolean(loadingScanner), () => runSelectedScan(undefined, true));

  return (
    <section ref={marketListRef} className="market-discovery-panel compact-market-panel" aria-label="NSE market scanners">

      <MarketSectionTabs active={scannerGroup} onChange={(section) => {
        if (section === "WATCHLIST") onOpenWatchlist();
        else setScannerGroup(section);
      }} />

      <div className="trend-tabs market-scanner-tabs" role="tablist" aria-label="Market scanners">
        {scannerOptions.map((option) => <button key={option.id} className={activeScanner === option.id ? "active" : ""} onClick={() => setActiveScanner(option.id)} role="tab" aria-selected={activeScanner === option.id}><b>{option.label}</b><small>{option.cadence}</small></button>)}
      </div>

      <div className="market-results-head">
        <span><b>{activeSnapshot?.scannedAt ? `${activeRows.length} matches` : "Scanner results"}</b><span className="market-pull-hint">Pull down to refresh</span><small role={activeSnapshot?.error ? "status" : undefined} title={activeSnapshot?.error}>{activeSnapshot?.error && "Refresh failed · "}{activeSnapshot?.scannedAt ? <><Clock3 size={12} /> Updated {formatScanTime(activeSnapshot.scannedAt)} IST</> : activeSnapshot?.error ? "Retrying automatically" : "Scanning automatically"}</small></span>
        {activeSnapshot?.scannedAt && <div><span className="positive">{activeAdvancers} rising</span><i /><span className="negative">{activeDecliners} falling</span></div>}
      </div>
      <div className="scanner-pull-stage" ref={pullStageRef} data-pull="idle">
        <div className="scanner-pull-feedback" aria-live="off"><span className="pull-hint">Pull down to refresh</span><span className="pull-ready"><RefreshCw size={15} />Release to refresh</span><span className="pull-refreshing"><CandleLoader compact label="Refreshing scanner" />Refreshing</span></div>
      <div className="market-discovery-list">
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
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, displayPrice)}>
              <StockLogo symbol={row.symbol} instrumentKey={item.instrumentKey} />
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small></span>
              <span><b>{formatInr(displayPrice)}</b><small className={`market-move-line ${displayChangePercent >= 0 ? "positive" : "negative"}`}>{formatSignedMarketMove(displayNetChange, displayChangePercent)}</small></span>
              <span className="scanner-open-chart"><ArrowRight size={15} /></span>
            </button>
          );
        })}
        {loadingScanner === activeScanner && !activeRows.length && <CandleLoader label={`Scanning ${selectedOption.label}`} />}
        {!loadingScanner && !activeSnapshot?.scannedAt && <div className="positions-empty"><ScanSearch size={30} /><b>Ready to scan</b><span>Automatically loading {selectedOption.label}. Pull down to refresh.</span></div>}
        {!loadingScanner && activeSnapshot?.scannedAt && !activeRows.length && <div className="positions-empty"><Activity size={30} /><b>{activeSnapshot.error ? "No saved matches" : "No stocks pass this scan"}</b><span>{activeSnapshot.error ? "Refresh to check for current setups." : `The completed Upstox candles returned no current ${selectedOption.label} setup.`}</span></div>}
      </div>
      </div>
    </section>
  );
}
