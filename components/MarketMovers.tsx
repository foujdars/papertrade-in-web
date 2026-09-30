"use client";
import { useEffect, useState } from "react";
import { StockLogo } from "@/components/StockLogo";
import { MOVER_TABS, type Mover, type MoverTab } from "@/lib/market-movers";

type Lists = Record<MoverTab, Mover[]>;

const price = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <header><span><b>Market movers</b></span><small>NSE</small></header>
    <div className="home-mover-tabs" role="tablist" aria-label="Mover list">{MOVER_TABS.map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
    {rows.length ? <div className="home-mover-list">{rows.map(row => <button key={row.symbol} type="button" onClick={() => onOpen(row.symbol)} aria-label={`Open ${row.symbol} chart`}>
      <StockLogo symbol={row.symbol} size={28} />
      <span><b>{row.symbol}</b><small>{row.name}{row.note ? ` · ${row.note}` : ""}</small></span>
      <span><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{row.change > 0 ? "+" : ""}{row.change.toFixed(2)}%</em></span>
    </button>)}</div> : <div className="india-pulse-wait">{lists || failed ? "No names on this list right now" : "Loading NSE movers"}</div>}
  </section>;
}
