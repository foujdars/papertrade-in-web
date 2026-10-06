"use client";
import { Boxes, Handshake, ChevronDown, ChevronRight, ChevronUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dealValue, groupDeals, type Deal } from "@/lib/bulk-deals";
import { StockLogo } from "@/components/StockLogo";
import { useTransientBack } from "./useTransientBack";

const TABS = ["All", "Bulk", "Block"] as const;
const price = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function sessionLabel(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year.slice(2)}` : "Latest session";
}

export function BulkDeals({ onOpen }: { onOpen: (symbol: string) => void }) {
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [date, setDate] = useState("");
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [openSymbol, setOpenSymbol] = useState<string | null>(null);
  useTransientBack(open, () => setOpen(false));
  useTransientBack(open && openSymbol !== null, () => setOpenSymbol(null));
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/market/deals", { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => {
          if (!body?.ok || !Array.isArray(body.rows)) { setFailed(true); return; }
          setFailed(false);
          setDate(String(body.date || ""));
          setRows(body.rows);
        })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    };
    load();
    const timer = window.setInterval(load, 15 * 60 * 1000);
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
  const listed = rows ?? [];
  const visible = tab === "All" ? listed : listed.filter(row => row.kind === tab);
  const groups = groupDeals(visible);
  const bulk = listed.filter(row => row.kind === "Bulk").length;
  const block = listed.filter(row => row.kind === "Block").length;
  const logoKey = (isin: string) => isin ? `NSE_EQ|${isin}` : undefined;
  return <div className="home-deal-slot">
    <section className="home-section home-deals-summary" aria-label="Bulk and block deals">
      <header><span><b>Bulk &amp; Block Deals</b></span><small>{date ? sessionLabel(date) : "NSE · Latest session"}</small></header>
      <div className="home-deal-counts">{([['Bulk', bulk, Boxes], ['Block', block, Handshake]] as const).map(([kind, count, Icon]) => <button key={kind} type="button" className="home-market-card home-deal-count" onClick={() => { setTab(kind); setOpenSymbol(null); setOpen(true); }} aria-label={`Open ${kind.toLowerCase()} deals${rows ? `, ${count} deals` : ''}`}>
        <span className="home-deal-icon"><Icon size={21} aria-hidden="true" /></span><span><small>{kind} deals</small><b>{rows ? count.toLocaleString('en-IN') : '—'}</b></span><ChevronRight size={17} aria-hidden="true" />
      </button>)}</div>
      {(!rows || failed) && <small className="home-deal-meta" role="status">{failed ? rows ? "Update unavailable · showing last received session" : "Deals unavailable right now" : "Loading the latest NSE session"}</small>}
    </section>
    {open && typeof document !== "undefined" && createPortal(<>
      <button type="button" className="home-search-backdrop" aria-label="Close bulk and block deals" onClick={() => setOpen(false)} />
      <div className="home-side-sheet" role="dialog" aria-modal="true" aria-label="Bulk and block deals">
        <header><span><small>NSE large deals</small><b>{date ? sessionLabel(date) : "Bulk & block"}</b></span><button type="button" aria-label="Close" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="home-mover-tabs" role="tablist" aria-label="Deal type">{TABS.map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
        {groups.length ? <div className="home-pair-list">{groups.map(group => {
          const shown = openSymbol === group.symbol;
          return <section className="home-deal-group" key={group.symbol}>
            <div className="home-deal-symbol">
              <button type="button" onClick={() => { setOpen(false); onOpen(group.symbol); }} aria-label={`Open ${group.symbol} chart`}>
                <StockLogo symbol={group.symbol} instrumentKey={logoKey(group.isin)} size={28} />
                <span><b>{group.symbol}</b><small>{group.name}</small></span>
              </button>
              <button type="button" aria-expanded={shown} aria-label={shown ? `Hide ${group.symbol} deals` : `Show ${group.symbol} deals`} onClick={() => setOpenSymbol(shown ? null : group.symbol)}>{shown ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
            </div>
            {shown ? group.rows.map(row => <button key={`${row.client}:${row.side}:${row.kind}:${row.qty}:${row.price}`} type="button" className="home-deal-row" onClick={() => { setOpen(false); onOpen(row.symbol); }} aria-label={`Open ${row.symbol} chart`}>
              <span><b>{row.client}</b><small>{row.kind} {row.side}</small></span>
              <span><strong>{dealValue(row.value)}</strong><em className={row.side === "Buy" ? "up" : "down"}>{qty.format(row.qty)} @ {price.format(row.price)}</em></span>
            </button>) : null}
          </section>;
        })}</div> : <div className="india-pulse-wait">{!rows && failed ? "Deals unavailable right now" : rows ? "No deals on this list" : "Loading NSE deals"}</div>}
      </div>
    </>, document.querySelector(".terminal-shell") ?? document.body)}
  </div>;
}
