"use client";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StockLogo } from "@/components/StockLogo";
import { MOVER_TABS, type Mover, type MoverTab } from "@/lib/market-movers";

type Lists = Record<MoverTab, Mover[]>;

const price = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MarketMovers({ onOpen }: { onOpen: (symbol: string) => void }) {
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<MoverTab | null>(null);
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
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const tab = MOVER_TABS.find(item => item.id === open);
  const rows = open ? lists?.[open] ?? [] : [];
  return <section className="home-section home-movers" aria-label="NSE market movers">
    <header><span><b>Market movers</b></span><small>NSE</small></header>
    <div className="home-board-cards">{MOVER_TABS.map(item => {
      const lead = lists?.[item.id]?.[0];
      return <button key={item.id} type="button" onClick={() => setOpen(item.id)} aria-label={`Open ${item.label}`}>
        <b>{item.label}</b>
        <small>{lead ? `${lead.symbol} ${lead.change > 0 ? "+" : ""}${lead.change.toFixed(1)}%` : failed ? "Unavailable" : "NSE"}</small>
      </button>;
    })}</div>
    {open && tab && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close market movers" onClick={() => setOpen(null)} />
      <div className="home-side-sheet" role="dialog" aria-modal="true" aria-label={tab.label} onKeyDown={event => { if (event.key === "Escape") setOpen(null); }}>
        <header><b>{tab.label}</b><button type="button" aria-label="Close" onClick={() => setOpen(null)}><X size={20} /></button></header>
        {rows.length ? <div className="home-mover-list">{rows.map(row => <button key={row.symbol} type="button" onClick={() => { setOpen(null); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span><b>{row.symbol}</b><small>{row.name}{row.note ? ` · ${row.note}` : ""}</small></span>
          <span><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{row.change > 0 ? "+" : ""}{row.change.toFixed(2)}%</em></span>
        </button>)}</div> : <div className="india-pulse-wait">{lists || failed ? "No names on this list right now" : "Loading NSE movers"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </section>;
}
