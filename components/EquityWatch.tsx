"use client";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StockLogo } from "@/components/StockLogo";
import { sortWatch, volumeLabel, WATCH_INDICES, type WatchIndexId, type WatchQuote, type WatchSort } from "@/lib/equity-watch";

const price = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sorts: { id: WatchSort; label: string }[] = [
  { id: "change", label: "%" },
  { id: "name", label: "A–Z" },
  { id: "volume", label: "Vol" },
];

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
  const title = WATCH_INDICES.find(item => item.id === index)?.label ?? "Equity market watch";
  const ordered = useMemo(() => sortWatch(rows ?? [], sort), [rows, sort]);
  const choose = (id: WatchIndexId) => { setIndex(id); setOpen(true); };
  return <section id="equity-watch" className="home-section home-equity-watch" aria-label="Equity market watch">
    <header><span><b>Equity market watch</b></span><small>NSE</small></header>
    <div className="home-board-cards">{WATCH_INDICES.map(item => <button key={item.id} type="button" onClick={() => choose(item.id)} aria-label={`Open ${item.label}`}><b>{item.label}</b></button>)}</div>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close equity market watch" onClick={() => setOpen(false)} />
      <div className="home-side-sheet" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
        <header><b>{title}</b><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="home-watch-sort" role="group" aria-label="Sort">{sorts.map(item => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}</div>
        <div className="home-mover-tabs" role="tablist" aria-label="Index">{WATCH_INDICES.map(item => <button key={item.id} type="button" role="tab" aria-selected={index === item.id} onClick={() => setIndex(item.id)}>{item.label}</button>)}</div>
        {ordered.length ? <div className="home-watch-list">{ordered.map(row => <button key={row.symbol} type="button" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span><b>{row.symbol}</b><small>{row.name} · Vol {volumeLabel(row.volume)}{row.high !== null && row.low !== null ? ` · H ${price.format(row.high)} L ${price.format(row.low)}` : ""}</small></span>
          <span><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{row.change > 0 ? "+" : ""}{row.change.toFixed(2)}%</em></span>
        </button>)}</div> : <div className="india-pulse-wait">{rows || failed ? "No names in this index right now" : "Loading equity market watch"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </section>;
}
