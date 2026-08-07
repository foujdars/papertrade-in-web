"use client";

import { Activity, Cable, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FnoUnderlying } from "@/lib/fno";
import { formatInr } from "@/lib/market";
import type { NormalizedQuote } from "@/lib/upstox";

type FnoListTab = "indices" | "fno";

export function FnoListsWorkspace({
  quotes,
  starredSymbols,
  onQuoteKeysChange,
  onSelect,
  onStar,
  onClose,
}: {
  quotes: Record<string, NormalizedQuote>;
  starredSymbols: ReadonlySet<string>;
  onQuoteKeysChange: (keys: string[]) => void;
  onSelect: (underlying: FnoUnderlying) => void;
  onStar: (underlying: FnoUnderlying) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<FnoListTab>("indices");
  const [underlyings, setUnderlyings] = useState<FnoUnderlying[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/upstox/fno-underlyings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; underlyings?: FnoUnderlying[]; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "F&O instruments are unavailable.");
        setUnderlyings(payload.underlyings ?? []);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "F&O instruments are unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    onQuoteKeysChange(underlyings.map((item) => item.instrumentKey));
    return () => onQuoteKeysChange([]);
  }, [onQuoteKeysChange, underlyings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const type = tab === "indices" ? "INDEX" : "EQUITY";
    return underlyings.filter((item) => item.underlyingType === type
      && (!term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)));
  }, [search, tab, underlyings]);

  return (
    <section className="market-discovery-panel fno-lists-panel" aria-label="Indices and F&O lists">
      <div className="market-discovery-head"><div><span className="eyebrow">DERIVATIVES WORKSPACE</span><h2>Indices &amp; F&amp;O</h2></div><button className="icon-button" onClick={onClose} aria-label="Close F&O symbols"><X size={20} /></button></div>
      <nav className="trend-tabs" aria-label="F&O market lists">
        <button className={tab === "indices" ? "active" : ""} onClick={() => { setTab("indices"); setSearch(""); }}>Indices</button>
        <button className={tab === "fno" ? "active" : ""} onClick={() => { setTab("fno"); setSearch(""); }}>F&amp;O stocks</button>
      </nav>
      <label className="market-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "indices" ? "Search indices" : "Search F&O stocks"} /></label>
      <div className="market-discovery-list">
        {filtered.map((item) => {
          const quote = quotes[item.instrumentKey] ?? quotes[item.symbol];
          const starred = starredSymbols.has(item.symbol);
          return (
            <div key={item.instrumentKey} className="trend-stock-row fno-symbol-row" role="button" tabIndex={0} onClick={() => onSelect(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(item); }} aria-label={`Open ${item.symbol} chart`}>
              <span className="symbol-avatar">{item.symbol.slice(0, 2)}</span>
              <span><b>{item.symbol}</b><small>{item.name} · NSE</small></span>
              <span className="fno-symbol-quote"><b>{quote ? formatInr(quote.lastPrice) : "—"}</b><small className={quote ? quote.changePercent >= 0 ? "positive" : "negative" : ""}>{quote ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "Loading"}</small></span>
              <button type="button" className={`watchlist-star ${starred ? "saved" : ""}`} onClick={(event) => { event.stopPropagation(); onStar(item); }} aria-label={`${starred ? "Manage" : "Add"} ${item.symbol} custom watchlists`}><Star size={16} fill={starred ? "currentColor" : "none"} /></button>
            </div>
          );
        })}
        {loading && !underlyings.length && <div className="positions-empty"><Activity size={30} /><b>Loading active derivative symbols</b><span>Reading the current NSE contracts from Upstox.</span></div>}
        {!loading && error && <div className="positions-empty"><Cable size={30} /><b>F&amp;O list unavailable</b><span>{error}</span></div>}
        {!loading && !error && !filtered.length && <div className="positions-empty"><Activity size={30} /><b>No matching symbols</b><span>Try another symbol name.</span></div>}
      </div>
    </section>
  );
}
