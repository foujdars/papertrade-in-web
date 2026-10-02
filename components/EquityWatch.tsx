"use client";
import { ArrowUp, ArrowDown, ChartNoAxesColumnIncreasing, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { sortWatch, volumeLabel, WATCH_INDICES, type WatchIndexId, type WatchQuote, type WatchSort } from "@/lib/equity-watch";
import { StockLogo } from "@/components/StockLogo";
import { useTransientBack } from "./useTransientBack";

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
  useTransientBack(open, () => setOpen(false));
  const [niftyBreadth, setNiftyBreadth] = useState<WatchQuote[] | null>(null);
  const [bankBreadth, setBankBreadth] = useState<WatchQuote[] | null>(null);
  const [itBreadth, setItBreadth] = useState<WatchQuote[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const pull = (indexId: string, apply: (rows: WatchQuote[]) => void) => {
      fetch(`/api/market/equity-watch?index=${indexId}`, { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => { if (body?.ok && Array.isArray(body.rows)) apply(body.rows); })
        .catch(() => undefined);
    };
    const load = () => { pull("nifty50", setNiftyBreadth); pull("bank", setBankBreadth); pull("it", setItBreadth); };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
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
  const breadthLine = (label: string, quotes: WatchQuote[] | null) => {
    const rising = quotes?.filter(row => row.change > 0).length ?? 0;
    const falling = quotes?.filter(row => row.change < 0).length ?? 0;
    const total = quotes?.length ?? 0;
    return <span className="home-breadth-preview" key={label} aria-label={total ? `${label}: ${rising} rising, ${falling} falling, ${total - rising - falling} unchanged` : `${label}: awaiting quotes`}>
      <b>{label}</b><span className="home-breadth-counts">{total ? <><em className="up"><ArrowUp size={12} aria-hidden="true"/>{rising}</em><em className="down"><ArrowDown size={12} aria-hidden="true"/>{falling}</em></> : <em>—</em>}</span>
      <span className="home-breadth-meter" aria-hidden="true">{total > 0 && <><i className="rising" style={{width:`${rising / total * 100}%`}}/><i className="unchanged" style={{width:`${(total - rising - falling) / total * 100}%`}}/><i className="falling" style={{width:`${falling / total * 100}%`}}/></>}</span>
    </span>;
  };
  const niftyRising = niftyBreadth?.filter(row => row.change > 0).length ?? 0;
  const niftyFalling = niftyBreadth?.filter(row => row.change < 0).length ?? 0;
  return <div id="equity-watch" className="home-market-slot">
    <button type="button" className="home-market-card home-market-card-v2" data-kind="equity" onClick={() => setOpen(true)} aria-label={niftyBreadth ? `Open equity market. Nifty 50 ${niftyRising} rising, ${niftyFalling} falling` : "Open equity market"}>
      <span className="home-market-card-copy"><span className="home-market-card-title"><ChartNoAxesColumnIncreasing size={17} aria-hidden="true"/><b>Equity market watch</b></span><ChevronRight size={17} aria-hidden="true" /></span>
      <span className="home-market-subtitle">Constituent breadth</span>
      <span className="home-breadth-previews">{breadthLine("Nifty 50", niftyBreadth)}{breadthLine("Bank Nifty", bankBreadth)}{breadthLine("IT", itBreadth)}</span>
    </button>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close equity market" onClick={() => setOpen(false)} />
      <div className="home-side-sheet home-market-sheet" role="dialog" aria-modal="true" aria-label="Equity market watch">
        <header><span><small>Equity market</small><b>{title}</b></span><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="home-mover-tabs" role="tablist" aria-label="Index">{WATCH_INDICES.map(item => <button key={item.id} type="button" role="tab" aria-selected={index === item.id} onClick={() => setIndex(item.id)}>{item.label}</button>)}</div>
        <div className="home-watch-sort" role="group" aria-label="Sort">{sorts.map(item => <button key={item.id} type="button" aria-pressed={sort === item.id} onClick={() => setSort(item.id)}>{item.label}</button>)}</div>
        {ordered.length ? <div className="home-pair-list">{ordered.map(row => <button key={row.symbol} type="button" className="home-pair-row" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
          <StockLogo symbol={row.symbol} size={28} />
          <span className="home-pair-name"><b>{row.symbol}</b><small>{row.name}</small><small className="home-pair-vol">{row.volume > 0 ? `Vol ${volumeLabel(row.volume)}` : "—"}</small></span>
          <span className="home-pair-quote"><strong>{price.format(row.price)}</strong><em className={row.change < 0 ? "down" : "up"}>{percent(row.change)}</em></span>
        </button>)}</div> : <div className="india-pulse-wait">{rows || failed ? "No names in this index right now" : "Loading equity market watch"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </div>;
}
