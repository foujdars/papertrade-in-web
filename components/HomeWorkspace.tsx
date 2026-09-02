"use client";

import {
  Activity,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  CandlestickChart,
  ChevronRight,
  Clock3,
  Layers3,
  LineChart,
  Radio,
  Rocket,
  ScanSearch,
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
};

export type HomeTimelineItem = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
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
  marketOpen,
  feedLive,
  balance,
  todayPnl,
  holdingsCount,
  openPositionsCount,
  recentStocks,
  recentScanners,
  stockOptions,
  timeline,
  cards,
  riskSummary,
  onOpenTrade,
  onOpenFno,
  onOpenMarkets,
  onOpenIpo,
  onOpenWatchlist,
  onOpenHoldings,
  onOpenOrders,
  onOpenPnl,
  onOpenStock,
}: {
  firstName?: string;
  indices: HomeIndexQuote[];
  marketOpen: boolean;
  feedLive: boolean;
  balance: number;
  todayPnl: number;
  holdingsCount: number;
  openPositionsCount: number;
  recentStocks: string[];
  recentScanners: string[];
  stockOptions: HomeStockOption[];
  timeline: HomeTimelineItem[];
  cards: HomeCardPreferences;
  riskSummary: HomeRiskSummary;
  onOpenTrade: () => void;
  onOpenFno: () => void;
  onOpenMarkets: () => void;
  onOpenIpo: () => void;
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
            <p>Check the market pulse, practise a setup or review your paper portfolio—all from one calm starting point.</p>
            <div className="home-global-search">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search any NSE stock" aria-label="Search any NSE stock" />
              {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              {matches.length > 0 && <div className="home-search-results">
                {matches.map((stock) => <button key={stock.symbol} onClick={() => { setPreview(stock); setSearch(""); }}>
                  <span><b>{stock.symbol}</b><small>{stock.name}</small></span>
                  <em className={stock.changePercent >= 0 ? "positive" : "negative"}>{stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%</em>
                </button>)}
              </div>}
            </div>
            <div className="home-hero-actions">
              <button className="home-primary-action" onClick={onOpenTrade}><CandlestickChart size={18} /><span><b>Open chart</b><small>Search and paper trade</small></span><ArrowRight size={17} /></button>
              <button className="home-secondary-action" onClick={onOpenMarkets}><ScanSearch size={18} /><span><b>Find setups</b><small>Trading &amp; investment scans</small></span></button>
            </div>
          </div>
          <div className="home-market-orbit" aria-label="Market connection status">
            <div><Radio size={18} /><span><small>MARKET FEED</small><b>{feedLive ? "Connected" : "Waiting"}</b></span></div>
            <strong>{marketOpen ? "Market open" : "Market closed"}</strong>
            <small><ShieldCheck size={13} /> Paper trades only</small>
          </div>
        </section>

        {cards.market && <section className="home-section home-pulse-section">
          <header><span><TrendingUp size={17} /><b>Market pulse</b></span><small>{feedLive ? "Live Upstox quotes" : "Latest available quotes"}</small></header>
          <div className="home-index-grid">
            {indices.map((index) => {
              const positive = (index.points ?? 0) >= 0;
              return (
                <button key={index.label} className="home-index-card" onClick={onOpenTrade}>
                  <span><b>{index.label}</b><i className={index.live ? "live" : ""}>{index.live ? "LIVE" : "LAST"}</i></span>
                  <strong>{index.price === null ? "—" : index.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                  <small className={positive ? "positive" : "negative"}>{index.points === null ? "Waiting for data" : `${positive ? "+" : ""}${index.points.toFixed(2)} · ${(index.changePercent ?? 0) >= 0 ? "+" : ""}${(index.changePercent ?? 0).toFixed(2)}%`}</small>
                </button>
              );
            })}
          </div>
        </section>}

        <div className="home-main-grid">
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

          <section className="home-section home-launchpad">
            <header><span><Sparkles size={17} /><b>Quick launch</b></span><small>Jump straight to the task</small></header>
            <div>
              <button onClick={onOpenTrade}><span className="violet"><Search size={18} /></span><b>Search &amp; trade</b><small>All NSE stocks</small></button>
              <button onClick={onOpenFno}><span className="blue"><LineChart size={18} /></span><b>F&amp;O desk</b><small>Chains and contracts</small></button>
              <button onClick={onOpenMarkets}><span className="green"><ScanSearch size={18} /></span><b>Market scanners</b><small>Rule-based setups</small></button>
              <button onClick={onOpenWatchlist}><span className="amber"><Layers3 size={18} /></span><b>Watchlists</b><small>Your saved stocks</small></button>
            </div>
          </section>
        </div>

        <section className="home-discovery-grid">
          <button className="home-discovery-card scanners" onClick={onOpenMarkets}>
            <span className="home-discovery-icon"><ScanSearch size={21} /></span>
            <span><small>DISCOVER</small><b>NIFTY 500 strategy ideas</b><p>Explore daily EMA alignment, bullish RSI divergence and intraday setups.</p></span>
            <ChevronRight size={18} />
          </button>
          <button className="home-discovery-card ipo" onClick={onOpenIpo}>
            <span className="home-discovery-icon"><Rocket size={21} /></span>
            <span><small>IPO RADAR</small><b>Open &amp; upcoming issues</b><p>Review price bands, dates and optional daily GMP alerts above 15%.</p></span>
            <ChevronRight size={18} />
          </button>
          <button className="home-discovery-card learn" onClick={onOpenPnl}>
            <span className="home-discovery-icon"><BookOpenCheck size={21} /></span>
            <span><small>LEARN</small><b>Review what worked</b><p>Study your entry, exit, charges and trade-review chart.</p></span>
            <ChevronRight size={18} />
          </button>
        </section>

        <section className="home-section home-timeline-section">
          <header><span><Clock3 size={17} /><b>Today</b></span><small>Your paper-trading timeline</small></header>
          <div className="home-timeline-list">
            {timeline.map((item) => <button key={item.id} onClick={onOpenOrders}>
              <i className={item.tone} />
              <time>{item.time}</time>
              <span><b>{item.title}</b><small>{item.detail}</small></span>
              <ChevronRight size={14} />
            </button>)}
            {!timeline.length && <div className="home-timeline-empty"><Clock3 size={18} /><span><b>No activity yet today</b><small>Your orders, targets and stop-loss exits will appear here.</small></span></div>}
          </div>
        </section>

        {cards.recent && <section className="home-section home-continue-section">
          <header><span><Clock3 size={17} /><b>Continue where you left off</b></span><small>Recent activity on this device</small></header>
          <div className="home-recent-list">
            {recentStocks.slice(0, 5).map((symbol) => <button key={symbol} onClick={() => setPreview(stockOptions.find((stock) => stock.symbol === symbol) ?? null)}><CandlestickChart size={15} /><span><b>{symbol}</b><small>Quick preview</small></span><ChevronRight size={14} /></button>)}
            {recentScanners.slice(0, 3).map((scanner) => <button key={scanner} onClick={onOpenMarkets}><Activity size={15} /><span><b>{scanner}</b><small>Open scanner</small></span><ChevronRight size={14} /></button>)}
            {!recentStocks.length && !recentScanners.length && <div className="home-recent-empty"><BellRing size={19} /><span><b>Your activity will appear here</b><small>Open a chart or scanner and it becomes a one-tap shortcut.</small></span></div>}
          </div>
        </section>}
      </div>

      {preview && <div className="home-stock-preview-backdrop" role="presentation" onClick={() => setPreview(null)}>
        <section className="home-stock-preview" role="dialog" aria-modal="true" aria-label={`${preview.symbol} stock preview`} onClick={(event) => event.stopPropagation()}>
          <header><span className="symbol-avatar">{preview.symbol.slice(0, 2)}</span><div><b>{preview.symbol}</b><small>{preview.name} · NSE</small></div><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18} /></button></header>
          <div className="home-stock-preview-price"><span><small>LAST AVAILABLE</small><strong>{preview.price > 0 ? formatInr(preview.price) : "Quote loading"}</strong></span><b className={preview.changePercent >= 0 ? "positive" : "negative"}>{preview.changePercent >= 0 ? "+" : ""}{preview.changePercent.toFixed(2)}%</b></div>
          <div className="home-stock-preview-tags">{preview.categories.length ? preview.categories.map((category) => <span key={category}>{category}</span>) : <span>ALL NSE</span>}</div>
          <p>Preview the stock first, then open its remembered chart setup when you are ready.</p>
          <div className="home-stock-preview-actions"><button onClick={onOpenWatchlist}><Layers3 size={16} /> Watchlists</button><button onClick={() => onOpenStock(preview.symbol)}><CandlestickChart size={16} /> Open chart <ArrowRight size={15} /></button></div>
        </section>
      </div>}
    </section>
  );
}
