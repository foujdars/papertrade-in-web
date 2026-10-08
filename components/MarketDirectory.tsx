"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Bitcoin, Gem, Landmark } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import { compareMarketInstruments, marketDisplayName, marketGroup, marketProductLabel, marketTicker, type DirectoryInstrument, type MarketGroup } from "@/lib/market-directory";

const globalTabs = [{ key: "us", label: "US markets", icon: Landmark }, { key: "crypto", label: "Crypto", icon: Bitcoin }, { key: "commodities", label: "Commodities", icon: Gem }] as const;
export function MarketDirectory({ market, instruments, onOpen }: { market: "india" | "global"; instruments: DirectoryInstrument[]; onOpen: (symbol: string) => void }) {
  const [group, setGroup] = useState<MarketGroup>("us");
  const [indianType, setIndianType] = useState("stocks");
  const [limit, setLimit] = useState(8);
  const universe = useMemo(() => instruments.filter(item => item.assetType !== "OPTION" && !item.categories.includes("DATED_FUTURE")).sort(compareMarketInstruments), [instruments]);
  const selected = market === "india" ? "india" : group;
  const matches = universe.filter(item => marketGroup(item) === selected && (market !== "india" || (indianType === "mcx" ? item.instrumentKey?.startsWith("MCX_FO|") : indianType === "indices" ? item.assetType === "INDEX" : item.assetType !== "INDEX" && !item.instrumentKey?.startsWith("MCX_FO|"))));
  const switchGroup = (next: MarketGroup) => { setGroup(next); setLimit(8); };
  return <section className="home-section market-directory" aria-label={market === "india" ? "Browse Indian markets" : "Browse global markets"}>
    <nav className="market-directory-tabs" aria-label="Market categories">
      {market === "global" ? globalTabs.map(({ key, label, icon: Icon }) => <button key={key} aria-pressed={group === key} onClick={() => switchGroup(key)}><Icon size={17}/><span>{label}</span></button>) : ["stocks", "indices", "mcx"].map(key => <button key={key} aria-pressed={indianType === key} onClick={() => { setIndianType(key); setLimit(8); }}><span>{key === "stocks" ? "Stocks" : key === "mcx" ? "MCX" : "Indices"}</span></button>)}
    </nav>
    <div className="market-directory-list">
      {matches.slice(0, limit).map(item => <button key={item.instrumentKey ?? item.symbol} onClick={() => onOpen(item.symbol)} className="market-directory-row">
        <StockLogo {...item} size={38} className={`market-directory-monogram ${selected}`} />
        <span className="market-directory-identity"><b>{marketDisplayName(item)}</b><small>{marketTicker(item)} <span>· {marketProductLabel(item)}</span></small></span>
        <span className="market-directory-open"><ArrowUpRight size={18}/><small>Chart</small></span>
      </button>)}
      {!matches.length && <p className="market-directory-empty">No instruments available in this category yet. Try again after the catalogue loads.</p>}
    </div>
    {matches.length > limit && <button className="market-directory-more" onClick={() => setLimit(count => count + 12)}>Show more <span>({matches.length - limit})</span></button>}
    <footer>Same charts, indicators & drawing tools.</footer>
  </section>;
}
