"use client";

import { Activity, Cable, ChevronRight, Search, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FnoUnderlying } from "@/lib/fno";
import { formatInr, type Instrument } from "@/lib/market";
import type { VolumeBreakoutRow } from "@/lib/volume-breakout";

type MarketTab = "volume" | "indices" | "fno";

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

export function MarketsWorkspace({
  volumeRows,
  volumeLoading,
  volumeError,
  stockUniverse,
  openingUnderlyingKey,
  onSelectCash,
  onSelectUnderlying,
  onClose,
}: {
  volumeRows: VolumeBreakoutRow[];
  volumeLoading: boolean;
  volumeError: string;
  stockUniverse: Instrument[];
  openingUnderlyingKey: string;
  onSelectCash: (instrument: Instrument, price: number) => void;
  onSelectUnderlying: (underlying: FnoUnderlying) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MarketTab>("volume");
  const [underlyings, setUnderlyings] = useState<FnoUnderlying[]>([]);
  const [fnoLoading, setFnoLoading] = useState(true);
  const [fnoError, setFnoError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/upstox/fno-underlyings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; underlyings?: FnoUnderlying[]; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "F&O instruments are unavailable.");
        setUnderlyings(payload.underlyings ?? []);
      })
      .catch((error) => { if (!controller.signal.aborted) setFnoError(error instanceof Error ? error.message : "F&O instruments are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setFnoLoading(false); });
    return () => controller.abort();
  }, []);

  const indexUnderlyings = useMemo(() => underlyings.filter((item) => item.underlyingType === "INDEX"), [underlyings]);
  const filteredEquityUnderlyings = useMemo(() => {
    const term = search.trim().toLowerCase();
    return underlyings.filter((item) => item.underlyingType === "EQUITY" && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)));
  }, [search, underlyings]);

  function renderUnderlying(item: FnoUnderlying) {
    const opening = openingUnderlyingKey === item.instrumentKey;
    return (
      <button
        key={item.instrumentKey}
        className="trend-stock-row fno-symbol-row"
        disabled={Boolean(openingUnderlyingKey)}
        onClick={() => onSelectUnderlying(item)}
      >
        <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
        <span><b>{item.symbol}</b><small>{item.name} · NSE</small></span>
        <span className="fno-row-action">{opening ? "Opening…" : <ChevronRight size={18} />}</span>
      </button>
    );
  }

  return (
    <section className="market-discovery-panel" aria-label="NSE markets and F&O">
      <div className="market-discovery-head"><div><span className="eyebrow">NSE market lists</span><h2>Markets</h2></div><button className="icon-button" onClick={onClose} aria-label="Close markets"><X size={20} /></button></div>
      <nav className="trend-tabs" aria-label="Market lists">
        <button className={tab === "volume" ? "active" : ""} onClick={() => setTab("volume")}>Volume Stocker</button>
        <button className={tab === "indices" ? "active" : ""} onClick={() => setTab("indices")}>Indices</button>
        <button className={tab === "fno" ? "active" : ""} onClick={() => setTab("fno")}>F&amp;O</button>
      </nav>

      {tab === "fno" && <label className="market-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search F&O symbols" /></label>}

      <div className="market-discovery-list">
        {tab === "volume" && volumeRows.map((row) => {
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
        {tab === "volume" && volumeLoading && !volumeRows.length && <div className="positions-empty"><TrendingUp size={30} /><b>Scanning NSE cash stocks</b><span>Comparing live Upstox volume with 20 daily sessions.</span></div>}
        {tab === "volume" && !volumeLoading && volumeError && <div className="positions-empty"><Cable size={30} /><b>Volume scanner unavailable</b><span>{volumeError}</span></div>}
        {tab === "volume" && !volumeLoading && !volumeError && !volumeRows.length && <div className="positions-empty"><Activity size={30} /><b>No stocks pass the filter</b><span>No NSE cash stock currently passes the configured volume rule.</span></div>}

        {tab === "indices" && indexUnderlyings.map(renderUnderlying)}
        {tab === "fno" && filteredEquityUnderlyings.map(renderUnderlying)}
        {(tab === "indices" || tab === "fno") && fnoLoading && !underlyings.length && <div className="positions-empty"><Activity size={30} /><b>Loading current NSE F&amp;O symbols</b><span>Reading today&apos;s active instruments from Upstox.</span></div>}
        {(tab === "indices" || tab === "fno") && !fnoLoading && fnoError && <div className="positions-empty"><Cable size={30} /><b>F&amp;O list unavailable</b><span>{fnoError}</span></div>}
      </div>
    </section>
  );
}
