"use client";

import { Activity, Cable, RefreshCw, ScanSearch, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatInr, type Instrument } from "@/lib/market";
import { NIMBLE_STRATEGIES, type NimbleStrategy, type TechnicalScannerRow } from "@/lib/nimble-scanner";
import type { OpenHighRow, VolumeBreakoutRow } from "@/lib/volume-breakout";

type ScannerId = "VOLUME" | "OPEN_HIGH" | NimbleStrategy;
type ScannerRow = VolumeBreakoutRow | OpenHighRow | TechnicalScannerRow;
type ScannerSnapshot = { rows: ScannerRow[]; scannedAt: string; error?: string };

const STORAGE_KEY = "papertrade-market-scanner-results-v1";
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

export function MarketsWorkspace({
  stockUniverse,
  onSelectCash,
  onClose,
}: {
  stockUniverse: Instrument[];
  onSelectCash: (instrument: Instrument, price: number) => void;
  onClose: () => void;
}) {
  const [activeScanner, setActiveScanner] = useState<ScannerId>("VOLUME");
  const [snapshots, setSnapshots] = useState<Partial<Record<ScannerId, ScannerSnapshot>>>(readSavedSnapshots);
  const [loadingScanner, setLoadingScanner] = useState<ScannerId | null>(null);

  const selectedOption = scannerOptions.find((option) => option.id === activeScanner) ?? scannerOptions[0];
  const activeSnapshot = snapshots[activeScanner];
  const activeRows = activeSnapshot?.rows ?? [];
  const instruments = useMemo(() => stockUniverse
    .filter((item) => /^NSE_EQ\|INE[A-Z0-9]+$/.test(item.instrumentKey))
    .map(({ symbol, name, instrumentKey }) => ({ symbol, name, instrumentKey })), [stockUniverse]);

  async function runSelectedScan() {
    if (loadingScanner || !instruments.length) return;
    const scanner = activeScanner;
    setLoadingScanner(scanner);
    try {
      const technical = scanner !== "VOLUME" && scanner !== "OPEN_HIGH";
      const response = await fetch(technical ? "/api/market/technical-scanner" : "/api/market/volume-breakouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments, ...(technical ? { strategy: scanner } : { mode: scanner }) }),
        cache: "no-store",
      });
      const payload = await response.json() as { ok?: boolean; rows?: ScannerRow[]; openHighRows?: OpenHighRow[]; fetchedAt?: string; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `${selectedOption.label} is unavailable.`);
      const rows = scanner === "OPEN_HIGH" ? (payload.openHighRows ?? payload.rows ?? []) : (payload.rows ?? []);
      setSnapshots((current) => {
        const next = { ...current, [scanner]: { rows, scannedAt: payload.fetchedAt ?? new Date().toISOString() } };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${selectedOption.label} is unavailable.`;
      setSnapshots((current) => ({ ...current, [scanner]: { rows: current[scanner]?.rows ?? [], scannedAt: current[scanner]?.scannedAt ?? "", error: message } }));
    } finally {
      setLoadingScanner(null);
    }
  }

  return (
    <section className="market-discovery-panel" aria-label="NSE market scanners">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE CASH · LIVE SCANNERS</span><h2>Markets</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <div className="trend-tabs market-scanner-tabs" role="tablist" aria-label="Market scanners">
        {scannerOptions.map((option) => <button key={option.id} className={activeScanner === option.id ? "active" : ""} onClick={() => setActiveScanner(option.id)} role="tab" aria-selected={activeScanner === option.id}>{option.label}</button>)}
      </div>
      <div className="scanner-run-row">
        {activeSnapshot?.scannedAt && <span><small>Last scan {formatScanTime(activeSnapshot.scannedAt)} IST · list stays until refreshed</small></span>}
        <button className="scanner-run-button" onClick={runSelectedScan} disabled={Boolean(loadingScanner)}>
          {loadingScanner === activeScanner ? <RefreshCw size={16} className="spin" /> : <ScanSearch size={16} />}
          {activeSnapshot?.scannedAt ? "Refresh scan" : "Scan"}
        </button>
      </div>
      {activeSnapshot?.error && <div className="scanner-inline-error"><Cable size={16} /><span>{activeSnapshot.error} The previous result is preserved.</span></div>}
      <div className="market-discovery-list">
        {activeRows.map((row) => {
          const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
          if (!item) return null;
          const detail = isVolumeRow(row)
            ? `Volume ${compactNumber(row.todayVolume)} · SMA20 ${compactNumber(row.sma20Volume)}`
            : isOpenHighRow(row)
              ? `Open ${formatInr(row.open)} · High ${formatInr(row.high)}`
              : isTechnicalRow(row)
                ? `${row.timeframe}m · ${row.signal === "breakdown" ? "Below EMA 21" : `${row.signal.toUpperCase()} ${row.setupStatus ?? "setup"}`}${row.entry ? ` · Entry ${formatInr(row.entry)}` : ""}`
                : "NSE scanner match";
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, row.lastPrice)}>
              <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>{detail}</small></span>
              <span><b>{formatInr(row.lastPrice)}</b><small className={row.changePercent >= 0 ? "positive" : "negative"}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</small>{isVolumeRow(row) && <small>{row.volumeMultiple.toFixed(2)}× volume</small>}</span>
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
