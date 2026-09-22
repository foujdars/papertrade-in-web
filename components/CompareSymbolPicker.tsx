"use client";

import { Check, Diamond, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { COMPARE_SUGGESTIONS, MAX_COMPARED_SYMBOLS, type ComparedSymbol } from "@/lib/chart-compare";
import { useChartPreference } from "@/lib/chart-view-preferences";
import { compareMarketInstruments, marketDisplayName } from "@/lib/market-directory";
import type { Instrument } from "@/lib/market";
import { StockLogo } from "./StockLogo";
import { useTransientBack } from "./useTransientBack";

function asCompared(item: Instrument): ComparedSymbol {
  return {
    instrumentKey: item.instrumentKey,
    symbol: item.symbol,
    name: marketDisplayName(item),
    exchange: item.exchange || (item.instrumentKey.startsWith("DELTA|") ? "DELTA" : item.instrumentKey.startsWith("TVC|") ? "TVC" : "NSE"),
  };
}

export function CompareSymbolPicker({
  instruments,
  currentKey,
  onClose,
}: {
  instruments: Instrument[];
  currentKey?: string;
  onClose: () => void;
}) {
  const [compared, setCompared] = useChartPreference("comparedSymbols");
  const [query, setQuery] = useState("");
  useTransientBack(true, onClose);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const available = useMemo(() => {
    const term = query.trim().toLowerCase();
    return instruments
      .filter((item) => item.instrumentKey !== currentKey && item.assetType !== "OPTION")
      .filter((item) => !term || item.symbol.toLowerCase().includes(term) || item.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const suggested = Number(COMPARE_SUGGESTIONS.includes(b.symbol)) - Number(COMPARE_SUGGESTIONS.includes(a.symbol));
        return suggested || compareMarketInstruments(a, b);
      })
      .slice(0, 80);
  }, [currentKey, instruments, query]);

  function toggle(item: Instrument) {
    setCompared((current) => {
      if (current.some((row) => row.instrumentKey === item.instrumentKey)) {
        return current.filter((row) => row.instrumentKey !== item.instrumentKey);
      }
      if (current.length >= MAX_COMPARED_SYMBOLS) return current;
      return [...current, asCompared(item)];
    });
  }

  return (
    <div className="chart-function-backdrop compare-picker-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="chart-function-menu compare-picker-menu" role="dialog" aria-modal="true" aria-label="Compare symbols" onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><Diamond size={18} /><span><b>Compare symbols</b><small>Overlay other series on this chart</small></span></div>
          <button type="button" onClick={onClose} aria-label="Close compare symbols"><X size={18} /></button>
        </header>
        <label className="indicator-search">
          <Search size={18} />
          <input aria-label="Search symbols to compare" placeholder="Search Nifty, S&P, BTC…" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && <button type="button" aria-label="Clear compare search" onClick={() => setQuery("")}><X size={16} /></button>}
        </label>
        {compared.length > 0 && (
          <div className="compare-selected-chips">
            {compared.map((item) => (
              <button key={item.instrumentKey} type="button" onClick={() => setCompared((current) => current.filter((row) => row.instrumentKey !== item.instrumentKey))}>
                <b>{item.symbol}</b><X size={12} />
              </button>
            ))}
          </div>
        )}
        <div className="compare-picker-list">
          {available.map((item) => {
            const added = compared.some((row) => row.instrumentKey === item.instrumentKey);
            const full = !added && compared.length >= MAX_COMPARED_SYMBOLS;
            return (
              <button key={item.instrumentKey} type="button" className={added ? "added" : ""} disabled={full} onClick={() => toggle(item)}>
                <span className="stock-identity"><StockLogo {...item} size={30} /><span><b>{item.symbol}</b><small>{marketDisplayName(item)}</small></span></span>
                {added ? <Check size={16} /> : <small>{item.exchange}</small>}
              </button>
            );
          })}
          {!available.length && <p className="indicator-empty">No matching symbols to overlay.</p>}
        </div>
        <footer><small>{compared.length}/{MAX_COMPARED_SYMBOLS} overlays · percentage scale turns on automatically</small></footer>
      </section>
    </div>
  );
}
