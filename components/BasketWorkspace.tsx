"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChartLine, Check, Crosshair, Layers2, List, Minus, Plus, Trash2, X } from "lucide-react";
import { basketPayoff, legPrice, presetLegs, priceBasket, selectBasketLeg, type BasketLeg, type BasketPreset, type BasketSide, type PricedLeg } from "@/lib/option-basket";
import type { PremiumSource, SpreadChain, StrategyContract } from "@/lib/vertical-spread";
import { OptionChainTable } from "./OptionChainTable";
import { StrategyPresetPicker } from "./StrategyPresetPicker";
import { BasketPayoff } from "./BasketPayoff";
import { AppDialog } from "./AppDialog";
import { formatFuturesExpiry } from "@/lib/listed-futures";
import { useOptionDesk, type BasketOrder } from "./OptionDeskContext";

const views = [{ id: "chain", label: "Chain", icon: List }, { id: "basket", label: "Contracts", icon: Layers2 }, { id: "payoff", label: "Payoff", icon: ChartLine }] as const;
export type BasketDraft = { legs: BasketLeg[]; source: PremiumSource; multiplier: string };

export function BasketWorkspace({ chain, currency, market, root, rootLabel, expiry, expiryAt, asOf, initialContract, initialStrike, initialKind, dataReady, draft, onDraft }: {
  chain: SpreadChain; currency: "USD" | "INR"; market: BasketOrder["market"]; root: string; rootLabel: string; expiry: string;
  expiryAt?: number; asOf: number; initialContract?: string; initialStrike?: number; initialKind?: "CE" | "PE"; dataReady: boolean;
  draft?: BasketDraft; onDraft: (draft: BasketDraft) => void;
}) {
  const desk = useOptionDesk();
  const id = useId();
  const seed = chain.contracts.find(c => initialContract ? c.id === initialContract : c.strike === initialStrike && c.kind === initialKind);
  const [state, setState] = useState<BasketDraft>(() => draft ?? {
    legs: seed?.multiplier ? selectBasketLeg([], seed.id, "BUY") : [], source: "market", multiplier: "1",
  });
  const { legs, source, multiplier } = state;
  const [view, setView] = useState<(typeof views)[number]["id"]>("chain");
  const [atmJump, setAtmJump] = useState(0);
  const [detail, setDetail] = useState<"prices" | "metrics">("prices");
  const [futurePicker, setFuturePicker] = useState(false);
  const [review, setReview] = useState<PricedLeg[] | null>(null);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [requiredFunds, setRequiredFunds] = useState(0);
  const submitting = useRef(false);
  const futureTrigger = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const futures = useMemo(() => chain.futures ?? (chain.future ? [chain.future] : []), [chain.futures, chain.future]);
  const byId = useMemo(() => {
    const items = new Map<string, StrategyContract>(chain.contracts.map(c => [c.id,c]));
    for (const future of futures) items.set(future.id, future);
    return items;
  }, [chain.contracts, futures]);
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const money = useMemo(() => new Intl.NumberFormat(locale, {style: "currency", currency, maximumFractionDigits: currency === "USD" ? 6 : 2}), [locale, currency]);
  const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }), [locale]);
  const label = (c: StrategyContract) => c.kind === "FUT" ? c.symbol : number.format(c.strike) + (c.kind === "CE" ? " Call" : " Put");
  const selected = legs.filter(leg => leg.enabled !== false);

  function edit(change: Partial<BasketDraft>) {
    if (submitting.current) return;
    const next = { ...state, ...change };
    setState(next);
    onDraft(next);
    setReview(null);
    setNotice("");
    setError("");
  }
  function update(id: string, change: Partial<BasketLeg>) {
    edit({ legs: legs.map(leg => leg.id === id ? {...leg, ...change} : leg) });
  }
  function add(contract: StrategyContract, side: BasketSide) {
    const next = selectBasketLeg(legs, contract.id, side);
    edit({legs: next.map(leg => leg.id === contract.id ? { ...leg, enabled: true,
      manual: leg.manual || String((side === "BUY" ? contract.ask : contract.bid) ?? contract.last ?? "") } : leg)});
  }
  function applyPreset(id: BasketPreset) {
    edit({ legs: presetLegs(chain.contracts, id, seed?.strike ?? chain.reference, source), multiplier: "1" });
    setView("basket");
  }
  function changeSource(next: PremiumSource) {
    const updated = legs.map(leg => {
      const contract = byId.get(leg.id);
      if (!contract || next !== "manual" || leg.manual) return leg;
      return { ...leg, manual: String(legPrice(leg,contract,source) ?? contract.last ?? "") };
    });
    edit({source: next, legs: updated});
  }
  let result: ReturnType<typeof basketPayoff> | undefined;
  let priced: PricedLeg[] = [];
  let issue = "";
  if (selected.length) {
    try {
      priced = priceBasket(legs, byId, source, Number(multiplier));
      result = basketPayoff(priced);
    } catch (reason) { issue = (reason as Error).message; }
  }
  const orderable = !!desk && !!result && source === "market" && dataReady && !sending && !checking;
  const balance = desk?.available[currency];
  async function beginReview() {
    if (!desk || !orderable || submitting.current) return;
    submitting.current = true;
    setChecking(true);
    setError("");
    try {
      setRequiredFunds(await desk.reviewBasket({market, root, rootLabel, expiry, legs: priced}));
      setReview(priced);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check the paper basket.");
    } finally {
      submitting.current = false;
      setChecking(false);
    }
  }
  async function confirm() {
    if (!desk || !review || !orderable || submitting.current) return;
    submitting.current = true;
    setSending(true);
    setError("");
    try {
      await desk.placeBasket({market, root, rootLabel, expiry, legs: review});
      const filled = new Set(review.map(leg => leg.contract.id));
      const next = {...state, legs: legs.filter(leg => !filled.has(leg.id))};
      setState(next);
      onDraft(next);
      setNotice(`${review.length} paper order${review.length === 1 ? "" : "s"} filled.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The paper basket could not be filled.");
    } finally {
      setReview(null);
      submitting.current = false;
      setSending(false);
    }
  }

  return <div className="basket-desk" data-view={view}>
    <div className="desk-actions">
      <StrategyPresetPicker underlying={rootLabel} expiry={expiry} hasLegs={!!legs.length} disabled={sending || checking} onApply={applyPreset}/>
      <button className="desk-add-future" type="button" ref={futureTrigger} disabled={sending} aria-haspopup="dialog" onClick={() => setFuturePicker(true)}>
        <Plus size={15}/>Add futures</button>
    </div>
    <nav className="basket-views" aria-label="Strategy builder views">{views.map(({id, label, icon: Icon}) =>
      <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}><Icon size={15}/>{label}{id === "basket" && <b>{selected.length}</b>}</button>)}</nav>
    <section className="spread-card basket-chain" aria-label="Strategy option chain">
      <div className="desk-card-head"><div><h2>Option chain</h2><small className="desk-count">{new Set(chain.contracts.map(c => c.strike)).size} listed strikes</small></div>
        <button type="button" className="desk-filter" disabled={chain.reference === null} onClick={() => setAtmJump(value => value + 1)}><Crosshair size={15}/>Jump to ATM</button></div>
      <div className="desk-chain-tools"><div className="desk-toggle" role="group" aria-label="Chain data">
        <button type="button" aria-pressed={detail === "prices"} onClick={() => setDetail("prices")}>Prices</button>
        <button type="button" aria-pressed={detail === "metrics"} onClick={() => setDetail("metrics")}>Greeks &amp; OI</button></div>
        <span>{currency} per unit</span></div>
      {initialContract && !seed && <p className="spread-message">The chart contract is no longer in this chain.</p>}
      <OptionChainTable contracts={chain.contracts} reference={chain.reference} currency={currency} legs={selected} atmJump={atmJump} focusAtm
        selected={seed?.id} focusStrike={initialStrike ?? seed?.strike} onSide={add} allowUnquoted={source !== "market"} detail={detail}/>
    </section>
    <div className="desk-analysis">
    <div className="desk-analysis-scroll">
    <section className="spread-card basket-selection" aria-label="Strategy contracts">
      <div className="desk-card-head"><h2>Strategy contracts</h2><span className="desk-count">{selected.length} / {legs.length} selected</span></div>
      <div className="desk-contract-controls"><label className="desk-check">
        <input type="checkbox" aria-label="Select all contracts" disabled={!legs.length || sending} checked={!!legs.length && selected.length === legs.length}
          ref={input => { if (input) input.indeterminate = selected.length > 0 && selected.length < legs.length; }}
          onChange={e => edit({ legs: legs.map(leg => ({...leg, enabled: e.target.checked})) })}/>Select all</label>
        <div className="desk-multiplier"><span>Multiplier</span><button type="button" aria-label="Decrease strategy multiplier" disabled={sending || Number(multiplier) <= 1}
          onClick={() => edit({multiplier: String(Math.max(1, Number(multiplier)-1))})}><Minus size={13}/></button>
          <input type="number" aria-label="Strategy multiplier" min={1} max={100000} step={1} value={multiplier} disabled={sending} onChange={e => edit({multiplier:e.target.value})}/>
          <button type="button" aria-label="Increase strategy multiplier" disabled={sending || Number(multiplier) >= 100000}
            onClick={() => edit({multiplier: String(Math.min(100000, Number(multiplier)+1))})}><Plus size={13}/></button></div></div>
      {!legs.length && <div className="desk-empty"><Layers2 size={25}/><strong>Build your strategy</strong><p>Pick Buy or Sell on the chain, or choose a pre-built strategy.</p></div>}
      <div className="desk-legs">{legs.map(leg => {
        const c = byId.get(leg.id), name = c ? label(c) : leg.id;
        const price = c ? legPrice(leg,c,source) : null;
        return <div key={leg.id} className="desk-leg" data-enabled={leg.enabled !== false}>
          <label className="desk-check"><input id={id+leg.id} type="checkbox" checked={leg.enabled !== false} aria-label={"Include " + name} disabled={sending || checking} onChange={e => update(leg.id,{enabled:e.target.checked})}/></label>
          <label className="desk-leg-contract" htmlFor={id+leg.id}><strong>{name}</strong><small>{c?.kind === "FUT" ? formatFuturesExpiry(c.futureExpiry) : rootLabel} · {c?.multiplier ? number.format(c.multiplier) + " / lot" : "Lot unavailable"}</small></label>
          <button type="button" className="desk-side" data-side={leg.side} aria-label={"Change side for " + name} disabled={sending}
            onClick={() => update(leg.id, {side: leg.side === "BUY" ? "SELL" : "BUY"})}>{leg.side === "BUY" ? "Buy" : "Sell"}</button>
          <label className="desk-lots">Lots<input aria-label={"Lots for " + name} type="number" min={1} max={100000} step={1} disabled={sending} value={leg.lots} onChange={e => update(leg.id,{lots:e.target.value})}/></label>
          <button type="button" className="desk-remove" disabled={sending} aria-label={"Remove " + name} onClick={() => edit({legs:legs.filter(item => item.id !== leg.id)})}><Trash2 size={15}/></button>
          <div className="desk-leg-price">{source === "manual" ? <label>Entry price <input aria-label={"Entry price for " + name} type="number" min={0} step="any" value={leg.manual} disabled={sending} onChange={e => update(leg.id,{manual:e.target.value})}/></label> :
            <span>{source === "last" ? "LTP" : leg.side === "BUY" ? "Ask" : "Bid"} <strong>{price === null ? "—" : money.format(price)}</strong></span>}</div>
        </div>;
      })}</div>
      <div className="desk-pricing"><label>Entry prices<select value={source} disabled={sending} onChange={e => changeSource(e.target.value as PremiumSource)}>
        <option value="market">Market · ask / bid</option><option value="last">Last traded price</option><option value="manual">Manual entry</option>
      </select></label>{result && <div><small>Net option {result.debit < 0 ? "credit" : "debit"}</small><strong>{money.format(Math.abs(result.debit))}</strong></div>}</div>
    </section>
    <section className="spread-card basket-payoff" aria-label="Strategy payoff">
      <div className="desk-card-head"><h2>Strategy payoff</h2><span className="desk-count">{currency} · before fees</span></div>
      {result ? <BasketPayoff result={result} legs={priced} contracts={chain.contracts} money={money} reference={chain.reference} asOf={asOf} expiryAt={expiryAt}/> :
        <div className="desk-empty"><ChartLine size={26}/><strong>{issue ? "Check selected legs" : "Payoff preview"}</strong><p>{issue || "Select contracts to see the payoff curve, scenarios, and Greeks."}</p></div>}
    </section>
    </div>
    <footer className="desk-order">
      {(error || notice || issue) && <p className="desk-order-message" role={error ? "alert" : "status"}>{error || notice || issue}</p>}
      {!!selected.length && (source !== "market" || !dataReady) && <p className="desk-order-message">{source !== "market" ? "Switch entry prices to Market to place paper orders." : "Refresh the chain for market pricing."}</p>}
      {review && <div className="basket-confirm" aria-label="Confirm paper orders">
        <strong>Review {rootLabel} · {expiry.slice(0,10)}</strong>
        {review.map(l => <div key={l.contract.id}><span>{l.side === "BUY" ? "Buy" : "Sell"} {l.lots} × {label(l.contract)}</span><b>{money.format(l.premium)}</b></div>)}
        <div><span>Est. funds {requiredFunds < 0 ? "released" : "required"} incl. fees</span><b>{money.format(Math.abs(requiredFunds))}</b></div>
        <small>Each leg must fill at its reviewed price or better. Paper fees apply.</small>
      </div>}
      <div className="desk-order-row"><div><small>Available paper funds</small><strong>{balance == null ? "—" : money.format(balance)}</strong></div>
        {review && <button type="button" disabled={sending} onClick={() => setReview(null)}>Back</button>}
        <button type="button" className="basket-primary" disabled={!orderable} onClick={() => {
          if (review) void confirm(); else void beginReview();
        }}>{sending ? "Placing…" : checking ? "Checking quotes…" : review ? "Place paper basket" : "Review paper basket"}</button></div>
    </footer>
    </div>
    {futurePicker && <AppDialog className="desk-future-dialog" label="Add futures contract" containEscape returnFocus={futureTrigger} onClose={() => setFuturePicker(false)}>
      <div className="desk-card-head"><h2>Add futures contract</h2><button type="button" aria-label="Close futures picker" className="desk-remove" onClick={() => setFuturePicker(false)}><X size={18}/></button></div>
      {futures.length ? <div className="desk-future-list">{futures.map(future => <div key={future.id}><div className="desk-future-name"><strong>{future.symbol}</strong><small>{formatFuturesExpiry(future.futureExpiry)} · {number.format(future.multiplier!)} / lot</small></div>
        <div className="desk-future-quotes">{(["BUY","SELL"] as const).map(side => {
          const quote = side === "BUY" ? future.ask : future.bid;
          const existing = legs.find(leg => leg.id === future.id);
          const active = existing?.side === side && existing.enabled !== false;
          return <button type="button" key={side} data-side={side} aria-label={`${side === "BUY" ? "Buy" : "Sell"} future ${future.symbol}`} aria-pressed={active} disabled={source === "market" && quote === null && !active}
            onClick={() => {
              if (existing) update(future.id,{side,enabled:true}); else add(future,side);
              setFuturePicker(false); setView("basket");
            }}>
            <span>{active && <Check size={14}/>} {side === "BUY" ? "Buy future" : "Sell future"}</span><strong>{quote === null ? "—" : money.format(quote)}</strong></button>;
        })}</div></div>)}</div> : <p>No matching futures contract is listed for this underlying and expiry.</p>}
    </AppDialog>}
  </div>;
}
