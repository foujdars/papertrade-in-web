"use client";
import "./global-order-ticket.css";
import { useEffect, useState } from "react";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { ModernSelect } from "./ModernSelect";
import type { GlobalTrading } from "./useGlobalTrading";
import {
  affordableContracts, formatUsd, GLOBAL_ORDER_TYPES, needsLimit, needsTrigger,
  roundGlobalPrice, setGlobalProtection, sizeToContracts, submitGlobalOrder,
  type GlobalExit, type GlobalOrderType, type GlobalProtection, type SizeUnit, type TriggerSource,
} from "@/lib/global-order-engine";
import {
  availablePerpCash, cancelPerpOrder, closePerp, freshPerpQuote, liquidationPrice,
  marginRate, positionPnl, tradingFee, type PerpSpec, type PerpSymbol,
} from "@/lib/global-markets";

export type GlobalTicketTab = "Order" | "Positions" | "Open orders" | "History";
type ExitInput = { mode: "Market" | "Limit" | "Trail"; value: string; limit: string; unit: "USD" | "%" };
const blankExit = (): ExitInput => ({ mode: "Market", value: "", limit: "", unit: "USD" });
const assetName = (s: PerpSymbol) => s.endsWith("USD") ? s.slice(0, -3) : s;
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });
const options = <T extends string>(values: readonly T[]) => values.map(value => ({ value, label: value }));
function exitFromInput(input: ExitInput, target: boolean, entry: number, side: "BUY" | "SELL", spec: PerpSpec): GlobalExit | undefined {
  if (!input.value.trim()) return undefined;
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a positive TP/SL value.");
  const direction = (side === "BUY" ? 1 : -1) * (target ? 1 : -1);
  if (input.mode === "Trail") return { mode: "Trail", trail: roundGlobalPrice(input.unit === "%" ? entry * value / 100 : value, spec) };
  return { mode: input.mode, trigger: roundGlobalPrice(input.unit === "%" ? entry * (1 + direction * value / 100) : value, spec), limit: input.mode === "Limit" ? Number(input.limit) : undefined };
}
function ExitEditor({ title, value, onChange, allowTrail }: { title: string; value: ExitInput; onChange: (v: ExitInput) => void; allowTrail?: boolean }) {
  return <fieldset className="global-exit-editor"><legend>{title}</legend>
    <div className="global-ticket-grid"><ModernSelect label={`${title} execution`} value={value.mode} choices={options(allowTrail ? ["Market", "Limit", "Trail"] as const : ["Market", "Limit"] as const)} onChange={mode => onChange({ ...value, mode })} />
      <ModernSelect label={`${title} input`} value={value.unit} choices={[{ value: "USD", label: "USD price" }, { value: "%", label: "% from entry" }]} onChange={unit => onChange({ ...value, unit, value: "" })} /></div>
    <label>{value.mode === "Trail" ? `Trail distance (${value.unit})` : value.unit === "%" ? "Distance from entry (%)" : "Trigger price (USD)"}<input inputMode="decimal" value={value.value} placeholder="Optional" onChange={e => onChange({ ...value, value: e.target.value })} /></label>
    {value.mode === "Limit" && <label>Exit limit price (USD)<input inputMode="decimal" value={value.limit} onChange={e => onChange({ ...value, limit: e.target.value })} placeholder="Limit price" /></label>}
  </fieldset>;
}

export function GlobalOrderTicket({ symbol, owner, side, onSide, trading, tab, onTab }: {
  symbol: PerpSymbol; owner: string; side: "BUY" | "SELL"; onSide: (side: "BUY" | "SELL") => void;
  trading: GlobalTrading; tab: GlobalTicketTab; onTab: (tab: GlobalTicketTab) => void;
}) {
  const { account, snapshots, clock, busy, error, transact } = trading;
  const snapshot = snapshots[symbol], spec = snapshot?.spec, quote = snapshot?.quote;
  const [type, setType] = useState<GlobalOrderType>("Market");
  const [unit, setUnit] = useState<SizeUnit>("lots");
  const [size, setSize] = useState("1"), [leverage, setLeverage] = useState("5");
  const [limit, setLimit] = useState(""), [trigger, setTrigger] = useState(""), [trail, setTrail] = useState("");
  const [source, setSource] = useState<TriggerSource>("mark");
  const [reduceOnly, setReduceOnly] = useState(false), [protectionOn, setProtectionOn] = useState(false);
  const [tp, setTp] = useState<ExitInput>(blankExit), [sl, setSl] = useState<ExitInput>(blankExit);
  const [notice, setNotice] = useState(""), [localError, setLocalError] = useState("");
  const [closeSize, setCloseSize] = useState<Record<string, string>>({});
  const defaultsKey = `papertrade-global-exits:${owner}:${symbol}`;
  useEffect(() => {
    setSize("1"); setUnit("lots"); setLimit(""); setTrigger(""); setTrail(""); setReduceOnly(false); setNotice(""); setLocalError("");
    setTp(blankExit()); setSl(blankExit()); setProtectionOn(false); setSource("mark");
    try {
      const saved = JSON.parse(localStorage.getItem(defaultsKey) ?? "null");
      if (saved && ["mark", "last", "index"].includes(saved.source)) {
        const valid = (v: ExitInput) => v && ["Market", "Limit", "Trail"].includes(v.mode) && ["USD", "%"].includes(v.unit) && typeof v.value === "string" && typeof v.limit === "string";
        if (valid(saved.tp) && valid(saved.sl)) { setTp(saved.tp); setSl(saved.sl); setSource(saved.source); setProtectionOn(saved.enabled === true); }
      }
    } catch { /* Invalid optional preferences do not affect the wallet. */ }
  }, [defaultsKey]);
  const marketPrice = quote ? side === "BUY" ? quote.ask : quote.bid : 0;
  const entry = needsLimit(type) ? Number(limit) : needsTrigger(type) ? Number(trigger) : marketPrice;
  let contracts = 0, sizingError = "";
  try { if (spec) contracts = sizeToContracts(Number(size), unit, spec, entry); } catch (e) { sizingError = (e as Error).message; }
  const position = account?.positions.find(p => p.symbol === symbol);
  const notional = contracts * (spec?.lot ?? 0) * entry;
  const rate = spec ? marginRate(spec, ((position?.contracts ?? 0) + contracts) * spec.lot * entry) : 1;
  const maxLeverage = Math.max(1, Math.floor(1 / rate));
  const margin = reduceOnly ? 0 : Math.max(notional / Number(leverage), ((position?.contracts ?? 0) * (spec?.lot ?? 0) * entry + notional) / Number(leverage) - (position?.margin ?? 0));
  const fee = spec ? tradingFee(spec, notional, type === "Maker only", "USD") : 0;
  const available = account ? availablePerpCash(account) : 0;
  const fresh = !!spec?.operational && freshPerpQuote(quote, clock) && clock - spec.fetchedAt <= 3600000;
  const makePlan = (): GlobalProtection | undefined => protectionOn && !reduceOnly && spec ? { source, takeProfit: exitFromInput(tp, true, entry, side, spec), stopLoss: exitFromInput(sl, false, entry, side, spec) } : undefined;
  let preview: GlobalProtection | undefined;
  try { preview = makePlan(); } catch { /* Validation appears on submit. */ }
  const fillPercent = (percent: number) => {
    if (!account || !spec || !entry) return;
    const count = reduceOnly ? Math.floor((position?.side !== side ? position?.contracts ?? 0 : 0) * percent) : affordableContracts(account, spec, entry, Number(leverage), percent);
    setUnit("lots"); setSize(String(count)); setLocalError("");
  };
  const submit = async () => {
    setNotice(""); setLocalError("");
    try {
      if (!spec || !quote || !account) throw new Error("Waiting for global wallet and quotes.");
      if (sizingError) throw new Error(sizingError);
      const protection = makePlan();
      const ok = await transact((a, data) => {
        const live = data[symbol];
        if (!live) throw new Error("Fresh market data is unavailable.");
        return submitGlobalOrder(a, live.spec, live.quote, { type, side, contracts, leverage: Number(leverage), limit: needsLimit(type) ? Number(limit) : undefined, trigger: needsTrigger(type) ? Number(trigger) : undefined, trail: type === "Trailing stop" ? Number(trail) : undefined, source, reduceOnly, protection }, Date.now());
      });
      if (ok) { setNotice(`${type} paper order accepted · ${contracts} lot${contracts === 1 ? "" : "s"}`); onTab(type === "Market" ? "Positions" : "Open orders"); }
    } catch (e) { setLocalError(e instanceof Error ? e.message : "Check the order fields."); }
  };
  const countdown = spec && clock ? Math.ceil(((spec.fundingSeconds * 1000) - clock % (spec.fundingSeconds * 1000)) / 1000) : 0;
  const fundingTime = [Math.floor(countdown / 3600), Math.floor(countdown % 3600 / 60), countdown % 60].map(v => String(v).padStart(2, "0")).join(":");
  return <div className="global-ticket">
    <div className="ticket-heading"><div><span className="eyebrow">Global · USD · isolated</span><h2>{symbol}</h2></div><span className="paper-badge">Paper trading</span></div>
    <nav className="global-ticket-tabs" aria-label="Global trading">{(["Order", "Positions", "Open orders", "History"] as const).map(t => <button key={t} type="button" aria-pressed={tab === t} onClick={() => onTab(t)}>{t}{t === "Positions" ? ` ${account?.positions.length ?? 0}` : t === "Open orders" ? ` ${account?.orders.length ?? 0}` : ""}</button>)}</nav>
    <div className="global-wallet-line"><span>Available USD</span><b>{account ? formatUsd(available) : "Loading…"}</b></div>
    {tab === "Order" && <>
      <div className="global-quote-strip"><span>Bid <b>{quote ? formatUsd(quote.bid) : "—"}</b></span><span>Ask <b>{quote ? formatUsd(quote.ask) : "—"}</b></span><span>Mark <b>{quote ? formatUsd(quote.mark) : "—"}</b></span></div>
      <div className="global-funding"><span>Funding {spec ? `(${spec.fundingSeconds / 3600}h)` : ""} <b>{quote ? `${(quote.funding * 100).toFixed(4)}%` : "—"}</b></span><span>{fundingTime}</span></div>
      <div className="side-switch"><button className={side === "BUY" ? "buy-active" : ""} onClick={() => onSide("BUY")}>Long</button><button className={side === "SELL" ? "sell-active" : ""} onClick={() => onSide("SELL")}>Short</button></div>
      <div className="global-ticket-grid"><label>Leverage · max {maxLeverage}×<div className="global-number-suffix"><input aria-label="Global leverage" inputMode="decimal" value={leverage} onChange={e => setLeverage(e.target.value)} /><span>×</span></div></label>
        <ModernSelect label="Order type" value={type} choices={options(GLOBAL_ORDER_TYPES)} onChange={value => { setType(value); setNotice(""); }} /></div>
      <div className="global-percent-row" aria-label="Leverage presets">{[1, 5, 10, 25, 50, 100, 200].filter(v => v <= maxLeverage).map(v => <button key={v} aria-pressed={Number(leverage) === v} onClick={() => setLeverage(String(v))}>{v}×</button>)}</div>
      {needsLimit(type) && <label>Limit price (USD)<input inputMode="decimal" value={limit} placeholder={marketPrice ? String(marketPrice) : "Price"} onChange={e => setLimit(e.target.value)} /></label>}
      {(needsTrigger(type) || type === "Trailing stop") && <div className="global-ticket-grid"><label>{type === "Trailing stop" ? "Trail distance (USD)" : "Trigger price (USD)"}<input inputMode="decimal" value={type === "Trailing stop" ? trail : trigger} onChange={e => type === "Trailing stop" ? setTrail(e.target.value) : setTrigger(e.target.value)} /></label><ModernSelect label="Trigger source" value={source} choices={[{ value: "mark", label: "Mark price" }, { value: "last", label: "Last price" }, { value: "index", label: "Index price" }]} onChange={setSource} /></div>}
      <div className="global-size-card"><div className="global-ticket-grid"><label>Order size<input aria-label="Global order size" inputMode={unit === "lots" ? "numeric" : "decimal"} value={size} onChange={e => setSize(e.target.value)} /></label><ModernSelect label="Size in" value={unit} choices={[{ value: "lots", label: "Lots" }, { value: "USD", label: "USD notional" }, { value: "asset", label: assetName(symbol) }]} onChange={next => { const count = contracts || 1; setUnit(next); setSize(String(next === "lots" ? count : next === "asset" ? Number((count * (spec?.lot ?? 0)).toFixed(8)) : Number((count * (spec?.lot ?? 0) * entry).toFixed(2)))); }} /></div>
        <div className="global-size-caption"><span>{number(contracts * (spec?.lot ?? 0))} {assetName(symbol)} · {contracts} lots</span><span>1 lot = {spec?.lot ?? "—"} {assetName(symbol)}</span></div>
        <div className="global-percent-row">{[25, 50, 75, 100].map(p => <button key={p} onClick={() => fillPercent(p / 100)}>{p}%</button>)}</div>
        {unit === "USD" && <small>USD is position value. Rounded down to whole lots; margin is shown below.</small>}
        {sizingError && <small role="alert" className="negative">{sizingError}</small>}
      </div>
      <label className="global-check"><input type="checkbox" checked={reduceOnly} onChange={e => setReduceOnly(e.target.checked)} /><span>Reduce only <small>Close or reduce; never reverse a position.</small></span></label>
      {!reduceOnly && <details className="global-protection" open={protectionOn} onToggle={e => setProtectionOn(e.currentTarget.open)}><summary><SlidersHorizontal size={16} /> Take profit / Stop loss <span>{protectionOn ? "−" : "+"}</span></summary>
        <ModernSelect label="TP/SL trigger source" value={source} choices={[{ value: "mark", label: "Mark price" }, { value: "last", label: "Last price" }, { value: "index", label: "Index price" }]} onChange={setSource} />
        <ExitEditor title="Take profit" value={tp} onChange={setTp} /><ExitEditor title="Stop loss" value={sl} onChange={setSl} allowTrail />
        <div className="global-exit-preview">{preview?.takeProfit?.trigger && <span>Target <b>{formatUsd(preview.takeProfit.trigger)}</b></span>}{preview?.stopLoss?.trigger && <span>Stop <b>{formatUsd(preview.stopLoss.trigger)}</b></span>}{preview?.takeProfit?.trigger && <span>Est. target P&amp;L <b>{formatUsd((preview.takeProfit.trigger - entry) * contracts * (spec?.lot ?? 0) * (side === "BUY" ? 1 : -1))}</b></span>}{preview?.stopLoss?.trigger && <span>Est. stop P&amp;L <b>{formatUsd((preview.stopLoss.trigger - entry) * contracts * (spec?.lot ?? 0) * (side === "BUY" ? 1 : -1))}</b></span>}</div>
        <small>Exit P&amp;L excludes fees and funding. Limit exits can remain unfilled.</small>
        <button className="global-text-button" onClick={() => { try { localStorage.setItem(defaultsKey, JSON.stringify({ tp, sl, source, enabled: true })); setNotice("TP/SL defaults saved for this instrument."); } catch { setLocalError("Could not save defaults."); } }}>Save as default</button>
        {position && <button className="global-text-button" disabled={busy || !fresh} onClick={async () => { try { const plan = makePlan(); const ok = await transact((a, data) => setGlobalProtection(a, symbol, plan, data[symbol]!.quote, Date.now())); if (ok) setNotice("TP/SL updated for the whole open position."); } catch (e) { setLocalError((e as Error).message); } }}>Apply to open position</button>}
      </details>}
      <div className="margin-card"><div><span>Position value</span><b>{Number.isFinite(notional) ? formatUsd(notional) : "—"}</b></div><div><span>Required margin</span><b>{Number.isFinite(margin) ? formatUsd(margin) : "—"}</b></div><div><span>Est. fee incl. tax</span><b>{Number.isFinite(fee) ? formatUsd(fee) : "—"}</b></div><div><span>Available</span><b>{formatUsd(available)}</b></div></div>
      {!reduceOnly && margin + fee > available && <p className="global-ticket-error">Insufficient available USD balance.</p>}
      <button className={`place-order ${side.toLowerCase()}`} disabled={busy || !account || !fresh || contracts < 1 || !!sizingError || (!reduceOnly && (margin + fee > available || Number(leverage) > maxLeverage || account.fundingGap))} onClick={submit}>{busy ? "Saving…" : !fresh ? "Waiting for live Delta data" : `${reduceOnly ? "Reduce" : side === "BUY" ? "Long" : "Short"} ${contracts} lot${contracts === 1 ? "" : "s"}`}<ChevronRight size={17} /></button>
    </>}
    {tab === "Positions" && <div className="global-account-list">{!account?.positions.length && <p className="global-empty">Your global positions will appear here.</p>}{account?.positions.map(p => {
      const q = snapshots[p.symbol]?.quote, live = freshPerpQuote(q, clock), pnl = q ? positionPnl(p, q.mark) : 0;
      return <article key={p.symbol}><header><b>{p.symbol} · {p.side === "BUY" ? "Long" : "Short"}</b><span>{p.leverage}×</span></header><strong className={pnl >= 0 ? "positive" : "negative"}>{q ? formatUsd(pnl) : "—"}<small> {live ? "Unrealised" : "Last available"}</small></strong>
        <div className="global-exit-preview"><span>Size <b>{number(p.contracts * p.spec.lot)} {assetName(p.symbol)}</b></span><span>Entry <b>{formatUsd(p.entry)}</b></span><span>Margin <b>{formatUsd(p.margin)}</b></span><span>Est. liquidation <b>{formatUsd(liquidationPrice(p))}</b></span></div>
        {p.protection && <small>TP: {p.protection.takeProfit ? `${p.protection.takeProfit.mode} ${formatUsd(p.protection.takeProfit.trigger ?? 0)}` : "—"} · SL: {p.protection.stopLoss ? `${p.protection.stopLoss.mode} ${formatUsd(p.protection.stopLoss.trigger ?? p.protection.stopLoss.trail ?? 0)}` : "—"}{p.protection.activeExit ? " · exit triggered" : ""}</small>}
        <div className="global-ticket-grid"><label>Close lots<input inputMode="numeric" value={closeSize[p.symbol] ?? String(p.contracts)} onChange={e => setCloseSize(v => ({ ...v, [p.symbol]: e.target.value }))} /></label><button className="global-secondary" disabled={busy || !live} onClick={async () => { const ok = await transact((a, data) => closePerp(a, p.symbol, data[p.symbol]!.quote, Number(closeSize[p.symbol] ?? p.contracts), Date.now())); if (ok) setNotice("Position reduced at observed bid/ask."); }}>Close / reduce</button></div>
        {p.protection && <button className="global-text-button" disabled={busy || !live} onClick={() => void transact((a, data) => setGlobalProtection(a, p.symbol, undefined, data[p.symbol]!.quote, Date.now()))}>Remove TP/SL</button>}
      </article>;
    })}</div>}
    {tab === "Open orders" && <div className="global-account-list">{!account?.orders.length && <p className="global-empty">No pending global orders.</p>}{account?.orders.map(o => <article key={o.id}><header><b>{o.symbol} · {o.side === "BUY" ? "Long" : "Short"}</b><span>{o.type ?? "Limit"}</span></header><p>{o.contracts} lots · {o.leverage}×{o.reduceOnly ? " · reduce only" : ""}</p><small>{o.trigger ? `Trigger ${formatUsd(o.trigger)} · ` : ""}{needsLimit(o.type ?? "Limit") ? `Limit ${formatUsd(o.limit)} · ` : ""}{o.triggered ? "Triggered · awaiting fill" : "Pending"}</small><div className="global-wallet-line"><span>Reserved {formatUsd(o.reserve)}</span><button className="global-text-button" disabled={busy} onClick={() => void transact(a => cancelPerpOrder(a, o.id, Date.now()))}>Cancel</button></div></article>)}</div>}
    {tab === "History" && <div className="global-account-list"><div className="global-wallet-line"><span>Wallet balance</span><b>{account ? formatUsd(account.wallet) : "—"}</b></div>{!account?.events.length && <p className="global-empty">Your fills, fees and funding appear here.</p>}{account?.events.slice().reverse().slice(0, 100).map(e => <article key={e.id}><header><b>{e.symbol} · {e.kind}</b><span>{formatUsd(e.pnl - e.fee)}</span></header><p>{e.contracts} lots · {formatUsd(e.price)}</p><small>{e.detail} · fee {formatUsd(e.fee)}</small><time>{new Date(e.at).toLocaleString()}</time></article>)}</div>}
    {notice && <p className="global-ticket-notice" role="status"><Check size={16} />{notice}</p>}
    {(localError || error) && <p role="alert" className="global-ticket-error">{localError || error}</p>}
    {account?.fundingGap && <p className="global-ticket-error">A funding interval was missed while the app was closed. New exposure is paused; reducing and closing remain available.</p>}
    <p className="global-ticket-footnote">USD paper wallet · isolated margin. Orders and exits are monitored while the app is open with live data. No real exchange orders.</p>
  </div>;
}
