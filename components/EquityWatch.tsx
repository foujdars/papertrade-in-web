"use client";
import { useEffect, useMemo, useState } from "react";
import { StockLogo } from "@/components/StockLogo";
import { sortWatch, volumeLabel, WATCH_INDICES, type WatchIndexId, type WatchQuote, type WatchSort } from "@/lib/equity-watch";

const price = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sorts: { id: WatchSort; label: string }[] = [
  { id: "change", label: "%" },
  { id: "name", label: "A–Z" },
  { id: "volume", label: "Vol" },
];

export function EquityWatch({ onOpen }: { onOpen: (symbol: string) => void }) {
  const [index, setIndex] = useState<WatchIndexId>("nifty50");
  const [sort, setSort] = useState<WatchSort>("change");
  const [rows, setRows] = useState<WatchQuote[] | null>(null);
  const [failed, setFailed] = useState(false);
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
  return <section className="home-section home-equity-watch" aria-label="Equity market watch">
    <header><span><b>Equity market watch</b></span><small>{ordered.length ? `${ordered.length} NSE` : "NSE"}</small></header>
    <div className="home-mover-tabs" role="tablist" aria-label="Index">{WATCH_INDICES.map(item => <button key={item.id} type="button" role="tab" aria-selected={index === item.id} onClick={() => setIndex(item.id)}>{item.label}</button>)}</div>
    <div className="home-watch-sort" role="group" aria-label="Sort">{sorts.map(item => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}</div>
    {ordered.length ? <div className="home-watch-list">{ordered.map(row => <button key={row.symbol} type="button" onClick={() => onOpen(row.symbol)} aria-label={`Open ${row.symbol} chart`}>
      <StockLogo symbol={row.symbol} size={28} />
      <span><b>{row.symbol}</b><small>{row.name} · Vol {volumeLabel(row.volume)}{row.high !== null && row.low !== null ? ` · H ${price.format(row.high)} L ${price.format(row.low)}` : ""}</small></span>
      <span><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{row.change > 0 ? "+" : ""}{row.change.toFixed(2)}%</em></span>
    </button>)}</div> : <div className="india-pulse-wait">{rows || failed ? "No names in this index right now" : "Loading equity market watch"}</div>}
  </section>;
}
