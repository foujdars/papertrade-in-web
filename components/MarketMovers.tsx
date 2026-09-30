"use client";
import { useEffect, useState } from "react";
import { MOVER_TABS, volumeMetrics, type Mover, type MoverTab } from "@/lib/market-movers";

type Lists = Record<MoverTab, Mover[]>;

const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function quote(value: number, change: number) {
  return `${price.format(value)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%)`;
}

export function MarketMovers({ onOpen }: { onOpen: (symbol: string) => void }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<MoverTab>("gainers");
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
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  const rows = lists?.[tab] ?? [];
  return <section className="home-section home-movers" aria-label="NSE market movers">
    <header><span><b>Market movers</b></span></header>
    <div className="home-mover-tabs" role="tablist" aria-label="Mover list">{MOVER_TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {rows.length ? <div className="home-pair-list">{rows.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => onOpen(row.symbol)} aria-label={`Open ${row.symbol} chart`}>
      <span className="home-pair-name"><span><b>{row.symbol}</b><small>{row.name}</small></span>{volumeMetrics(row) ? <small className="home-pair-vol">{volumeMetrics(row)}</small> : null}</span>
      <em className={row.change < 0 ? "down" : "up"}>{quote(row.price, row.change)}</em>
    </button>)}</div> : <div className="india-pulse-wait">{lists || failed ? "No names on this list right now" : "Loading NSE movers"}</div>}
  </section>;
}
