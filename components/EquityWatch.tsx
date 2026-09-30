"use client";
import { ChevronRight, Landmark, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { sortWatch, volumeLabel, WATCH_INDICES, type WatchIndexId, type WatchQuote, type WatchSort } from "@/lib/equity-watch";
import { StockLogo } from "@/components/StockLogo";

const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const sorts: { id: WatchSort; label: string }[] = [
  { id: "change", label: "%" },
  { id: "name", label: "A–Z" },
  { id: "volume", label: "Vol" },
];

function percent(change: number) {
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
}

export function EquityWatch({ onOpen, focusIndex = null, focusTick = 0 }: { onOpen: (symbol: string) => void; focusIndex?: string | null; focusTick?: number }) {
  const [index, setIndex] = useState<WatchIndexId>("nifty50");
  const [sort, setSort] = useState<WatchSort>("change");
  const [rows, setRows] = useState<WatchQuote[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!focusTick || !focusIndex || !WATCH_INDICES.some(item => item.id === focusIndex)) return;
    setIndex(focusIndex as WatchIndexId);
    setOpen(true);
  }, [focusIndex, focusTick]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const load = () => {
      fetch(`/api/market/equity-watch?index=${index}`, { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => {
          if (!body?.ok || !Array.isArray(body.rows)) { setFailed(true); return; }
          setFailed(false);
          setRows(body.rows);
        })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    };
    setFailed(false);
    setRows(null);
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [index, open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const title = WATCH_INDICES.find(item => item.id === index)?.label ?? "Equity market";
  const ordered = useMemo(() => sortWatch(rows ?? [], sort), [rows, sort]);
  return <div id="equity-watch" className="home-market-slot">
    <button type="button" className="home-market-card" data-kind="equity" onClick={() => setOpen(true)} aria-label="Open equity market">
      <span className="home-market-card-icon" aria-hidden="true"><Landmark size={17} /></span>
      <span className="home-market-card-copy"><b>Equity market</b><small>Nifty 50, Next 50, sectors</small></span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close equity market" onClick={() => setOpen(false)} />
      <div className="home-side-sheet" role="dialog" aria-modal="true" aria-label="Equity market watch">
        <header><span><small>Equity market</small><b>{title}</b></span><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="home-mover-tabs" role="tablist" aria-label="Index">{WATCH_INDICES.map(item => <button key={item.id} type="button" role="tab" aria-selected={index === item.id} onClick={() => setIndex(item.id)}>{item.label}</button>)}</div>
        <div className="home-watch-sort" role="group" aria-label="Sort">{sorts.map(item => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}</div>
        {ordered.length ? <div className="home-pair-list">{ordered.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span className="home-pair-name"><span><b>{row.symbol}</b><small>{row.name}</small></span>{row.volume > 0 ? <small className="home-pair-vol">Vol {volumeLabel(row.volume)}</small> : null}</span>
          <span className="home-pair-quote"><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{percent(row.change)}</em></span>
        </button>)}</div> : <div className="india-pulse-wait">{rows || failed ? "No names in this index right now" : "Loading equity market watch"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </div>;
}
