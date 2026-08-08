"use client";

import { Activity, Cable, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { formatInr, type Instrument } from "@/lib/market";
import type { OpenHighRow, VolumeBreakoutRow } from "@/lib/volume-breakout";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export function MarketsWorkspace({
  volumeRows,
  openHighRows,
  volumeLoading,
  volumeError,
  stockUniverse,
  onSelectCash,
  onClose,
  showScannerTabs,
}: {
  volumeRows: VolumeBreakoutRow[];
  openHighRows: OpenHighRow[];
  volumeLoading: boolean;
  volumeError: string;
  stockUniverse: Instrument[];
  onSelectCash: (instrument: Instrument, price: number) => void;
  onClose: () => void;
  showScannerTabs: boolean;
}) {
  const [activeScanner, setActiveScanner] = useState<"VOLUME" | "OPEN_HIGH">("VOLUME");
  const showOpenHigh = showScannerTabs && activeScanner === "OPEN_HIGH";
  const activeRows = showOpenHigh ? openHighRows : volumeRows;

  return (
    <section className="market-discovery-panel" aria-label="NSE volume stocker">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE CASH · LIVE SCANNER</span><h2>Volume Stocker</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      {showScannerTabs && <div className="trend-tabs market-scanner-tabs" role="tablist" aria-label="Market scanners">
        <button className={activeScanner === "VOLUME" ? "active" : ""} onClick={() => setActiveScanner("VOLUME")} role="tab" aria-selected={activeScanner === "VOLUME"}>Volume Shocker</button>
        <button className={activeScanner === "OPEN_HIGH" ? "active" : ""} onClick={() => setActiveScanner("OPEN_HIGH")} role="tab" aria-selected={activeScanner === "OPEN_HIGH"}>Open = High</button>
      </div>}
      <div className="market-discovery-list">
        {activeRows.map((row) => {
          const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
          if (!item) return null;
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, row.lastPrice)}>
              <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>{showOpenHigh ? `Open ${formatInr((row as OpenHighRow).open)} · High ${formatInr((row as OpenHighRow).high)}` : `Volume ${compactNumber((row as VolumeBreakoutRow).todayVolume)} · SMA20 ${compactNumber((row as VolumeBreakoutRow).sma20Volume)}`}</small></span>
              <span><b>{formatInr(row.lastPrice)}</b><small className={row.changePercent >= 0 ? "positive" : "negative"}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</small>{!showOpenHigh && <small>{(row as VolumeBreakoutRow).volumeMultiple.toFixed(2)}× volume</small>}</span>
            </button>
          );
        })}
        {volumeLoading && !activeRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning NSE cash stocks</b><span>{showOpenHigh ? "Finding stocks whose session open equals the day high." : "Comparing live Upstox volume with 20 daily sessions."}</span></div>}
        {!volumeLoading && volumeError && <div className="positions-empty"><Cable size={30} /><b>Volume scanner unavailable</b><span>{volumeError}</span></div>}
        {!volumeLoading && !volumeError && !activeRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass the filter</b><span>{showOpenHigh ? "No live NSE cash stock currently has Open = High." : "No NSE cash stock currently passes the configured volume rule."}</span></div>}
      </div>
    </section>
  );
}
