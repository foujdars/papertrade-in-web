"use client";
import { StockLogo } from "@/components/StockLogo";

import {
  ArrowRight,
  BriefcaseBusiness,
  CandlestickChart,
  ChevronRight,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatInr } from "@/lib/market";

export type HomeIndexQuote = {
  symbol: string;
  label: string;
  price: number | null;
  points: number | null;
  changePercent: number | null;
  live: boolean;
};

export type HomeStockOption = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  categories: string[];
  instrumentKey?: string;
  assetType?: "EQUITY" | "INDEX";
};

export type HomeCardPreferences = {
  market: boolean;
  recent: boolean;
  portfolio: boolean;
};

export type HomeRiskSummary = {
  exposure: number;
  topSymbol: string;
  topConcentration: number;
  label: "Low" | "Moderate" | "High";
};

export function HomeWorkspace({
  firstName,
  indices,
  feedLive,
  balance,
  todayPnl,
  holdingsCount,
  openPositionsCount,
  stockOptions,
  cards,
  riskSummary,
  onOpenWatchlist,
  onOpenHoldings,
  onOpenOrders,
  onOpenPnl,
  onOpenStock,
}: {
  firstName?: string;
  indices: HomeIndexQuote[];
  feedLive: boolean;
  balance: number;
  todayPnl: number;
  holdingsCount: number;
  openPositionsCount: number;
  stockOptions: HomeStockOption[];
  cards: HomeCardPreferences;
  riskSummary: HomeRiskSummary;
  onOpenWatchlist: () => void;
  onOpenHoldings: () => void;
  onOpenOrders: () => void;
  onOpenPnl: () => void;
  onOpenStock: (symbol: string) => void;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const safeName = firstName?.trim().split(/\s+/)[0];
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<HomeStockOption | null>(null);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return stockOptions.filter((stock) => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query)).slice(0, 6);
  }, [search, stockOptions]);

  return (
    <section className="home-workspace" aria-label="PaperTrade home">
      <div className="home-dashboard-scroll">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker"><Sparkles size={14} /> {greeting}{safeName ? `, ${safeName}` : ""}</span>
            <h1>Build skill before you risk capital.</h1>
            <div className="home-global-search">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stocks and indices" aria-label="Search stocks and indices" />
              {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              {matches.length > 0 && <div className="home-search-results">
                {matches.map((stock) => <button key={stock.symbol} onClick={() => { setPreview(stock); setSearch(""); }}>
                  <span className="stock-identity">{stock.assetType === "INDEX" ? <TrendingUp size={25} aria-hidden="true" /> : <StockLogo symbol={stock.symbol} instrumentKey={stock.instrumentKey} size={32} />}<span><b>{stock.symbol}</b><small>{stock.name}</small></span></span>
                  <em className={stock.changePercent >= 0 ? "positive" : "negative"}>{stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%</em>
                </button>)}
              </div>}
            </div>
          </div>
        </section>

        {cards.market && <section className="home-section home-pulse-section">
          <header><span><TrendingUp size={17} /><b>Market pulse</b></span><small>{feedLive ? "Live Upstox quotes" : "Latest available quotes"}</small></header>
          <div className="home-index-grid">
            {indices.map((index) => {
              const positive = (index.points ?? 0) >= 0;
              return (
                <button key={index.symbol} className="home-index-card" onClick={() => onOpenStock(index.symbol)}>
                  <span><b>{index.label}</b><i className={index.live ? "live" : ""}>{index.live ? "LIVE" : "LAST"}</i></span>
                  <strong>{index.price === null ? "—" : index.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                  <small className={positive ? "positive" : "negative"}>{index.points === null ? "Waiting for data" : `${positive ? "+" : ""}${index.points.toFixed(2)} · ${(index.changePercent ?? 0) >= 0 ? "+" : ""}${(index.changePercent ?? 0).toFixed(2)}%`}</small>
                </button>
              );
            })}
          </div>
        </section>}

        <div className="home-main-grid home-main-grid-clean">
          {cards.portfolio && <section className="home-section home-portfolio-card">
            <header><span><BriefcaseBusiness size={17} /><b>Your paper portfolio</b></span><button onClick={onOpenPnl}>View P&amp;L <ChevronRight size={14} /></button></header>
            <div className="home-portfolio-value">
              <span><small>TODAY</small><strong className={todayPnl >= 0 ? "positive" : "negative"}>{todayPnl >= 0 ? "+" : ""}{formatInr(todayPnl)}</strong></span>
              <span><small>VIRTUAL CASH</small><b>{formatInr(balance)}</b></span>
            </div>
            <div className="home-portfolio-stats">
              <button onClick={onOpenHoldings}><span><Layers3 size={16} /> Holdings</span><b>{holdingsCount}</b></button>
              <button onClick={onOpenOrders}><span><WalletCards size={16} /> Open positions</span><b>{openPositionsCount}</b></button>
            </div>
            <div className="home-risk-meter">
              <span><ShieldCheck size={15} /><b>Portfolio risk</b><em className={`risk-${riskSummary.label.toLowerCase()}`}>{riskSummary.label}</em></span>
              <div><i style={{ width: `${Math.min(100, riskSummary.topConcentration)}%` }} /></div>
              <small>{riskSummary.exposure > 0 ? `${riskSummary.topSymbol} is ${riskSummary.topConcentration.toFixed(0)}% of invested value` : "Build a delivery portfolio to see concentration risk"}</small>
            </div>
          </section>}

        </div>
      </div>

      {preview && <div className="home-stock-preview-backdrop" role="presentation" onClick={() => setPreview(null)}>
        <section className="home-stock-preview" role="dialog" aria-modal="true" aria-label={`${preview.symbol} stock preview`} onClick={(event) => event.stopPropagation()}>
          <header><StockLogo symbol={preview.symbol} /><div><b>{preview.symbol}</b><small>{preview.name} · NSE</small></div><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18} /></button></header>
          <div className="home-stock-preview-price"><span><small>LAST AVAILABLE</small><strong>{preview.price > 0 ? formatInr(preview.price) : "Quote loading"}</strong></span><b className={preview.changePercent >= 0 ? "positive" : "negative"}>{preview.changePercent >= 0 ? "+" : ""}{preview.changePercent.toFixed(2)}%</b></div>
          <div className="home-stock-preview-tags">{preview.categories.length ? preview.categories.map((category) => <span key={category}>{category}</span>) : <span>ALL NSE</span>}</div>
          <p>Preview the stock first, then open its remembered chart setup when you are ready.</p>
          <div className="home-stock-preview-actions"><button onClick={onOpenWatchlist}><Layers3 size={16} /> Watchlists</button><button onClick={() => onOpenStock(preview.symbol)}><CandlestickChart size={16} /> Open chart <ArrowRight size={15} /></button></div>
        </section>
      </div>}
    </section>
  );
}
