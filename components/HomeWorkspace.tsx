"use client";
import type { HomeAttention } from '@/lib/home-attention';
import { Bell, AlertCircle, Play, Eye, EyeOff, Clock3, Globe2, Landmark, Plus } from 'lucide-react';
import { isGlobalInstrumentKey } from '@/lib/global-markets';
import { compareMarketInstruments } from '@/lib/market-directory';
import { MarketDirectory } from './MarketDirectory';
import { formatUsd } from '@/lib/global-order-engine';
import { deferHomeReminder, homePreferenceKey, isHomeReminderHidden, normalizeHomePreferences, rememberHomeSearch, type HomePreferences } from '@/lib/home-preferences';
import { CandleLoader } from "./CandleLoader";
import { SessionBoard } from "./SessionBoard";
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
  assetType?: "EQUITY" | "INDEX" | "OPTION" | "FUTURE";
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
  globalWallet,
  globalWalletError,
  globalAvailable,
  globalPositions,
  globalOpenOrders,
  globalOpenPnl,
  globalPnlComplete,
  onAddCash,
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
  preferenceOwner='guest', favouriteSymbols=[],
  realisedToday=0, openChangeToday=0, sessionLabel="Checking session", sessionMessage="", attention=[], onAttention, resumeChart, onResumeChart, onOpenRealised,
}: {
  preferenceOwner?:string;favouriteSymbols?:string[];
  realisedToday?:number;openChangeToday?:number|null;sessionLabel?:string;sessionMessage?:string;
  attention?:HomeAttention[];onAttention?:(item:HomeAttention)=>void;
  resumeChart?:{symbol:string;timeframe:string};onResumeChart?:()=>void;onOpenRealised?:()=>void;
  firstName?: string;
  indices: HomeIndexQuote[];
  feedLive: boolean;
  balance: number;
  globalWallet: number | null;
  globalWalletError: string;
  globalAvailable: number | null;
  globalPositions: { symbol: string; side: string }[];
  globalOpenOrders: number;
  globalOpenPnl: number;
  globalPnlComplete: boolean;
  onAddCash: (currency: 'INR' | 'USD') => void;
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
  const [preferences, setPreferences] = useState<HomePreferences>(() => normalizeHomePreferences(null));
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceMessage, setPreferenceMessage] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const storageKey = homePreferenceKey(preferenceOwner);
  useEffect(() => {
    try { setPreferences(normalizeHomePreferences(JSON.parse(localStorage.getItem(storageKey) ?? 'null'))); }
    catch { setPreferenceMessage('Preferences could not be loaded on this device.'); }
    setPreferencesReady(true);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    const refresh = () => setNow(Date.now());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [storageKey]);
  const updatePreferences = (next: HomePreferences) => {
    setPreferences(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setPreferenceMessage('Change applied for now, but this device could not save it.'); }
  };
  // Mask during initial storage read, preventing a flash of balances on reopen.
  const privateBalances = !preferencesReady || preferences.privateBalances;
  const activeMarket = preferences.market;
  const marketOptions = useMemo(() => stockOptions.filter(stock => isGlobalInstrumentKey(stock.instrumentKey) === (activeMarket === 'global')).sort(compareMarketInstruments), [activeMarket, stockOptions]);
  const visibleAttention = attention.filter(item => !isHomeReminderHidden(preferences, item, now));
  const hiddenAttention = attention.filter(item => isHomeReminderHidden(preferences, item, now));
  const chooseSearch = (stock: HomeStockOption, chart = false) => {
    updatePreferences(rememberHomeSearch(preferences, stock.symbol));
    setSearch(''); setSearchFocused(false);
    if (chart || isGlobalInstrumentKey(stock.instrumentKey)) onOpenStock(stock.symbol); else setPreview(stock);
  };
  const deferReminder = (item: HomeAttention, reviewed: boolean) => {
    updatePreferences(deferHomeReminder(preferences, item, reviewed, Date.now()));
    setPreferenceMessage(reviewed ? 'Reviewed on Home. It returns if details change. Alerts and positions are unchanged.' : 'Hidden on Home for 1 hour. Alerts and positions are unchanged.');
  };
  const restoreReminder = (id: string) => {
    const reminders = { ...preferences.reminders }; delete reminders[id];
    updatePreferences({ ...preferences, reminders });
  };
  const bySymbol = useMemo(() => new Map(marketOptions.map(stock => [stock.symbol, stock])), [marketOptions]);
  const recentSearches = preferences.recentSearches.map(symbol => bySymbol.get(symbol)).filter((stock): stock is HomeStockOption => !!stock);
  const favourites = [...new Set(favouriteSymbols)].map(symbol => bySymbol.get(symbol)).filter((stock): stock is HomeStockOption => !!stock).slice(0, 6);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return marketOptions
      .filter((stock) => stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [search, marketOptions]);
  const quoteKeys = preview?.instrumentKey ?? '';
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
  const searchRow = (stock: HomeStockOption) => <div className="home-search-row" key={stock.symbol}>
    <button className="home-search-preview" aria-label={isGlobalInstrumentKey(stock.instrumentKey) ? `Open ${stock.symbol} chart` : `Preview ${stock.symbol}`} onClick={() => chooseSearch(stock)}>
      <span className="stock-identity">{stock.assetType === 'INDEX' ? <TrendingUp size={25} aria-hidden="true" /> : <StockLogo symbol={stock.symbol} instrumentKey={stock.instrumentKey} categories={stock.categories} size={32} />}<span><b>{stock.symbol}</b><small>{stock.name}</small></span></span>
    </button>
    <button className="home-search-chart" aria-label={`Open ${stock.symbol} chart`} title="Open chart" onClick={() => chooseSearch(stock, true)}><CandlestickChart size={18} /></button>
  </div>;

  return (
    <section className="home-workspace home-hub home-studio" data-market={activeMarket} aria-label="PaperTrade home">
      <div className="home-dashboard-scroll">
        <section className="home-hero">
          <div className="home-hero-copy">
            <span className="home-kicker"><Sparkles size={14} /> {greeting}{safeName ? `, ${safeName}` : ""}</span>
            <h1>{activeMarket === 'global' ? 'Explore global markets' : 'Your trading day'}</h1>
            <div className="home-global-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setSearchFocused(false); setSearch(''); } }} onKeyDown={event => { if(event.key==='Escape'){setSearchFocused(false);setSearch('');} }}>
              <Search size={18} />
              <input value={search} onFocus={() => setSearchFocused(true)} onChange={(event) => { setSearchFocused(true); setSearch(event.target.value); }} placeholder={activeMarket === 'global' ? 'Search US, crypto, commodities…' : 'Search Indian stocks and indices…'} aria-label={activeMarket === 'global' ? 'Search global markets' : 'Search Indian markets'} autoComplete="off" />
              {search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              {searchFocused && <div className="home-search-results" aria-label="Instrument search results">
                {search.trim() ? matches.length ? matches.map(searchRow) : <div className="home-search-empty" role="status">No matching instruments in this market.</div> : <>
                  {!!recentSearches.length && <><div className="home-search-group"><b>Recent searches</b><button onClick={() => updatePreferences({...preferences, recentSearches: []})}>Clear recent</button></div>{recentSearches.map(searchRow)}</>}
                  {!!favourites.length && <><div className="home-search-group"><b>Favourites</b><small>From your watchlists</small></div>{favourites.map(searchRow)}</>}
                  {!recentSearches.length && !favourites.length && <div className="home-search-empty">Search this market by name or symbol.</div>}
                  <div className="home-search-hint">Tap a name to preview · chart icon to open</div>
                </>}
              </div>}
            </div>
          </div>
        </section>

        <section className="home-market-chooser" aria-label="Choose market and practice wallet">
          <button className={activeMarket === 'india' ? 'active' : ''} aria-pressed={activeMarket === 'india'} onClick={() => { updatePreferences({ ...preferences, market: 'india' }); setSearch(''); setSearchFocused(false); }}><Landmark size={19}/><span><b>Indian markets</b><small>Stocks &amp; F&amp;O</small></span><em>₹</em></button>
          <button className={activeMarket === 'global' ? 'active' : ''} aria-pressed={activeMarket === 'global'} onClick={() => { updatePreferences({ ...preferences, market: 'global' }); setSearch(''); setSearchFocused(false); }}><Globe2 size={19}/><span><b>Global markets</b><small>US · Crypto · Commodities</small></span><em>$</em></button>
        </section>

        <SessionBoard />

        <section className="home-wallet-card" aria-label={activeMarket === 'india' ? 'Indian rupee practice wallet' : 'Global dollar practice wallet'}>
          <div className="home-wallet-heading"><span><WalletCards size={18}/>{activeMarket === 'india' ? 'Indian wallet' : 'Global wallet'}<em>{activeMarket === 'india' ? 'INR' : 'USD'}</em></span><button disabled={!preferencesReady} aria-label={privateBalances ? 'Show wallet balances' : 'Hide wallet balances'} aria-pressed={privateBalances} onClick={() => updatePreferences({ ...preferences, privateBalances: !privateBalances })}>{privateBalances ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
          <small className="home-wallet-label">PRACTICE BALANCE</small>
          <strong className="home-wallet-amount">{privateBalances ? '••••••' : activeMarket === 'india' ? formatInr(balance) : globalWallet === null ? globalWalletError ? 'Unavailable' : 'Loading…' : formatUsd(globalWallet)}</strong>
          <div className="home-wallet-actions"><span>{activeMarket === 'india' ? 'Available for Indian trading' : `Available: ${privateBalances ? '••••' : globalAvailable === null ? '—' : formatUsd(globalAvailable)}`}</span><button onClick={() => onAddCash(activeMarket === 'india' ? 'INR' : 'USD')}><Plus size={17}/> Add cash</button></div>
          <div className="home-wallet-other"><span>{activeMarket === 'india' ? 'Global wallet' : 'Indian wallet'}</span><b>{privateBalances ? '••••' : activeMarket === 'global' ? formatInr(balance) : globalWallet === null ? '—' : formatUsd(globalWallet)}</b><small>Separate balance</small></div>
        </section>

        <MarketDirectory key={activeMarket} market={activeMarket} instruments={marketOptions} onOpen={onOpenStock}/>
        {activeMarket === 'india' && cards.market && <section className="home-section home-pulse-section">
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
          {activeMarket === 'india' && cards.portfolio && <section className="home-section home-portfolio-card">
            <header><span><BriefcaseBusiness size={17} /><b>Your paper portfolio</b></span><div className="home-portfolio-actions"><button disabled={!preferencesReady} aria-label={privateBalances?'Show balances on Home':'Hide balances on Home'} title="Privacy on Home only" aria-pressed={privateBalances} onClick={() => updatePreferences({...preferences,privateBalances:!privateBalances})}>{privateBalances?<EyeOff size={18}/>:<Eye size={18}/>}</button><button onClick={onOpenPnl}>View P&amp;L <ChevronRight size={14} /></button></div></header>
            <div className="home-portfolio-value">
              <button className="home-today-pnl" onClick={onOpenPnl} aria-label="Today’s profit and loss — view P&L"><small>TODAY’S P&amp;L</small><strong className={privateBalances||openChangeToday===null?"":todayPnl >= 0 ? "positive" : "negative"}>{privateBalances?'••••':openChangeToday===null?"—":`${todayPnl>=0?"+":""}${formatInr(todayPnl)}`}</strong></button>
            </div>
            <div className="home-pnl-split"><button onClick={onOpenRealised??onOpenPnl}><small>Realised today · net</small><b className={privateBalances?'':realisedToday>=0?'positive':'negative'}>{privateBalances?'••••':formatInr(realisedToday)}</b><ChevronRight size={13}/></button><button onClick={onOpenPositions}><small>Open · today’s change</small><b className={privateBalances||openChangeToday===null?'':openChangeToday>=0?'positive':'negative'}>{privateBalances?'••••':openChangeToday===null?'Quote unavailable':formatInr(openChangeToday)}</b><ChevronRight size={13}/></button></div>
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

          {activeMarket === 'global' && <section className="home-section home-global-account">
            <header><span><Globe2 size={17}/><b>Global performance</b></span><small>USD</small></header>
            <div className="home-global-balance"><div><small>OPEN P&amp;L</small><strong className={!privateBalances && globalOpenPnl < 0 ? 'negative' : 'positive'}>{privateBalances ? '••••' : globalPnlComplete ? formatUsd(globalOpenPnl) : 'Awaiting quotes'}</strong><span>Your open contracts</span></div><div><small>FUNDS IN USE</small><b>{privateBalances ? '••••' : globalWallet !== null && globalAvailable !== null ? formatUsd(globalWallet - globalAvailable) : '—'}</b><span>Positions &amp; pending orders</span></div></div>
            {globalWalletError && <p className="home-global-wallet-error" role="alert">Dollar wallet unavailable: {globalWalletError}</p>}
            <div className="home-global-stats"><span><b>{globalPositions.length}</b> open positions</span><span><b>{globalOpenOrders}</b> pending orders</span></div>
            {!!globalPositions.length && <div className="home-global-positions"><small>OPEN POSITIONS</small>{globalPositions.slice(0, 4).map((position, index) => <button key={`${position.symbol}:${index}`} onClick={() => onOpenStock(position.symbol)}><span><b>{position.symbol}</b><small>{position.side} · view chart</small></span><ChevronRight size={17}/></button>)}</div>}
            {!globalPositions.length && <p className="home-global-empty">No global positions yet. Search an instrument above to practise in dollars.</p>}
          </section>}

        </div>
        {activeMarket === 'india' && preferencesReady && !!attention.length && <section className="home-section home-attention"><header><span><AlertCircle size={17}/><b>Needs attention</b></span><small>{visibleAttention.length} to review</small></header><div>
          {visibleAttention.slice(0,3).map(item => <div className="home-attention-entry" key={item.id}><button className="home-attention-open" onClick={()=>onAttention?.(item)}><span className={item.tone==='warning'?'home-attention-warning':'home-attention-info'}>{item.tone==='warning'?<AlertCircle size={18}/>:<Bell size={18}/>}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={17}/></button><div className="home-reminder-actions"><button onClick={()=>deferReminder(item,true)}><CheckCircle2 size={14}/> Reviewed</button><button onClick={()=>deferReminder(item,false)}><Clock3 size={14}/> Remind in 1 hour</button></div></div>)}
          {!visibleAttention.length && <p className="home-reminder-note">No new reminders to review.</p>}
          {!!hiddenAttention.length && <><button className="home-hidden-toggle" aria-expanded={showHidden} onClick={()=>setShowHidden(!showHidden)}>{showHidden?'Hide':'Show'} reviewed / later ({hiddenAttention.length})</button>{showHidden && hiddenAttention.map(item => <div className="home-hidden-reminder" key={item.id}><span><b>{item.title}</b><small>{preferences.reminders[item.id].reviewed?'Reviewed · returns if details change':`Remind at ${new Date(preferences.reminders[item.id].until).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`}</small></span><button onClick={()=>restoreReminder(item.id)}>Restore</button></div>)}</>}
        </div></section>}
        {preferenceMessage && <p className="home-preference-message" role="status">{preferenceMessage}<button aria-label="Dismiss preference message" onClick={()=>setPreferenceMessage('')}><X size={14}/></button></p>}
        {resumeChart && isGlobalInstrumentKey(stockOptions.find(stock => stock.symbol === resumeChart.symbol)?.instrumentKey) === (activeMarket === 'global') && <button className="home-resume-card" onClick={onResumeChart}><span className="home-resume-icon"><CandlestickChart size={23}/></span><span><small>Continue your chart</small><b>{resumeChart.symbol} <em>· {resumeChart.timeframe}</em></b><small>Your saved chart setup</small></span><span className="home-resume-action">Resume <Play size={14}/></span></button>}
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
