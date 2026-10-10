"use client";
import { Layers3, ScanSearch } from "lucide-react";
export type MarketSection = "TRADING" | "INVESTMENT" | "WATCHLIST";

/** Saved lists and scanner results share one destination, with distinct views. */
export function MarketSectionTabs({ active, onChange, scannerGroup = "TRADING" }: {
  active: MarketSection;
  onChange: (section: MarketSection) => void;
  scannerGroup?: "TRADING" | "INVESTMENT";
}) {
  const scanning = active !== "WATCHLIST";
  return <div className="watchlist-workspace-navigation">
    <nav className="market-section-tabs" aria-label="Watchlist workspace">
      <button type="button" className={!scanning ? "active" : ""} aria-current={!scanning ? "page" : undefined} onClick={() => onChange("WATCHLIST")}><Layers3 size={17} aria-hidden="true" />Watchlists</button>
      <button type="button" className={scanning ? "active" : ""} aria-current={scanning ? "page" : undefined} onClick={() => { if (!scanning) onChange(scannerGroup); }}><ScanSearch size={17} aria-hidden="true" />Scanners</button>
    </nav>
    {scanning && <nav className="scanner-group-switch" aria-label="Scanner category">
      {(["TRADING", "INVESTMENT"] as const).map(group => <button type="button" key={group} aria-pressed={active === group} onClick={() => onChange(group)}>{group === "TRADING" ? "Trading" : "Investment"}</button>)}
    </nav>}
  </div>;
}
