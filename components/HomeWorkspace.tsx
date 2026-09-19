"use client";
import type { HomeAttention } from '@/lib/home-attention';
import { Bell, AlertCircle, Play } from 'lucide-react';
import { CandleLoader } from "./CandleLoader";
import { StockLogo } from "@/components/StockLogo";

import {
  ArrowRight,
  BriefcaseBusiness,
  CandlestickChart,
  CheckCircle2,
  ChevronRight,
  Layers3,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usableHomeQuote, quoteChangeText, type HomeQuote } from "@/lib/home-quotes";
import { formatInr } from "@/lib/market";

export type HomeIndexQuote = {
  symbol: string;
  label: string;
  price: number | null;
  points: number | null;
  changePercent: number | null;
  live: boolean;
  asOf?: string;
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
  closedTradesCount,
  stockOptions,
  cards,
  riskSummary,
  onOpenWatchlist,
  onOpenHoldings,
  onOpenPositions,
  onOpenTradeHistory,
  onOpenPnl,
  onOpenStock,
  realisedToday=0, openChangeToday=0, sessionLabel="Checking session", sessionMessage="", attention=[], onAttention, resumeChart, onResumeChart, onOpenRealised,
}: {
  realisedToday?:number;openChangeToday?:number|null;sessionLabel?:string;sessionMessage?:string;
  attention?:HomeAttention[];onAttention?:(item:HomeAttention)=>void;
  resumeChart?:{symbol:string;timeframe:string};onResumeChart?:()=>void;onOpenRealised?:()=>void;
  firstName?: string;
  indices: HomeIndexQuote[];
  feedLive: boolean;
  balance: number;
  todayPnl: number;
  holdingsCount: number;
  openPositionsCount: number;
  closedTradesCount: number;
  stockOptions: HomeStockOption[];
  cards: HomeCardPreferences;
  riskSummary: HomeRiskSummary;
  onOpenWatchlist: () => void;
  onOpenHoldings: () => void;
  onOpenPositions: () => void;
  onOpenTradeHistory: () => void;
  onOpenPnl: () => void;
  onOpenStock: (symbol: string) => void;
}) {
  const hour = Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const safeName = firstName?.trim().split(/\s+/)[0];
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<HomeStockOption | null>(null);
  const [quotes, setQuotes] = useState<Record<string, HomeQuote | null>>({});
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return stockOptions.filter((stock) => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query)).slice(0, 6);
  }, [search, stockOptions]);
  const quoteKeys = [...new Set((preview ? [preview] : matches).map((s) => s.instrumentKey).filter(Boolean))].join(",");
  useEffect(() => {
    if (!quoteKeys) { setLoading(false); return; }
    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const debounce = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(quoteKeys)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error("Quote unavailable");
        if (!disposed) setQuotes((current) => ({ ...current, ...Object.fromEntries(quoteKeys.split(",").map((key) => [key, usableHomeQuote(payload.quotes?.[key])])) }));
      } catch {
        if (!disposed) setQuotes((current) => ({ ...current, ...Object.fromEntries(quoteKeys.split(",").map((key) => [key, null])) }));
      } finally { if (!disposed) setLoading(false); window.clearTimeout(timeout); }
    }, 250);
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); window.clearTimeout(debounce); };
  }, [quoteKeys, retry]);
  const previewQuote = preview?.instrumentKey ? quotes[preview.instrumentKey] : null;

  return (
    <section className="home-workspace home-hub" aria-label="PaperTrade home">
      <div className="home-dashboard-scroll">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker"><Sparkles size={14} /> {greeting}{safeName ? `, ${safeName}` : ""}</span>
            <h1>Your trading day</h1>
            <div className="home-global-search">
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stocks and indices" aria-label="Search stocks and indices" />
              {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              {search.trim()&&!matches.length&&<div className="home-search-results home-search-empty" role="status">No matching stocks or indices.</div>}{matches.length > 0 && <div className="home-search-results">
                {matches.map((stock) => <button key={stock.symbol} onClick={() => { setPreview(stock); setSearch(""); }}>
                  <span className="stock-identity">{stock.assetType === "INDEX" ? <TrendingUp size={25} aria-hidden="true" /> : <StockLogo symbol={stock.symbol} instrumentKey={stock.instrumentKey} size={32} />}<span><b>{stock.symbol}</b><small>{stock.name}</small></span></span>
                  <em className={(quotes[stock.instrumentKey ?? ""]?.changePercent ?? 0) < 0 ? "negative" : "positive"}>{quoteChangeText(quotes[stock.instrumentKey ?? ""]?.changePercent)}</em>
                </button>)}
              </div>}
            </div>
          </div>
        </section>

        {cards.market && <section className="home-section home-pulse-section">
          <header><span><TrendingUp size={17} /><b>Market pulse</b></span><span className="home-session-label" title={sessionMessage}>{sessionLabel}</span></header>
          <div className="home-index-grid">
            {indices.map((index) => {
              const positive = (index.points ?? 0) >= 0;
              return (
                <button key={index.symbol} className="home-index-card" onClick={() => onOpenStock(index.symbol)}>
                  <span><b>{index.label}</b><i className={index.live ? "live" : ""}>{index.price===null?"—":index.live ? "LIVE" : "LAST"}</i></span>
                  <strong>{index.price === null ? "—" : index.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong>
                  <small className={index.points===null ? "" : positive ? "positive" : "negative"}>{index.points === null ? "Quote unavailable" : `${positive ? "+" : ""}${index.points.toFixed(2)} · ${(index.changePercent ?? 0) >= 0 ? "+" : ""}${(index.changePercent ?? 0).toFixed(2)}%`}</small>{index.price!==null&&!index.live&&<time>{index.asOf&&Number.isFinite(Date.parse(index.asOf))?new Date(index.asOf).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" IST":"Time unavailable"}</time>}
                </button>
              );
            })}
          </div>
        </section>}

        <div className="home-main-grid home-main-grid-clean">
          {cards.portfolio && <section className="home-section home-portfolio-card">
            <header><span><BriefcaseBusiness size={17} /><b>Your paper portfolio</b></span><button onClick={onOpenPnl}>View P&amp;L <ChevronRight size={14} /></button></header>
            <div className="home-portfolio-value">
              <button className="home-today-pnl" onClick={onOpenPnl} aria-label="Today’s profit and loss — view P&L"><small>TODAY’S P&amp;L</small><strong className={openChangeToday===null?"":todayPnl >= 0 ? "positive" : "negative"}>{openChangeToday===null?"—":`${todayPnl>=0?"+":""}${formatInr(todayPnl)}`}</strong></button>
              <span><small>VIRTUAL CASH</small><b>{formatInr(balance)}</b></span>
            </div>
            <div className="home-pnl-split"><button onClick={onOpenRealised??onOpenPnl}><small>Realised today · net</small><b className={realisedToday>=0?'positive':'negative'}>{formatInr(realisedToday)}</b><ChevronRight size={13}/></button><button onClick={onOpenPositions}><small>Open · today’s change</small><b className={openChangeToday===null?'':openChangeToday>=0?'positive':'negative'}>{openChangeToday===null?'Quote unavailable':formatInr(openChangeToday)}</b><ChevronRight size={13}/></button></div>
            <div className="home-portfolio-stats">
              <button onClick={onOpenHoldings}><span><Layers3 size={16} /> Holdings</span><b>{holdingsCount}</b></button>
              <button onClick={onOpenPositions}><span><WalletCards size={16} /> Open positions</span><b>{openPositionsCount}</b></button>
              <button onClick={onOpenTradeHistory}><span><CheckCircle2 size={16} /> Closed trades</span><b>{closedTradesCount}</b></button>
            </div>
            <div className="home-risk-meter">
              <span><ShieldCheck size={15} /><b>Holdings concentration</b><em>{holdingsCount===0?"No holdings":Number.isFinite(riskSummary.topConcentration)&&riskSummary.exposure>0?`${riskSummary.topConcentration.toFixed(0)}% largest`:"Quote unavailable"}</em></span>
              {holdingsCount>0&&riskSummary.exposure>0&&Number.isFinite(riskSummary.topConcentration)&&<div><i style={{ width: `${Math.min(100, riskSummary.topConcentration)}%` }} /></div>}
              <small>{riskSummary.exposure > 0 ? `${riskSummary.topSymbol} is ${riskSummary.topConcentration.toFixed(0)}% of invested value` : holdingsCount===0?"No delivery holdings to measure.":"Waiting for holding valuations."}</small>
            </div>
          </section>}

        </div>
        {!!attention.length&&<section className="home-section home-attention"><header><span><AlertCircle size={17}/><b>Needs attention</b></span><small>{Math.min(3,attention.length)} to review</small></header><div>{attention.slice(0,3).map(item=><button key={item.id} onClick={()=>onAttention?.(item)}><span className={item.tone==='warning'?'home-attention-warning':'home-attention-info'}>{item.tone==='warning'?<AlertCircle size={18}/>:<Bell size={18}/>}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={17}/></button>)}</div></section>}
        {resumeChart&&<button className="home-resume-card" onClick={onResumeChart}><span className="home-resume-icon"><CandlestickChart size={23}/></span><span><small>Continue your chart</small><b>{resumeChart.symbol} <em>· {resumeChart.timeframe}</em></b><small>Your saved chart setup</small></span><span className="home-resume-action">Resume <Play size={14}/></span></button>}
      </div>

      {preview && <div className="home-stock-preview-backdrop" role="presentation" onClick={() => setPreview(null)}>
        <section className="home-stock-preview" role="dialog" aria-modal="true" aria-label={`${preview.symbol} stock preview`} onClick={(event) => event.stopPropagation()}>
          <header><StockLogo symbol={preview.symbol} /><div><b>{preview.symbol}</b><small>{preview.name} · NSE</small></div><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={18} /></button></header>
          <div className="home-stock-preview-price"><span><small>LAST AVAILABLE</small><strong>{previewQuote ? formatInr(previewQuote.lastPrice) : loading ? <CandleLoader compact label="Loading quote" /> : "Quote unavailable"}</strong></span><b className={(previewQuote?.changePercent ?? 0) < 0 ? "negative" : "positive"}>{quoteChangeText(previewQuote?.changePercent)}</b></div>
          {!loading && !previewQuote && <button onClick={() => setRetry((n) => n + 1)}>Retry quote</button>}
          <div className="home-stock-preview-tags">{preview.categories.length ? preview.categories.map((category) => <span key={category}>{category}</span>) : <span>ALL NSE</span>}</div>
          <p>Preview the stock first, then open its remembered chart setup when you are ready.</p>
          <div className="home-stock-preview-actions"><button onClick={onOpenWatchlist}><Layers3 size={16} /> Watchlists</button><button onClick={() => onOpenStock(preview.symbol)}><CandlestickChart size={16} /> Open chart <ArrowRight size={15} /></button></div>
        </section>
      </div>}
    </section>
  );
}
