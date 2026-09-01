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
} from "lucide-react";
import { formatInr } from "@/lib/market";

export type HomeIndexQuote = {
  label: string;
  price: number | null;
  points: number | null;
  changePercent: number | null;
  live: boolean;
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

  return (
    <section className="home-workspace" aria-label="PaperTrade home">
      <div className="home-dashboard-scroll">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker"><Sparkles size={14} /> {greeting}{safeName ? `, ${safeName}` : ""}</span>
            <h1>Build skill before you risk capital.</h1>
            <p>Check the market pulse, practise a setup or review your paper portfolio—all from one calm starting point.</p>
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

        <section className="home-section home-pulse-section">
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
        </section>

        <div className="home-main-grid">
          <section className="home-section home-portfolio-card">
            <header><span><BriefcaseBusiness size={17} /><b>Your paper portfolio</b></span><button onClick={onOpenPnl}>View P&amp;L <ChevronRight size={14} /></button></header>
            <div className="home-portfolio-value">
              <span><small>TODAY</small><strong className={todayPnl >= 0 ? "positive" : "negative"}>{todayPnl >= 0 ? "+" : ""}{formatInr(todayPnl)}</strong></span>
              <span><small>VIRTUAL CASH</small><b>{formatInr(balance)}</b></span>
            </div>
            <div className="home-portfolio-stats">
              <button onClick={onOpenHoldings}><span><Layers3 size={16} /> Holdings</span><b>{holdingsCount}</b></button>
              <button onClick={onOpenOrders}><span><WalletCards size={16} /> Open positions</span><b>{openPositionsCount}</b></button>
            </div>
          </section>

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

        <section className="home-section home-continue-section">
          <header><span><Clock3 size={17} /><b>Continue where you left off</b></span><small>Recent activity on this device</small></header>
          <div className="home-recent-list">
            {recentStocks.slice(0, 5).map((symbol) => <button key={symbol} onClick={() => onOpenStock(symbol)}><CandlestickChart size={15} /><span><b>{symbol}</b><small>Open chart</small></span><ChevronRight size={14} /></button>)}
            {recentScanners.slice(0, 3).map((scanner) => <button key={scanner} onClick={onOpenMarkets}><Activity size={15} /><span><b>{scanner}</b><small>Open scanner</small></span><ChevronRight size={14} /></button>)}
            {!recentStocks.length && !recentScanners.length && <div className="home-recent-empty"><BellRing size={19} /><span><b>Your activity will appear here</b><small>Open a chart or scanner and it becomes a one-tap shortcut.</small></span></div>}
          </div>
        </section>
      </div>
    </section>
  );
}
