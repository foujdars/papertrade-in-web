"use client";

import { Activity, ArrowRight, Clock3, RefreshCw, ScanSearch } from "lucide-react";
import { TRADING_GROUPS, tradingUniverse, type TradingGroup } from "@/lib/trading-universes";
import type { FnoUnderlying } from "@/lib/fno";
import { WorkspaceListPicker } from "./WorkspaceListPicker";
import { MarketSectionTabs } from "@/components/MarketSectionTabs";
import { CandleLoader } from "./CandleLoader";
import { usePullToRefresh } from "./usePullToRefresh";
import { StockLogo } from "@/components/StockLogo";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
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

function readSavedSnapshots(storageKey: string) {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as Partial<Record<ScannerId, ScannerSnapshot>>;
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

type WorkspaceProps = {
  stockUniverse: Instrument[];
  quotes: Record<string, NormalizedQuote>;
  onQuoteKeysChange: (keys: string[]) => void;
  onSelectCash: (instrument: Instrument, price: number) => void;
  onOpenWatchlist: () => void;
  group: "TRADING" | "INVESTMENT";
  onGroupChange: (group: "TRADING" | "INVESTMENT") => void;
  onScannerViewed?: (label: string) => void;
  underlyings: FnoUnderlying[];
  tradingScanner: (universe: TradingGroup) => ReactNode;
};
const MTF_SELECTION_KEY = "papertrade-scanner-workspace-selection";

export function MarketsWorkspace(props: WorkspaceProps) {
  const scrollHost = useRef<HTMLElement | null>(null);
  const [universe, setUniverse] = useState<TradingGroup>(() => {
    try { const saved = localStorage.getItem(`papertrade-scanner-universe:${props.group}`); if (TRADING_GROUPS.includes(saved as TradingGroup)) return saved as TradingGroup; } catch {}
    return "Nifty 50 stocks";
  });
  useEffect(() => { try { localStorage.setItem(`papertrade-scanner-universe:${props.group}`, universe); } catch {} }, [props.group, universe]);
  const scopedInstruments = useMemo(() => tradingUniverse(universe, props.stockUniverse, props.underlyings), [universe, props.stockUniverse, props.underlyings]);
  const options = props.group === "INVESTMENT" ? investmentScannerOptions : tradingScannerOptions;
  const [selection, setSelection] = useState<ScannerId | "PSBB_MTF">(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MTF_SELECTION_KEY) ?? "{}")[props.group];
      if ((props.group === "TRADING" && saved === "PSBB_MTF") || options.some(option => option.id === saved)) return saved;
    } catch { /* Use the default scanner when storage is unavailable. */ }
    return props.group === "TRADING" ? "PSBB_MTF" : readSavedScanner(props.group);
  });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MTF_SELECTION_KEY) ?? "{}");
      localStorage.setItem(MTF_SELECTION_KEY, JSON.stringify({ ...saved, [props.group]: selection }));
    } catch { /* The current selection remains usable without storage. */ }
  }, [props.group, selection]);
  return <section ref={scrollHost} className="market-discovery-panel scanner-workspace" aria-label="Scanners">
    <MarketSectionTabs active={props.group} onChange={section => section === "WATCHLIST" ? props.onOpenWatchlist() : props.onGroupChange(section)} />
    <div className="scanner-filter-row"><div className="scanner-choice"><span>Scanner</span><WorkspaceListPicker label="Choose scanner" title="Choose scanner" value={selection} onChange={value => setSelection(value as ScannerId | "PSBB_MTF")} choices={[
      ...(props.group === "TRADING" ? [{ id: "PSBB_MTF", label: "PSBB · Multi-timeframe", description: "Confirmed divergences across five timeframes", badge: "MTF" }] : []),
      ...options.map(option => ({ id: option.id, label: option.label, description: option.description, badge: option.cadence })),
    ]} /></div><div className="scanner-choice"><span>Universe</span><WorkspaceListPicker label="Trading stock universe" title="Choose universe" value={universe} onChange={value => setUniverse(value as TradingGroup)} choices={TRADING_GROUPS.map(item => ({ id: item, label: item }))} /></div></div>
    {selection === "PSBB_MTF" ? props.tradingScanner(universe) : <ScannerResults key={`${selection}:${universe}`} {...props} stockUniverse={scopedInstruments} universe={universe} scrollHost={scrollHost} activeScanner={selection} />}
  </section>;
}

function ScannerResults({ stockUniverse, quotes, onQuoteKeysChange, onSelectCash, onScannerViewed, group: scannerGroup, activeScanner, universe, scrollHost }: WorkspaceProps & { universe: TradingGroup; activeScanner: ScannerId; scrollHost: RefObject<HTMLElement | null> }) {
  const storageKey = `${STORAGE_KEY}:universe:${universe}`;
  const [snapshots, setSnapshots] = useState<Partial<Record<ScannerId, ScannerSnapshot>>>(() => readSavedSnapshots(storageKey));
  const [loadingScanner, setLoadingScanner] = useState<ScannerId | null>(null);
  const scanMode = "auto";
  const scanInFlightRef = useRef(false);
  const scanAbortRef = useRef<AbortController | null>(null);
  const pullStageRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = allScannerOptions.find((option) => option.id === activeScanner) ?? allScannerOptions[0];
  const activeSnapshot = snapshots[activeScanner];
  const activeRows = useMemo(
    () => validScannerRows(activeScanner, activeSnapshot?.rows ?? []),
    [activeScanner, activeSnapshot],
  );
  const activeAdvancers = useMemo(() => activeRows.filter((row) => row.changePercent >= 0).length, [activeRows]);
  const activeDecliners = activeRows.length - activeAdvancers;
  const instruments = useMemo(() => dedupeScanInstruments(stockUniverse
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
  }, [activeScanner, onScannerViewed, scannerGroup, selectedOption.label]);

  const runSelectedScan = useCallback(async (requestedScanner?: ScannerId, force = false) => {
    if (scanInFlightRef.current) return;
    const scanner = requestedScanner ?? activeScanner;
    const scanInstruments = instruments;
    if (!scanInstruments.length) return;
    const option = allScannerOptions.find((item) => item.id === scanner) ?? allScannerOptions[0];
    const controller = new AbortController();
    scanAbortRef.current?.abort();
    scanAbortRef.current = controller;
    scanInFlightRef.current = true;
    setLoadingScanner(scanner);
    const timeout = window.setTimeout(() => controller.abort(), 75_000);
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
        window.localStorage.setItem(storageKey, JSON.stringify(next));
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
  }, [activeScanner, instruments, storageKey]);

  useEffect(() => {
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, scanMode);
    const universeAvailable = instruments.length > 0;
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
  }, [activeScanner, instruments.length, runSelectedScan, scanMode, scannerGroup]);

  useEffect(() => () => scanAbortRef.current?.abort(), []);

  usePullToRefresh(scrollHost, pullStageRef, Boolean(loadingScanner), () => runSelectedScan(undefined, true));

  return (
    <section className="scanner-results compact-market-panel" aria-label="NSE market scanners">

      <p className="tw-scope">{universe} · {instruments.length} symbols · {selectedOption.label}</p>
      <div className="market-results-head">
        <button type="button" className="scanner-refresh" disabled={Boolean(loadingScanner)} onClick={() => void runSelectedScan(undefined, true)} aria-label="Refresh scanner"><RefreshCw size={15} /></button>
        <span><b>{activeSnapshot?.scannedAt ? `${activeRows.length} matches` : "Scanner results"}</b><small role={activeSnapshot?.error ? "status" : undefined} title={activeSnapshot?.error}>{activeSnapshot?.error && "Refresh failed · "}{activeSnapshot?.scannedAt ? <><Clock3 size={12} /> Updated {formatScanTime(activeSnapshot.scannedAt)} IST</> : activeSnapshot?.error ? "Retrying automatically" : instruments.length ? "Scanning automatically" : "Universe constituents unavailable"}</small></span>
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
