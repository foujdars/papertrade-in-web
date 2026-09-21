"use client";
import "./global-order-ticket.css";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ModernSelect } from "./ModernSelect";
import type { GlobalTrading } from "./useGlobalTrading";
import type { GlobalTicketTab } from "./GlobalOrderTicket";
import { availablePerpCash } from "@/lib/global-markets";
import { formatUsd } from "@/lib/global-order-engine";
import { cancelOptionLimit, closeOption, executeOption, freshOptionQuote, optionFee, optionMargin, optionPnl, placeOptionLimit } from "@/lib/global-option-orders";

const number = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 8 });
export function GlobalOptionTicket({ symbol, side, onSide, trading, tab, onTab }: {
  symbol: string;
  side: "BUY" | "SELL";
  onSide: (side: "BUY" | "SELL") => void;
  trading: GlobalTrading;
  tab: GlobalTicketTab;
  onTab: (tab: GlobalTicketTab) => void;
}) {
  const { account, optionSnapshots, clock, busy, error, transact } = trading;
  const snapshot = optionSnapshots[symbol], spec = snapshot?.spec, quote = snapshot?.quote;
  const [type, setType] = useState<"Market" | "Limit">("Market");
  const [size, setSize] = useState("1"), [unit, setUnit] = useState<"lots" | "asset" | "USD">("lots");
  const [limit, setLimit] = useState(""), [leverage, setLeverage] = useState("1");
  const [notice, setNotice] = useState(""), [localError, setLocalError] = useState("");
  const [closeLots, setCloseLots] = useState<Record<string, string>>({});
  const position = account?.optionPositions?.find(item => item.symbol === symbol);
  const reduces = !!position && position.side !== side;
  const price = type === "Limit" ? Number(limit) : side === "BUY" ? quote?.ask ?? 0 : quote?.bid ?? 0;
  const rawSize = Number(size);
  const lots = spec && Number.isFinite(rawSize) && rawSize > 0 && price > 0
    ? unit === "lots" ? rawSize : unit === "asset" ? rawSize / spec.lot : rawSize / (spec.lot * price)
    : 0;
  const contracts = unit === "USD" ? Math.floor(lots + 1e-9) : Math.round(lots);
  const validSize = Number.isSafeInteger(contracts) && contracts > 0 && (unit === "USD" || Math.abs(lots - contracts) < 1e-7);
  const usedLeverage = side === "BUY" && !reduces ? 1 : Number(leverage);
  const margin = spec && quote && validSize && !reduces ? optionMargin(spec, quote, side, contracts, price, usedLeverage) : 0;
  const fee = spec && quote && validSize && price > 0 ? optionFee(spec, quote, price, contracts) : 0;
  const available = account ? availablePerpCash(account) : 0;
  const fresh = !!spec?.operational && freshOptionQuote(quote, clock) && clock < spec.expiry && clock - spec.fetchedAt < 3600000;
  const name = spec?.contractType === "call_options" ? "Call" : "Put";
  const chooseUnit = (next: "lots" | "asset" | "USD") => {
    const count = validSize ? contracts : 1;
    setUnit(next);
    setSize(String(next === "lots" ? count : next === "asset" ? Number((count * (spec?.lot ?? 0)).toFixed(8)) : Number((count * (spec?.lot ?? 0) * price).toFixed(2))));
  };
  const submit = async () => {
    setNotice(""); setLocalError("");
    try {
      if (!account || !spec || !quote || !fresh) throw new Error("Waiting for live Delta option data.");
      if (!validSize) throw new Error(`Enter whole lots or an asset amount in ${spec.lot} increments.`);
      if (reduces && contracts > position!.contracts) throw new Error("Close lots exceed your position.");
      const accepted = await transact((current, _perps, options) => {
        const live = options[symbol];
        if (!live) throw new Error("Fresh option data is unavailable.");
        return type === "Market"
          ? executeOption(current, live.spec, live.quote, side, contracts, usedLeverage, Date.now())
          : placeOptionLimit(current, live.spec, live.quote, side, contracts, usedLeverage, Number(limit), Date.now());
      });
      if (accepted) { setNotice(`${type} option paper order accepted · ${contracts} lot${contracts === 1 ? "" : "s"}`); onTab(type === "Market" ? "Positions" : "Open orders"); }
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : "Option order could not be placed."); }
  };
  return <div className="global-ticket">
    <div className="ticket-heading"><div><span className="eyebrow">Global · USD · option paper trade</span><h2>{symbol}</h2></div><span className="paper-badge">Paper trading</span></div>
    <nav className="global-ticket-tabs" aria-label="Global option trading">{(["Order", "Positions", "Open orders", "History"] as const).map(next => <button key={next} type="button" aria-pressed={tab === next} onClick={() => onTab(next)}>{next}{next === "Positions" ? ` ${account?.optionPositions?.length ?? 0}` : next === "Open orders" ? ` ${account?.optionOrders?.length ?? 0}` : ""}</button>)}</nav>
    <div className="global-wallet-line"><span>Available USD</span><b>{account ? formatUsd(available) : "Loading…"}</b></div>
    {tab === "Order" && <>
      <div className="global-quote-strip"><span>Bid <b>{quote ? formatUsd(quote.bid) : "—"}</b></span><span>Ask <b>{quote ? formatUsd(quote.ask) : "—"}</b></span><span>Mark <b>{quote ? formatUsd(quote.mark) : "—"}</b></span></div>
      {spec && <div className="global-funding"><span>{spec.underlying} {name} · Strike {formatUsd(spec.strike)}</span><span>Expires {new Date(spec.expiry).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST</span></div>}
      <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => onSide("BUY")}>Buy {name}</button><button className={side === "SELL" ? "sell-active" : ""} onClick={() => onSide("SELL")}>Sell {name}</button></div>
      <div className="global-ticket-grid"><ModernSelect label="Order type" value={type} choices={[{ value: "Market", label: "Market" }, { value: "Limit", label: "Limit" }]} onChange={setType} />
        {side === "SELL" && !reduces ? <label>Paper collateral leverage · max 10×<input inputMode="numeric" value={leverage} onChange={event => setLeverage(event.target.value)} /></label> : <div className="global-wallet-line"><span>{reduces ? "Closing open position" : "Buying option"}</span><b>{reduces ? "Reduce only" : "Full premium reserved"}</b></div>}</div>
      {type === "Limit" && <label>Limit premium (USD)<input inputMode="decimal" value={limit} placeholder={quote ? String(side === "BUY" ? quote.ask : quote.bid) : "Premium"} onChange={event => setLimit(event.target.value)} /></label>}
      <div className="global-size-card"><div className="global-ticket-grid"><label>Order size<input aria-label="Option order size" inputMode={unit === "lots" ? "numeric" : "decimal"} value={size} onChange={event => setSize(event.target.value)} /></label><ModernSelect label="Size in" value={unit} choices={[{ value: "lots", label: "Lots" }, { value: "asset", label: spec?.underlying ?? "Asset" }, { value: "USD", label: "USD premium" }]} onChange={chooseUnit} /></div><div className="global-size-caption"><span>{number(contracts * (spec?.lot ?? 0))} {spec?.underlying ?? "asset"} · {contracts} lots</span><span>1 lot = {spec?.lot ?? "—"} {spec?.underlying ?? "asset"}</span></div></div>
      <div className="margin-card"><div><span>Option premium</span><b>{Number.isFinite(price * contracts * (spec?.lot ?? 0)) ? formatUsd(price * contracts * (spec?.lot ?? 0)) : "—"}</b></div><div><span>{reduces ? "New collateral" : side === "BUY" ? "Full premium reserved" : "Estimated collateral"}</span><b>{Number.isFinite(margin) ? formatUsd(margin) : "—"}</b></div><div><span>Estimated fee incl. tax</span><b>{formatUsd(fee)}</b></div><div><span>Available</span><b>{formatUsd(available)}</b></div></div>
      <p className="global-ticket-footnote">Short-option collateral is a conservative paper estimate, not Delta’s portfolio margin. Expiry uses Delta’s published settlement price when available.</p>
      <button className={`place-order ${side.toLowerCase()}`} disabled={busy || !account || !fresh || !validSize || !Number.isSafeInteger(usedLeverage) || usedLeverage < 1 || usedLeverage > 10 || (!reduces && margin + fee > available)} onClick={submit}>{busy ? "Saving…" : !fresh ? "Waiting for live Delta data" : `${side === "BUY" ? "Buy" : "Sell"} ${contracts} option lot${contracts === 1 ? "" : "s"}`}<ChevronRight size={17} /></button>
    </>}
    {tab === "Positions" && <div className="global-account-list">{!account?.optionPositions?.length && <p className="global-empty">Your option positions will appear here.</p>}{account?.optionPositions?.map(item => { const currentQuote = optionSnapshots[item.symbol]?.quote; const live = freshOptionQuote(currentQuote, clock); const pnl = currentQuote ? optionPnl(item, currentQuote.mark) : 0; return <article key={item.symbol}><header><b>{item.symbol} · {item.side === "BUY" ? "Bought" : "Sold"}</b><span>{item.contracts} lots</span></header><strong className={pnl >= 0 ? "positive" : "negative"}>{currentQuote ? formatUsd(pnl) : "—"}<small> {live ? "Unrealised" : "Last available"}</small></strong><div className="global-exit-preview"><span>Entry premium <b>{formatUsd(item.entry)}</b></span><span>Reserved <b>{formatUsd(item.margin)}</b></span><span>Expiry <b>{new Date(item.spec.expiry).toLocaleDateString("en-IN")}</b></span></div><div className="global-ticket-grid"><label>Close lots<input inputMode="numeric" value={closeLots[item.symbol] ?? String(item.contracts)} onChange={event => setCloseLots(value => ({ ...value, [item.symbol]: event.target.value }))} /></label><button className="global-secondary" disabled={busy || !live || clock >= item.spec.expiry} onClick={async () => { const count = Number(closeLots[item.symbol] ?? item.contracts); const accepted = await transact((current, _perps, options) => { const latest = options[item.symbol]; if (!latest) throw new Error("Fresh option quote unavailable."); return closeOption(current, item.symbol, latest.quote, count, Date.now()); }); if (accepted) setNotice("Option position reduced at the observed Delta quote."); }}>Close / reduce</button></div>{clock >= item.spec.expiry && <small>Expired · waiting for Delta’s published settlement price.</small>}</article>; })}</div>}
    {tab === "Open orders" && <div className="global-account-list">{!account?.optionOrders?.length && <p className="global-empty">No pending option orders.</p>}{account?.optionOrders?.map(item => <article key={item.id}><header><b>{item.symbol} · {item.side === "BUY" ? "Buy" : "Sell"}</b><span>Limit</span></header><p>{item.contracts} lots · {formatUsd(item.limit)} premium</p><div className="global-wallet-line"><span>Reserved {formatUsd(item.reserve)}</span><button className="global-text-button" disabled={busy} onClick={() => void transact(current => cancelOptionLimit(current, item.id, Date.now()))}>Cancel</button></div></article>)}</div>}
    {tab === "History" && <div className="global-account-list"><div className="global-wallet-line"><span>Shared USD wallet</span><b>{account ? formatUsd(account.wallet) : "—"}</b></div>{!account?.optionEvents?.length && <p className="global-empty">Option fills and settlements appear here.</p>}{account?.optionEvents?.slice().reverse().slice(0, 100).map(item => <article key={item.id}><header><b>{item.symbol} · {item.kind}</b><span>{formatUsd(item.pnl - item.fee)}</span></header><p>{item.contracts} lots · {formatUsd(item.price)}</p><small>{item.detail} · fee {formatUsd(item.fee)}</small></article>)}</div>}
    {notice && <p className="global-ticket-notice" role="status">{notice}</p>}
    {(localError || error) && <p role="alert" className="global-ticket-error">{localError || error}</p>}
    <p className="global-ticket-footnote">USD paper wallet · no real exchange orders. Pending orders and exits are checked while the app is open; expiry is reconciled only from Delta’s official settlement data.</p>
  </div>;
}
