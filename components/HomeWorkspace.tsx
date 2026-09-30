"use client";
import type { HomeAttention } from '@/lib/home-attention';
import { Bell, AlertCircle, Eye, EyeOff, Clock3, Globe2, Landmark, Plus } from 'lucide-react';
import { isGlobalInstrumentKey } from '@/lib/global-markets';
import { compareMarketInstruments } from '@/lib/market-directory';
import { MarketDirectory } from './MarketDirectory';
import { IndiaPulse, IndiaFlows } from "./IndiaPulse";
import { MarketMovers } from "./MarketMovers";
import { EquityWatch } from "./EquityWatch";
import { BulkDeals } from "./BulkDeals";
import { SectorHeat } from "./SectorHeat";
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
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usableHomeQuote, quoteChangeText, type HomeQuote } from "@/lib/home-quotes";
import { formatInr } from "@/lib/market";
import { FALLBACK_POPULAR, matchShelfInstrument, searchShelfRows, type PopularLists, type SearchShelfId } from "@/lib/search-shelf";
import { volumeLabel } from "@/lib/equity-watch";
import type { BoardQuote, SearchBoard } from "@/lib/search-board";

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
  indices,
  feedLive,
  globalWallet,
  globalWalletError,
  globalAvailable,
  globalPositions,
  globalOpenOrders,
  globalOpenPnl,
  globalPnlComplete,
  todayPnl,
  holdingsCount,
  openPositionsCount,
  closedTradesCount,
  stockOptions,
  cards,
  riskSummary: _riskSummary,

  onOpenWatchlist,
  onOpenHoldings,
  onOpenPositions,
  onOpenTradeHistory,
  onOpenPnl,
  onOpenStock, preferenceOwner='guest', recentSymbols=[], onClearRecent,
  realisedToday: _realisedToday = 0, openChangeToday = 0, attention = [], onAttention, onOpenRealised: _onOpenRealised,
}: {
  preferenceOwner?:string;favouriteSymbols?:string[];recentSymbols?:string[];onClearRecent?:()=>void;
  realisedToday?:number;openChangeToday?:number|null;sessionLabel?:string;sessionMessage?:string;
  attention?:HomeAttention[];onAttention?:(item:HomeAttention)=>void;
  onOpenRealised?:()=>void;
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
  const [sectorWatch, setSectorWatch] = useState<string | null>(null);
  const [sectorTick, setSectorTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [shelf, setShelf] = useState<SearchShelfId>("all");
  const [popular, setPopular] = useState<PopularLists>(FALLBACK_POPULAR);
  const [boards, setBoards] = useState<{ in: SearchBoard; us: SearchBoard; crypto: SearchBoard } | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (!searchFocused) return;
    sheetInput.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controller = new AbortController();
    fetch("/api/market/search-popular", { signal: controller.signal, cache: "no-store" })
      .then(response => response.json())
      .then(body => {
        if (!body?.ok || !Array.isArray(body.in) || !Array.isArray(body.us) || !Array.isArray(body.crypto)) return;
        setPopular({ in: body.in, us: body.us, crypto: body.crypto, sources: { in: String(body.sources?.in ?? "fallback"), us: String(body.sources?.us ?? "fallback"), crypto: String(body.sources?.crypto ?? "fallback") } });
      })
      .catch(() => undefined);
    fetch("/api/market/search-movers", { signal: controller.signal, cache: "no-store" })
      .then(response => response.json())
      .then(body => {
        if (!body?.ok || !body.in || !body.us || !body.crypto) return;
        setBoards({ in: body.in, us: body.us, crypto: body.crypto });
      })
      .catch(() => undefined);
    return () => { document.body.style.overflow = previous; controller.abort(); };
  }, [searchFocused]);
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
  const shelfRows = useMemo(() => searchShelfRows({ shelf, instruments: stockOptions, recent: recentSymbols, popular, query: search }), [popular, recentSymbols, search, shelf, stockOptions]);
  const closeSearch = () => { setSearchFocused(false); setSearch(""); };
  const inrPrice = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const boardKey = shelf === "crypto" ? "crypto" : shelf === "us" || (shelf === "all" && activeMarket === "global") ? "us" : "in";
  const boardShelf: SearchShelfId = boardKey === "in" ? "in" : boardKey;
  const listMoney = (value: number) => {
    if (!(value > 0)) return "—";
    if (boardKey === "in") return inrPrice.format(value);
    const digits = value >= 1 ? 2 : 4;
    return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  const searchLine = (line: { key: string; symbol: string; name: string; price: number; change: number; volume: number; stock: HomeStockOption | null }) => <button key={line.key} type="button" className="home-pair-row" aria-label={`Open ${line.symbol} chart`} onClick={() => { if (line.stock) chooseSearch(line.stock, true); else { setSearch(""); setSearchFocused(false); onOpenStock(line.symbol); } }}>
    {line.stock?.assetType === "INDEX" ? <TrendingUp size={28} aria-hidden="true" /> : <StockLogo symbol={line.stock?.symbol ?? line.symbol} instrumentKey={line.stock?.instrumentKey} categories={line.stock?.categories} size={28} />}
    <span className="home-pair-name"><b>{line.symbol}</b><small>{line.name}</small><small className="home-pair-vol">{line.volume > 0 ? `Vol ${volumeLabel(line.volume)}` : "—"}</small></span>
    <span className="home-pair-quote"><strong>{listMoney(line.price)}</strong><em className={line.change < 0 ? "down" : "up"}>{line.change > 0 ? "+" : ""}{line.change.toFixed(2)}%</em></span>
  </button>;
  const quoteLine = (quote: BoardQuote, seen: Set<string>) => {
    const stock = matchShelfInstrument(stockOptions, boardShelf, quote.symbol);
    const symbol = stock?.symbol ?? quote.symbol;
    if (seen.has(symbol)) return null;
    seen.add(symbol);
    return { key: `${boardKey}:${symbol}`, symbol, name: stock?.name ?? quote.name, price: quote.price, change: quote.change, volume: quote.volume, stock };
  };
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
  const seen = new Set<string>();
  const recentLines = shelfRows.recent.slice(0, 5).map(stock => {
    seen.add(stock.symbol);
    return { key: stock.symbol, symbol: stock.symbol, name: stock.name, price: stock.price, change: stock.changePercent, volume: 0, stock };
  });
  const board = boards?.[boardKey];
  const gainerLines = (board?.gainers ?? []).map(quote => quoteLine(quote, seen)).filter((line): line is NonNullable<typeof line> => !!line).slice(0, 5);
  const loserLines = (board?.losers ?? []).map(quote => quoteLine(quote, seen)).filter((line): line is NonNullable<typeof line> => !!line).slice(0, 5);

  return (
    <section className="home-workspace home-hub home-studio" data-market={activeMarket} aria-label="PaperTrade home">
      <div className="home-dashboard-scroll">
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="home-global-search" onBlur={event => { const next = event.relatedTarget as Node | null; if (next && (event.currentTarget.contains(next) || sheetRef.current?.contains(next))) return; if (sheetRef.current) return; setSearchFocused(false); setSearch(""); }} onKeyDown={event => { if (event.key === "Escape") closeSearch(); }}>
              <Search size={18} />
              <input value={search} onFocus={() => { setSearchFocused(true); setShelf(activeMarket === "global" ? "all" : "in"); }} onChange={(event) => { setSearchFocused(true); setSearch(event.target.value); }} placeholder={activeMarket === 'global' ? 'Search US, crypto, commodities…' : 'Search Indian stocks and indices…'} aria-label={activeMarket === 'global' ? 'Search global markets' : 'Search Indian markets'} autoComplete="off" />
              {search && !searchFocused && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
              {searchFocused && typeof document !== "undefined" && createPortal(
                <>
                  <button type="button" className="home-search-backdrop" aria-label="Close search" onClick={closeSearch} />
                  <div ref={sheetRef} className="home-search-sheet" role="dialog" aria-modal="true" aria-label="Search markets" onKeyDown={event => { if (event.key === "Escape") closeSearch(); }}>
                    <header>
                      <label className="home-search-field">
                        <Search size={18} />
                        <input ref={sheetInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or symbol" aria-label="Search all markets" autoComplete="off" />
                        {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}
                      </label>
                      <button type="button" aria-label="Close search" onClick={closeSearch}><X size={20} /></button>
                    </header>
                    <div className="home-search-tabs" role="tablist" aria-label="Market">
                      {([["all", "All"], ["in", "IN"], ["us", "US"], ["crypto", "Crypto"]] as const).map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={shelf === id} onClick={() => setShelf(id)}>{label}</button>)}
                    </div>
                    <div className="home-search-sheet-list">
                      {search.trim() ? shelfRows.matches.length ? shelfRows.matches.map(stock => searchLine({ key: stock.symbol, symbol: stock.symbol, name: stock.name, price: stock.price, change: stock.changePercent, volume: 0, stock })) : <div className="home-search-empty" role="status">No matching instruments.</div> : <>
                        {!!recentLines.length && <div className="home-search-group"><b>Recently opened</b>{onClearRecent && <button type="button" onClick={onClearRecent}>Clear</button>}</div>}
                        {recentLines.map(searchLine)}
                        {!!gainerLines.length && <div className="home-search-group"><b>Gainers</b></div>}
                        {gainerLines.map(searchLine)}
                        {!!loserLines.length && <div className="home-search-group"><b>Losers</b></div>}
                        {loserLines.map(searchLine)}
                        {!recentLines.length && !gainerLines.length && !loserLines.length && <div className="home-search-empty">{boards ? "Search this market by name or symbol." : "Loading market lists"}</div>}
                      </>}
                    </div>
                  </div>
                </>,
                document.querySelector(".terminal-shell") ?? document.body,
              )}
            </div>
          </div>
        </section>

        <section className="home-market-chooser" aria-label="Choose market and practice wallet">
          <button className={activeMarket === 'india' ? 'active' : ''} aria-pressed={activeMarket === 'india'} onClick={() => { updatePreferences({ ...preferences, market: 'india' }); setSearch(''); setSearchFocused(false); }}><Landmark size={19}/><span><b>Indian markets</b><small>{'Stocks & F&O'}</small></span><em>₹</em></button>
          <button className={activeMarket === 'global' ? 'active' : ''} aria-pressed={activeMarket === 'global'} onClick={() => { updatePreferences({ ...preferences, market: 'global' }); setSearch(''); setSearchFocused(false); }}><Globe2 size={19}/><span><b>Global markets</b><small>US · Crypto · Commodities</small></span><em>$</em></button>
        </section>

        {activeMarket === 'india' && cards.market && <section className="home-section home-pulse-section home-pulse-first">
          <div className="home-index-grid" aria-label="Indian market indices">
            {indices.map((index) => {
              const points = index.points;
              const change = index.changePercent;
              const known = points !== null && change !== null;
              const up = (change ?? 0) >= 0;
              return (
                <button key={index.symbol} className="home-index-card" data-symbol={index.symbol} data-live={index.live ? "true" : "false"} data-tone={known ? (up ? "up" : "down") : "flat"} onClick={() => onOpenStock(index.symbol)}>
                  <span>{index.live ? <i aria-hidden="true" /> : null}{index.label}</span>
                  <b>{index.price === null ? "—" : index.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b>
                  <small className={known ? (up ? "positive" : "negative") : ""}>
                    <em>{known ? `${up ? "+" : ""}${change.toFixed(2)}%` : "—"}</em>
                    {known ? <em>{`${points >= 0 ? "+" : ""}${points.toFixed(2)}`}</em> : null}
                  </small>
                </button>
              );
            })}
          </div>
          <SessionBoard />
        </section>}

        {!(activeMarket === 'india' && cards.market) && <SessionBoard />}

        <div className="home-main-grid home-main-grid-clean">
          {activeMarket === 'india' && cards.portfolio && <section className="home-section home-portfolio-card">
            <header><span><BriefcaseBusiness size={17} /><b>Your paper portfolio</b></span><div className="home-portfolio-actions"><button className="home-balance-toggle" disabled={!preferencesReady} aria-label={privateBalances?'Show balances on Home':'Hide balances on Home'} title="Privacy on Home only" aria-pressed={privateBalances} onClick={() => updatePreferences({...preferences,privateBalances:!privateBalances})}>{privateBalances?<Eye size={16}/>:<EyeOff size={16}/>}{privateBalances?'Show':'Hide'}</button><button onClick={onOpenPnl}>View P&amp;L <ChevronRight size={14} /></button></div></header>
            <div className="home-portfolio-row" aria-label="Portfolio snapshot">
              <button className="home-today-pnl" onClick={onOpenPnl} aria-label="Today's profit and loss — view P&L"><small>Today P&L</small><strong className={privateBalances||openChangeToday===null?"":todayPnl >= 0 ? "positive" : "negative"}>{privateBalances?'••••':openChangeToday===null?"—":`${todayPnl>=0?"+":""}${formatInr(todayPnl)}`}</strong></button>
              <button onClick={onOpenHoldings} aria-label="Holdings"><small>Holdings</small><b>{holdingsCount}</b></button>
              <button onClick={onOpenPositions} aria-label="Open positions"><small>Open</small><b>{openPositionsCount}</b></button>
              <button onClick={onOpenTradeHistory} aria-label="Closed trades"><small>Closed</small><b>{closedTradesCount}</b></button>
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
        {activeMarket === "india" && <div className="home-market-pair">
          <MarketMovers onOpen={onOpenStock} />
          <EquityWatch onOpen={onOpenStock} focusIndex={sectorWatch} focusTick={sectorTick} />
        </div>}
        {activeMarket === "india" ? <IndiaPulse /> : <MarketDirectory key={activeMarket} market={activeMarket} instruments={marketOptions} onOpen={onOpenStock}/>}
        {activeMarket === 'india' && preferencesReady && !!attention.length && <section className="home-section home-attention"><header><span><AlertCircle size={17}/><b>Needs attention</b></span><small>{visibleAttention.length} to review</small></header><div>
          {visibleAttention.slice(0,3).map(item => <div className="home-attention-entry" key={item.id}><button className="home-attention-open" onClick={()=>onAttention?.(item)}><span className={item.tone==='warning'?'home-attention-warning':'home-attention-info'}>{item.tone==='warning'?<AlertCircle size={18}/>:<Bell size={18}/>}</span><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={17}/></button><div className="home-reminder-actions"><button onClick={()=>deferReminder(item,true)}><CheckCircle2 size={14}/> Reviewed</button><button onClick={()=>deferReminder(item,false)}><Clock3 size={14}/> Remind in 1 hour</button></div></div>)}
          {!visibleAttention.length && <p className="home-reminder-note">No new reminders to review.</p>}
          {!!hiddenAttention.length && <><button className="home-hidden-toggle" aria-expanded={showHidden} onClick={()=>setShowHidden(!showHidden)}>{showHidden?'Hide':'Show'} reviewed / later ({hiddenAttention.length})</button>{showHidden && hiddenAttention.map(item => <div className="home-hidden-reminder" key={item.id}><span><b>{item.title}</b><small>{preferences.reminders[item.id].reviewed?'Reviewed · returns if details change':`Remind at ${new Date(preferences.reminders[item.id].until).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}`}</small></span><button onClick={()=>restoreReminder(item.id)}>Restore</button></div>)}</>}
        </div></section>}
        {preferenceMessage && <p className="home-preference-message" role="status">{preferenceMessage}<button aria-label="Dismiss preference message" onClick={()=>setPreferenceMessage('')}><X size={14}/></button></p>}
        {activeMarket === 'india' && <BulkDeals onOpen={onOpenStock} />}
        {activeMarket === 'india' && <SectorHeat onOpen={onOpenStock} onWatch={id => { setSectorWatch(id); setSectorTick(tick => tick + 1); }} />}
        {activeMarket === 'india' && <IndiaFlows />}
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
