"use client";
import { useEffect, useMemo, useState } from "react";
import { sortWatch, volumeLabel, WATCH_INDICES, type WatchIndexId, type WatchQuote, type WatchSort } from "@/lib/equity-watch";

const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const sorts: { id: WatchSort; label: string }[] = [
  { id: "change", label: "%" },
  { id: "name", label: "A–Z" },
  { id: "volume", label: "Vol" },
];

function quote(value: number, change: number) {
  return `${price.format(value)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%)`;
}

export function EquityWatch({ onOpen, focusIndex = null }: { onOpen: (symbol: string) => void; focusIndex?: string | null }) {
  const [index, setIndex] = useState<WatchIndexId>("nifty50");
  const [sort, setSort] = useState<WatchSort>("change");
  const [rows, setRows] = useState<WatchQuote[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (focusIndex && WATCH_INDICES.some(item => item.id === focusIndex)) setIndex(focusIndex as WatchIndexId);
  }, [focusIndex]);
  useEffect(() => {
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
  }, [index]);
  const ordered = useMemo(() => sortWatch(rows ?? [], sort), [rows, sort]);
  return <section id="equity-watch" className="home-section home-equity-watch" aria-label="Equity market watch">
    <header><span><b>Equity market</b></span></header>
    <div className="home-mover-tabs" role="tablist" aria-label="Index">{WATCH_INDICES.map(item => <button key={item.id} type="button" role="tab" aria-selected={index === item.id} onClick={() => setIndex(item.id)}>{item.label}</button>)}</div>
    <div className="home-watch-sort" role="group" aria-label="Sort">{sorts.map(item => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}</div>
    {ordered.length ? <div className="home-pair-list">{ordered.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => onOpen(row.symbol)} aria-label={`Open ${row.symbol} chart`}>
      <span className="home-pair-name"><span><b>{row.symbol}</b><small>{row.name}</small></span>{row.volume > 0 ? <small className="home-pair-vol">Vol {volumeLabel(row.volume)}</small> : null}</span>
      <em className={row.change < 0 ? "down" : "up"}>{quote(row.price, row.change)}</em>
    </button>)}</div> : <div className="india-pulse-wait">{rows || failed ? "No names in this index right now" : "Loading equity market watch"}</div>}
  </section>;
}
