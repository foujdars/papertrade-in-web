"use client";
import { ChevronRight, TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MOVER_TABS, volumeMetrics, type Mover, type MoverTab } from "@/lib/market-movers";
import { StockLogo } from "@/components/StockLogo";

type Lists = Record<MoverTab, Mover[]>;

const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function percent(change: number) {
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

export function MarketMovers({ onOpen }: { onOpen: (symbol: string) => void }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<MoverTab>("gainers");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/market/movers", { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => {
          if (!body?.ok || !body.lists) { setFailed(true); return; }
          setFailed(false);
          setLists(body.lists);
        })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const label = MOVER_TABS.find(item => item.id === tab)?.label ?? "Market movers";
  const rows = lists?.[tab] ?? [];
  const gainers = lists?.gainers ?? [];
  const losers = lists?.losers ?? [];
  const bars = [...gainers.slice(0, 3), ...losers.slice(0, 2)];
  const peak = Math.max(1, ...bars.map(row => Math.abs(row.change)));
  const lead = gainers[0];
  const lag = losers[0];
  return <div className="home-market-slot">
    <button type="button" className="home-market-card" data-kind="movers" onClick={() => setOpen(true)} aria-label={lead ? `Open market movers. Top gainer ${lead.symbol} ${percent(lead.change)}` : "Open market movers"}>
      <span className="home-market-card-top">
        <span className="home-market-card-icon" aria-hidden="true"><TrendingUp size={18} /></span>
        <span className="home-market-card-aside">
          <span className="home-market-spark" aria-hidden="true">{bars.length ? bars.map(row => <i key={row.symbol} className={row.change < 0 ? "down" : "up"} style={{ height: `${Math.max(22, Math.round(Math.abs(row.change) / peak * 100))}%` }} />) : <><i /><i /><i /><i /><i /></>}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </span>
      <span className="home-market-card-copy"><b>Market movers{lists ? <i className="home-market-live" /> : null}</b><small>{lead && lag ? `${lead.symbol} ${percent(lead.change)} · ${lag.symbol} ${percent(lag.change)}` : "Gainers, losers, 52-week highs and circuit bands"}</small></span>
      <span className="home-market-pills" aria-hidden="true"><em className="up">{lead ? `+${lead.change.toFixed(1)}%` : "Gainers"}</em><em className="down">{lag ? `${lag.change.toFixed(1)}%` : "Losers"}</em><em>52W</em></span>
    </button>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close market movers" onClick={() => setOpen(false)} />
      <div className="home-side-sheet" role="dialog" aria-modal="true" aria-label="Market movers">
        <header><span><small>Market movers</small><b>{label}</b></span><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="home-mover-tabs" role="tablist" aria-label="Mover list">{MOVER_TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
        {rows.length ? <div className="home-pair-list">{rows.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span className="home-pair-name"><span><b>{row.symbol}</b><small>{row.name}</small></span>{volumeMetrics(row) ? <small className="home-pair-vol">{volumeMetrics(row)}</small> : null}</span>
          <span className="home-pair-quote"><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{percent(row.change)}</em></span>
        </button>)}</div> : <div className="india-pulse-wait">{lists || failed ? "No names on this list right now" : "Loading NSE movers"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </div>;
}
