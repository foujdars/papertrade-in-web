"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Bitcoin, CandlestickChart, Gem, Landmark } from "lucide-react";
import { StockLogo } from "@/components/StockLogo";
import { compareMarketInstruments, marketDisplayName, marketGroup, marketProductLabel, marketTicker, type DirectoryInstrument, type MarketGroup } from "@/lib/market-directory";
import { deltaChartOptionRoot, deltaOptionDirectory, type ListedDeltaOption } from "@/lib/delta-option-list";
import { DeltaOptionList } from "./DeltaOptionList";

const globalTabs = [{ key: "us", label: "US markets", icon: Landmark }, { key: "crypto", label: "Crypto", icon: Bitcoin }, { key: "commodities", label: "Commodities", icon: Gem }] as const;
export function MarketDirectory({ market, instruments, onOpen }: { market: "india" | "global"; instruments: (DirectoryInstrument & ListedDeltaOption)[]; onOpen: (symbol: string) => void }) {
  const [group, setGroup] = useState<MarketGroup | "options">("us");
  const [optionRoot, setOptionRoot] = useState("");
  const [indianType, setIndianType] = useState("stocks");
  const [limit, setLimit] = useState(8);
  const universe = useMemo(() => instruments.filter(item => item.assetType !== "OPTION").sort(compareMarketInstruments), [instruments]);
  const selected = market === "india" ? "india" : group;
  const matches = universe.filter(item => marketGroup(item) === selected && (market !== "india" || (indianType === "mcx" ? item.instrumentKey?.startsWith("MCX_FO|") : indianType === "indices" ? item.assetType === "INDEX" : item.assetType !== "INDEX" && !item.instrumentKey?.startsWith("MCX_FO|"))));
  const tokenOptions = useMemo(() => instruments.filter(item => item.assetType === "OPTION" && item.instrumentKey?.startsWith("DELTA|")), [instruments]);
  const optionRoots = useMemo(() => deltaOptionDirectory(tokenOptions), [tokenOptions]);
  const switchGroup = (next: MarketGroup | "options") => { setGroup(next); setLimit(8); };
  return <section className="home-section market-directory" aria-label={market === "india" ? "Browse Indian markets" : "Browse global markets"}>
    <nav className="market-directory-tabs" aria-label="Market categories">
      {market === "global" ? <>{globalTabs.map(({ key, label, icon: Icon }) => <button key={key} aria-pressed={group === key} onClick={() => switchGroup(key)}><Icon size={17}/><span>{label}</span></button>)}
        <button aria-pressed={group === "options"} onClick={() => { setOptionRoot(""); switchGroup("options"); }}><CandlestickChart size={17}/><span>Options</span></button>
      </> : ["stocks", "indices", "mcx"].map(key => <button key={key} aria-pressed={indianType === key} onClick={() => { setIndianType(key); setLimit(8); }}><span>{key === "stocks" ? "Stocks" : key === "mcx" ? "MCX" : "Indices"}</span></button>)}
    </nav>
    {selected === "options" ? <DeltaOptionList key={optionRoot} instruments={tokenOptions} initialRoot={optionRoot} onOpen={onOpen}/> : <>
      <div className="market-directory-list">
        {matches.slice(0, limit).map(item => {
          const root = deltaChartOptionRoot(item);
          return <div key={item.instrumentKey ?? item.symbol} className="market-directory-actions">
            <button onClick={() => onOpen(item.symbol)} className="market-directory-row">
              <StockLogo {...item} size={38} className={`market-directory-monogram ${selected}`} />
              <span className="market-directory-identity"><b>{marketDisplayName(item)}</b><small>{marketTicker(item)} <span>· {marketProductLabel(item)}</span></small></span>
              <span className="market-directory-open"><ArrowUpRight size={18}/><small>Chart</small></span>
            </button>
            {root && optionRoots.has(root) && <button type="button" className="market-directory-options" aria-label={`Open ${root} options`} onClick={() => { setOptionRoot(root); switchGroup("options"); }}>Options</button>}
          </div>;
        })}
        {!matches.length && <p className="market-directory-empty" role="status">No instruments</p>}
      </div>
      {matches.length > limit && <button className="market-directory-more" onClick={() => setLimit(count => count + 12)}>Show more</button>}
    </>}
  </section>;
}
