"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import type { Instrument } from "@/lib/market";
import { formatFuturesExpiry, futuresRootKey, type FuturesScope } from "@/lib/listed-futures";

const lotFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 10 });

export function FuturesTradeDialog({ scope, instruments, loading, warning, onClose, onRetry, onTrade }: {
  scope: FuturesScope; instruments: Instrument[]; loading: boolean; warning?: string; onClose: () => void; onRetry: () => void;
  onTrade: (item: Instrument, side: "BUY" | "SELL") => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [limit, setLimit] = useState(35);
  const indian = scope.market === "india";
  const title = scope.label ? scope.label + " futures" : "Trade futures";
  const matches = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return instruments.filter(item => {
      const market = item.exchange === "DELTA" ? "global" : "india";
      if (market !== scope.market || (scope.rootKey && futuresRootKey(item) !== scope.rootKey)) return false;
      if (group === "Indices" && !item.categories.includes("INDEX")) return false;
      if (group === "Stocks" && !item.categories.includes("EQUITY")) return false;
      if (group === "MCX" && item.exchange !== "MCX") return false;
      const description = [item.symbol, item.underlyingSymbol, item.name, item.exchange, item.expiry || "perpetual"].join(" ").toLowerCase();
      return terms.every(term => description.includes(term));
    });
  }, [scope.rootKey, scope.market, instruments, query, group]);
  return <AppDialog className="futures-picker" label={title} avoidTouchKeyboard initialFocus=".futures-search input" containEscape onClose={onClose}>
    <header><div><h2>{title}</h2><small>{indian ? "Indian markets · INR" : "Delta Exchange India · USD"}</small></div>
      <button type="button" aria-label="Close futures" onClick={onClose}><X size={18}/></button></header>
    {!scope.rootKey && <div className="futures-filters">
      <label className="futures-search"><Search size={17}/><input aria-label="Search futures contracts" placeholder="Search underlying or contract" value={query}
        onChange={e => { setQuery(e.target.value); setLimit(35); }}/></label>
      {indian && <div role="group" aria-label="Futures market">{["All","Indices","Stocks","MCX"].map(value =>
        <button type="button" key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setLimit(35); }}>{value}</button>)}</div>}
    </div>}
    {warning && <p role="status">{warning} <button type="button" className="futures-more" onClick={onRetry}>Retry</button></p>}
    <div className="futures-contracts">
      {matches.slice(0,limit).map(item => <article key={item.instrumentKey}>
        <div><small>{item.exchange} · {formatFuturesExpiry(item.expiry)}</small>
          <strong>{item.symbol}</strong><span>1 lot = {lotFormat.format((item.exchange === "DELTA" ? item.contractMultiplier : item.lotSize)!)} {item.exchange === "DELTA" ? item.underlyingSymbol : "units"}</span></div>
        {(["BUY","SELL"] as const).map(side => <button type="button" data-side={side} key={side} aria-label={`${side === "BUY" ? "Buy" : "Sell"} ${item.symbol}`}
          onClick={() => onTrade(item,side)}>{side === "BUY" ? "Buy" : "Sell"}</button>)}
      </article>)}
      {!matches.length && <p role="status">{loading ? "Loading listed contracts…" : query ? "No matching futures contracts." : "No active futures available."}</p>}
      {matches.length > limit && <button type="button" className="futures-more" onClick={() => setLimit(n => n + 50)}>Show more contracts</button>}
    </div>
  </AppDialog>;
}
