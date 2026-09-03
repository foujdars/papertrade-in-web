"use client";

import { Layers3, TrendingUp, Zap } from "lucide-react";

export type MarketSection = "TRADING" | "INVESTMENT" | "WATCHLIST";

const sections = [
  { id: "TRADING", label: "Trading", icon: Zap },
  { id: "INVESTMENT", label: "Investment", icon: TrendingUp },
  { id: "WATCHLIST", label: "Watchlist", icon: Layers3 },
] as const;

/** Shared navigation keeps saved stocks inside the Markets workspace. */
export function MarketSectionTabs({ active, onChange }: {
  active: MarketSection;
  onChange: (section: MarketSection) => void;
}) {
  return (
    <nav className="market-section-tabs" aria-label="Market sections">
      {sections.map(({ id, label, icon: Icon }) => (
        <button type="button" key={id} className={active === id ? "active" : ""}
          aria-current={active === id ? "page" : undefined} onClick={() => onChange(id)}>
          <Icon size={16} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
