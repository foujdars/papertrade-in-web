"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Bitcoin, Gem, Landmark, Search, X } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import { compareMarketInstruments, marketDisplayName, marketGroup, marketProductLabel, marketTicker, type DirectoryInstrument, type MarketGroup } from "@/lib/market-directory";

const globalTabs = [{ key: "us", label: "US markets", icon: Landmark }, { key: "crypto", label: "Crypto", icon: Bitcoin }, { key: "commodities", label: "Commodities", icon: Gem }] as const;
export function MarketDirectory({ market, instruments, onOpen }: { market: "india" | "global"; instruments: DirectoryInstrument[]; onOpen: (symbol: string) => void }) {
  const [group, setGroup] = useState<MarketGroup>("us");
  const [indianType, setIndianType] = useState("stocks");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [limit, setLimit] = useState(8);
  const universe = useMemo(() => instruments.filter(item => item.assetType !== "OPTION" && !item.categories.includes("DATED_FUTURE")).sort(compareMarketInstruments), [instruments]);
  const selected = market === "india" ? "india" : group;
  const matches = universe.filter(item => marketGroup(item) === selected && (market !== "india" || (indianType === "indices" ? item.assetType === "INDEX" : item.assetType !== "INDEX")) && `${item.symbol} ${item.name} ${marketTicker(item)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const switchGroup = (next: MarketGroup) => { setGroup(next); setQuery(""); setLimit(8); };
  return <section className="home-section market-directory" aria-label={market === "india" ? "Browse Indian markets" : "Browse global markets"}>
    <header><span><b>{market === "india" ? "Discover Indian markets" : "Discover global markets"}</b></span><button className="market-directory-search-toggle" aria-label="Search this market category" aria-expanded={searchOpen} onClick={() => { setSearchOpen(open => !open); setQuery(""); }}><Search size={16}/></button></header>
    <nav className="market-directory-tabs" aria-label="Market categories">
      {market === "global" ? globalTabs.map(({ key, label, icon: Icon }) => <button key={key} aria-pressed={group === key} onClick={() => switchGroup(key)}><Icon size={17}/><span>{label}</span></button>) : ["stocks", "indices"].map(key => <button key={key} aria-pressed={indianType === key} onClick={() => { setIndianType(key); setQuery(""); setLimit(8); }}><span>{key === "stocks" ? "Stocks" : "Indices"}</span></button>)}
    </nav>
    <div className="market-directory-caption"><span>{selected === "us" ? "Leading companies & ETFs" : selected === "crypto" ? "Digital assets" : selected === "commodities" ? "Metals & energy" : indianType === "stocks" ? "Leading Indian companies" : "Indian indices"}</span><small>Popular first</small></div>
    {searchOpen && <label className="market-directory-search"><Search size={16}/><input autoFocus value={query} onChange={e => { setQuery(e.target.value); setLimit(8); }} placeholder={selected === "us" ? "Find Apple, NVIDIA, Tesla…" : selected === "crypto" ? "Find Bitcoin, Ethereum…" : selected === "commodities" ? "Find gold, silver, Brent…" : "Find an Indian instrument…"} aria-label="Search this market category"/>{query && <button aria-label="Clear category search" onClick={() => setQuery("")}><X size={15}/></button>}</label>}
    {selected === "us" && <p className="market-directory-note">US-linked tokenised contracts, not direct stock ownership.</p>}
    <div className="market-directory-list">
      {matches.slice(0, limit).map(item => <button key={item.instrumentKey ?? item.symbol} onClick={() => onOpen(item.symbol)} className="market-directory-row">
        <StockLogo {...item} size={38} className={`market-directory-monogram ${selected}`} />
        <span className="market-directory-identity"><b>{marketDisplayName(item)}</b><small>{marketTicker(item)} <span>· {marketProductLabel(item)}</span></small></span>
        <span className="market-directory-open"><ArrowUpRight size={18}/><small>Chart</small></span>
      </button>)}
      {!matches.length && <p className="market-directory-empty">{query ? "No matches in this category. Try another name." : "No instruments available in this category yet. Try again after the catalogue loads."}</p>}
    </div>
    {matches.length > limit && <button className="market-directory-more" onClick={() => setLimit(count => count + 12)}>Show more <span>({matches.length - limit})</span></button>}
    <footer>Same charts, indicators & drawing tools.</footer>
  </section>;
}
