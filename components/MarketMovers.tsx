"use client";
import { DesktopPriceLine } from "./DesktopMarketVisuals";
import { useDesktopBrowser } from "./useDesktopBrowser";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MOVER_TABS, volumeMetrics, type Mover, type MoverTab, type MoverMetadata } from "@/lib/market-movers";
import { volumeLabel } from '@/lib/equity-watch';
import { MarketDataStatus } from './MarketDataStatus';
import { marketTimeLabel } from '@/lib/market-data-status';
import { StockLogo } from "@/components/StockLogo";
import { startVisiblePolling } from "@/lib/visible-polling";
import { useTransientBack } from "./useTransientBack";

type Lists = Partial<Record<MoverTab, Mover[]>>;

const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function percent(change: number) {
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

export function MarketMovers({ onOpen, inline = false }: { onOpen: (symbol: string) => void; inline?: boolean }) {
  const desktop = useDesktopBrowser();
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [metadata,setMetadata]=useState<MoverMetadata|null>(null);
  const [tab, setTab] = useState<MoverTab>("gainers");
  const [open, setOpen] = useState(false);
  useTransientBack(open && !inline, () => setOpen(false));
  useEffect(() => {
    return startVisiblePolling(async signal => {
      const response = await fetch(`/api/market/movers${open || inline ? "" : "?summary=1"}`, {signal,cache:"no-store"});
      const body = await response.json();
      if (signal.aborted) return;
      if (!response.ok || !body?.ok || !body.lists) {setFailed(true);return;}
      setFailed(false);setLists(body.lists);setMetadata(body);
    }, 15000, () => setFailed(true));
  }, [open, inline]);
  useEffect(() => {
    if (!open || inline) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open, inline]);
  const label = MOVER_TABS.find(item => item.id === tab)?.label ?? "Market movers";
  const rows = lists?.[tab] ?? [];
  const gainers = lists?.gainers ?? [];
  const losers = lists?.losers ?? [];
  const high = lists?.high52?.[0];
  const lead = gainers[0];
  const lag = losers[0];
  const moverTile = (kind: string, row: Mover | undefined) => <span className="home-mover-preview" key={kind} data-direction={kind === "Top gainer" ? "up" : "down"} aria-label={`${kind}: ${row ? `${row.symbol} ${percent(row.change)}` : "awaiting quotes"}`}>
    <small>{kind}</small><b title={row?.name}>{row?.symbol ?? '—'}</b>
    <em className={row ? row.change < 0 ? 'down' : row.change > 0 ? 'up' : '' : ''}>{row ? percent(row.change) : '—'}</em>
  </span>;
  if (inline) return <section className="desktop-movers home-movers-slot" aria-label="Top movers today">
    <header><div><h2>Top movers today</h2><p>Explore NSE stocks by performance and activity</p></div><span>NSE</span></header>
    <MarketDataStatus metadata={metadata} failed={failed} tab={tab}/>
    <div className="desktop-mover-tabs" role="tablist" aria-label="Mover list">{MOVER_TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    <div className="desktop-market-table" role="table" aria-label={`${label} stocks`}>
      <div className="desktop-market-table-head" role="row"><span role="columnheader">Company</span><span role="columnheader">Market price</span><span role="columnheader">1D change</span><span role="columnheader">Volume</span>{desktop&&<span role="columnheader">Latest session</span>}</div>
      {rows.map(row => <button key={row.symbol} className="desktop-stock-row" role="row" aria-label={`Open ${row.symbol} chart`} onClick={() => onOpen(row.symbol)}>
        <span className="desktop-stock-name" role="cell"><StockLogo symbol={row.symbol} size={34}/><span><b>{row.symbol}</b><small>{row.name}</small><small className="market-quote-time">{row.source==='tradingview'?'Delayed scanner quote':`${row.delayed?'Delayed · ':''}${marketTimeLabel(row.quoteAt)}`}</small></span></span>
        <span role="cell">₹{price.format(row.price)}</span><span role="cell" className={row.change < 0 ? 'negative' : 'positive'}>{percent(row.change)}</span><span role="cell">{volumeLabel(row.volume)}</span>{desktop&&<span role="cell"><DesktopPriceLine instrumentKey={row.instrumentKey} label={row.symbol} reference={row.previousClose} referenceAt={row.quoteAt??undefined}/></span>}
      </button>)}
      {!rows.length && <p role="status" className="desktop-table-empty">{failed||metadata?.failedTabs?.includes(tab)?'Quotes unavailable. Retrying…':Array.isArray(lists?.[tab])?'No stocks on this list right now.':'Loading market movers…'}</p>}
    </div>
  </section>;
  return <div className="home-market-slot home-movers-slot">
    <button type="button" className="home-market-card home-market-card-v2" data-kind="movers" onClick={() => setOpen(true)} aria-label={lead ? `Open market movers. Top gainer ${lead.symbol} ${percent(lead.change)}` : "Open market movers"}>
      <span className="home-market-card-copy"><span className="home-market-card-title"><b>Movers</b></span><ChevronRight size={17} aria-hidden="true" /></span>
      <span className="home-mover-previews">{moverTile('Top gainer', lead)}{moverTile('Top loser', lag)}</span>
      <span className="home-mover-highlight"><small>52-week high</small><b>{high?.symbol ?? '—'}</b><em className={high ? high.change < 0 ? 'down' : 'up' : ''}>{high ? percent(high.change) : '—'}</em></span>
      <MarketDataStatus metadata={metadata} failed={failed} compact/>
      {!lists && <span className="home-market-empty" role="status">{failed ? 'Quotes unavailable' : 'Loading movers…'}</span>}
    </button>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close market movers" onClick={() => setOpen(false)} />
      <div className="home-side-sheet home-market-sheet" role="dialog" aria-modal="true" aria-label="Market movers">
        <header><span><small>Market movers</small><b>{label}</b></span><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <MarketDataStatus metadata={metadata} failed={failed} tab={tab}/>
        <div className="home-mover-tabs" role="tablist" aria-label="Mover list">{MOVER_TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        {rows.length ? <div className="home-pair-list">{rows.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span className="home-pair-name"><b>{row.symbol}</b><small>{row.name}</small><small className="home-pair-vol">{volumeMetrics(row) || "—"}</small></span>
          <span className="home-pair-quote"><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{percent(row.change)}</em><small className="market-quote-time">{row.source==='tradingview'?'Delayed scanner quote':`${row.delayed?'Delayed · ':''}${marketTimeLabel(row.quoteAt)}`}</small></span>
        </button>)}</div> : <div className="india-pulse-wait">{failed||metadata?.failedTabs?.includes(tab)?"Quotes unavailable. Retrying…":Array.isArray(lists?.[tab])?"No names on this list right now":"Loading NSE movers"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </div>;
}
