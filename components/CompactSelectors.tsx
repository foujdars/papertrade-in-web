"use client";

import { Check, ChevronDown, Clock3, List, Plus, Star, X } from "lucide-react";
import { useEffect, useState } from "react";

export const CHART_TIMEFRAMES = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1H", "2H", "3H", "4H", "1D", "1W", "1M", "1Y"] as const;

const timeframeGroups = [
  { label: "Minutes", values: ["1m", "2m", "3m", "5m", "10m", "15m", "30m"] },
  { label: "Hours", values: ["1H", "2H", "3H", "4H"] },
  { label: "Days", values: ["1D", "1W", "1M", "1Y"] },
] as const;

const timeframeNames: Record<string, string> = {
  "1m": "1 minute", "2m": "2 minutes", "3m": "3 minutes", "5m": "5 minutes", "10m": "10 minutes", "15m": "15 minutes", "30m": "30 minutes",
  "1H": "1 hour", "2H": "2 hours", "3H": "3 hours", "4H": "4 hours",
  "1D": "1 day", "1W": "1 week", "1M": "1 month", "1Y": "1 year",
};

const FAVORITE_TIMEFRAMES_KEY = "papertrade-timeframe-favorites-v1";

function readFavoriteTimeframes() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = JSON.parse(window.localStorage.getItem(FAVORITE_TIMEFRAMES_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && Object.hasOwn(timeframeNames, item)) : [];
  } catch {
    return [];
  }
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);
}

export function ChartTimeframeMenu({ current, onSelect, onClose }: { current: string; onSelect: (timeframe: string) => void; onClose: () => void }) {
  useEscape(onClose);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => { setFavorites(readFavoriteTimeframes()); }, []);
  function toggleFavorite(value: string) {
    setFavorites((currentFavorites) => {
      const next = currentFavorites.includes(value) ? currentFavorites.filter((item) => item !== value) : [...currentFavorites, value];
      window.localStorage.setItem(FAVORITE_TIMEFRAMES_KEY, JSON.stringify(next));
      return next;
    });
  }
  const groups = favorites.length ? [{ label: "Favorites", values: favorites }, ...timeframeGroups] : timeframeGroups;
  return (
    <div className="chart-function-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="chart-function-menu timeframe-menu" role="dialog" aria-modal="true" aria-label="Choose chart timeframe" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><Clock3 size={18} /><span><b>Timeframe</b><small>Choose the candle interval</small></span></div><button onClick={onClose} aria-label="Close timeframe selector"><X size={18} /></button></header>
        <div className="timeframe-groups">
          {groups.map(({ label, values }) => (
            <section key={label}>
              <h3>{label}</h3>
              <div>
                {values.map((value) => (
                  <div key={`${label}-${value}`} className={`timeframe-line${current === value ? " active" : ""}`}>
                    <button type="button" onClick={() => onSelect(value)} aria-pressed={current === value}>{timeframeNames[value] ?? value}</button>
                    <button type="button" className={`timeframe-star${favorites.includes(value) ? " saved" : ""}`} aria-label={`${favorites.includes(value) ? "Unfavorite" : "Favorite"} ${timeframeNames[value] ?? value}`} aria-pressed={favorites.includes(value)} onClick={() => toggleFavorite(value)}><Star size={16} fill={favorites.includes(value) ? "currentColor" : "none"} /></button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

type WatchlistChoice = { id: string; name: string; count: number; custom?: boolean };

export function WatchlistSelector({ activeId, choices, onSelect, onNewList, onClose }: { activeId: string; choices: WatchlistChoice[]; onSelect: (id: string) => void; onNewList: () => void; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="watchlist-selector-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="watchlist-selector-menu" role="dialog" aria-modal="true" aria-label="Choose watchlist" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><List size={18} /><span><b>Watchlists</b><small>Choose the list to display</small></span></div><button onClick={onClose} aria-label="Close watchlist selector"><X size={18} /></button></header>
        <div className="watchlist-selector-options">
          {choices.map((choice) => (
            <button key={choice.id} className={activeId === choice.id ? "active" : ""} onClick={() => onSelect(choice.id)}>
              <span><b>{choice.name}</b><small>{choice.custom ? "Custom watchlist" : "NSE market list"}</small></span>
              <em>{choice.count}</em>
              {activeId === choice.id && <Check size={15} />}
            </button>
          ))}
        </div>
        <footer><button onClick={onNewList}><Plus size={15} /> Create custom watchlist</button></footer>
      </section>
    </div>
  );
}

export function CompactSelectorButton({ label, value, onClick, className = "" }: { label: string; value: string; onClick: () => void; className?: string }) {
  return <button className={`compact-selector-trigger ${className}`} onClick={onClick} aria-label={`${label}: ${value}`} aria-haspopup="dialog"><span><small>{label}</small><b>{value}</b></span><ChevronDown size={15} /></button>;
}
