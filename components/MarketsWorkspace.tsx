"use client";

import { Activity, Cable, TrendingUp, X } from "lucide-react";
import { formatInr, type Instrument } from "@/lib/market";
import type { VolumeBreakoutRow } from "@/lib/volume-breakout";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export function MarketsWorkspace({
  volumeRows,
  volumeLoading,
  volumeError,
  stockUniverse,
  onSelectCash,
  onClose,
}: {
  volumeRows: VolumeBreakoutRow[];
  volumeLoading: boolean;
  volumeError: string;
  stockUniverse: Instrument[];
  onSelectCash: (instrument: Instrument, price: number) => void;
  onClose: () => void;
}) {
  return (
    <section className="market-discovery-panel" aria-label="NSE volume stocker">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE CASH · LIVE SCANNER</span><h2>Volume Stocker</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <div className="market-discovery-list">
        {volumeRows.map((row) => {
          const item = stockUniverse.find((instrument) => instrument.symbol === row.symbol);
          if (!item) return null;
          return (
            <button key={row.symbol} className="trend-stock-row" onClick={() => onSelectCash(item, row.lastPrice)}>
              <span className="symbol-avatar">{row.symbol.slice(0, 2)}</span>
              <span><b>{row.symbol}</b><small>{row.name} · NSE</small><small>Volume {compactNumber(row.todayVolume)} · SMA20 {compactNumber(row.sma20Volume)}</small></span>
              <span><b>{formatInr(row.lastPrice)}</b><small className={row.changePercent >= 0 ? "positive" : "negative"}>{row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(2)}%</small><small>{row.volumeMultiple.toFixed(2)}× volume</small></span>
            </button>
          );
        })}
        {volumeLoading && !volumeRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning NSE cash stocks</b><span>Comparing live Upstox volume with 20 daily sessions.</span></div>}
        {!volumeLoading && volumeError && <div className="positions-empty"><Cable size={30} /><b>Volume scanner unavailable</b><span>{volumeError}</span></div>}
        {!volumeLoading && !volumeError && !volumeRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass the filter</b><span>No NSE cash stock currently passes the configured volume rule.</span></div>}
      </div>
    </section>
  );
}
