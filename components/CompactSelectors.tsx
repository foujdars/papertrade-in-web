"use client";

import { Activity, CalendarRange, Check, ChevronDown, Clock3, List, PenTool, Plus, Settings, X } from "lucide-react";
import { useEffect } from "react";

export const CHART_TIMEFRAMES = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1H", "2H", "3H", "4H", "1D", "1W", "1M", "1Y"] as const;

const timeframeGroups = [
  { label: "Minutes", icon: Clock3, values: ["1m", "2m", "3m", "5m", "10m", "15m", "30m"] },
  { label: "Hours", icon: Clock3, values: ["1H", "2H", "3H", "4H"] },
  { label: "Days & longer", icon: CalendarRange, values: ["1D", "1W", "1M", "1Y"] },
] as const;

function useEscape(onClose: () => void) {
  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);
}

export function ChartTimeframeMenu({ current, onSelect, onIndicators, onDrawings, onSettings, onClose }: { current: string; onSelect: (timeframe: string) => void; onIndicators: () => void; onDrawings: () => void; onSettings: () => void; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="chart-function-backdrop" role="presentation" onPointerDown={onClose}>
      <section className="chart-function-menu timeframe-menu" role="dialog" aria-modal="true" aria-label="Choose chart timeframe" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><Clock3 size={18} /><span><b>Timeframe</b><small>Choose the candle interval</small></span></div><button onClick={onClose} aria-label="Close timeframe selector"><X size={18} /></button></header>
        <nav className="chart-menu-tabs" aria-label="Chart menu sections">
          <button className="active"><Clock3 size={16} /><span><b>{current}</b><small>Range</small></span></button>
          <button onClick={onIndicators}><Activity size={16} /><span><b>Indicators</b><small>Studies</small></span></button>
          <button onClick={onDrawings}><PenTool size={16} /><span><b>Drawings</b><small>Tools</small></span></button>
          <button onClick={onSettings}><Settings size={16} /><span><b>Settings</b><small>View</small></span></button>
        </nav>
        <div className="timeframe-groups">
          {timeframeGroups.map(({ label, icon: Icon, values }) => (
            <section key={label}>
              <h3><Icon size={14} />{label}</h3>
              <div>
                {values.map((value) => <button key={value} className={current === value ? "active" : ""} onClick={() => onSelect(value)} aria-pressed={current === value}>{value}{current === value && <Check size={13} />}</button>)}
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
  return <button className={`compact-selector-trigger ${className}`} onClick={onClick} aria-haspopup="dialog"><span><small>{label}</small><b>{value}</b></span><ChevronDown size={15} /></button>;
}
