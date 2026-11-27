"use client";

import { useMemo, useRef, useState } from "react";
import { ChartLine, Layers2, List, Trash2 } from "lucide-react";
import { basketPayoff, selectBasketLeg, type BasketLeg, type BasketSide, type PricedLeg } from "@/lib/option-basket";
import { initialStrikes, SPREADS, type PremiumSource, type SpreadChain, type SpreadContract, type SpreadId } from "@/lib/vertical-spread";
import { OptionChainTable } from "./OptionChainTable";
import { BasketPayoff } from "./BasketPayoff";
import { useOptionDesk, type BasketOrder } from "./OptionDeskContext";

const views = [{ id: "chain", label: "Chain", icon: List }, { id: "basket", label: "Basket", icon: Layers2 }, { id: "payoff", label: "Payoff", icon: ChartLine }] as const;

export function BasketWorkspace({ chain, currency, market, root, rootLabel, expiry, initialStrike, initialKind, dataReady }: {
  chain: SpreadChain; currency: "USD" | "INR"; market: BasketOrder["market"]; root: string; rootLabel: string; expiry: string;
  initialStrike?: number; initialKind?: "CE" | "PE"; dataReady: boolean;
}) {
  const desk = useOptionDesk();
  const [legs, setLegs] = useState<BasketLeg[]>([]);
  const [source, setSource] = useState<PremiumSource>("market");
  const [view, setView] = useState<(typeof views)[number]["id"]>("chain");
  const [all, setAll] = useState(false);
  const [review, setReview] = useState<PricedLeg[] | null>(null);
  const [sending, setSending] = useState(false);
  const submitting = useRef(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map(chain.contracts.map(contract => [contract.id, contract])), [chain.contracts]);
  const money = useMemo(() => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {style: "currency", currency, maximumFractionDigits: currency === "USD" ? 6 : 2}), [currency]);
  const strike = useMemo(() => new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {maximumFractionDigits: 6}), [currency]);
  const seed = initialStrike ? chain.contracts.find(c => c.strike === initialStrike && c.kind === initialKind) : undefined;
  const label = (c: SpreadContract) => strike.format(c.strike) + (c.kind === "CE" ? " Call" : " Put");
  const price = (leg: BasketLeg, contract?: SpreadContract) => {
    if (!contract) return null;
    if (source === "manual") return leg.manual.trim() ? Number(leg.manual) : null;
    return source === "last" ? contract.last : leg.side === "BUY" ? contract.ask : contract.bid;
  };

  function edit(next: BasketLeg[]) {
    if (submitting.current) return;
    setLegs(next); setReview(null); setNotice(""); setError("");
  }
  function add(c: SpreadContract, side: BasketSide) {
    const next = selectBasketLeg(legs, c.id, side);
    edit(source === "manual" ? next.map(leg => leg.id === c.id && !leg.manual
      ? {...leg, manual: String((side === "BUY" ? c.ask : c.bid) ?? c.last ?? "")} : leg) : next);
  }
  function applyPreset(id: string) {
    if (!(id in SPREADS)) return;
    const {buy, sell} = initialStrikes(chain.contracts, id as SpreadId, initialStrike ?? chain.reference, source);
    if (!buy || !sell) { setError("Two matching strikes are required for this spread."); return; }
    edit(([{id: buy, side: "BUY"}, {id: sell, side: "SELL"}] as const).map(leg => {
      const c = byId.get(leg.id)!;
      return {...leg, lots: "1", manual: String((leg.side === "BUY" ? c.ask : c.bid) ?? c.last ?? "")};
    }));
  }
  function changeSource(next: PremiumSource) {
    if (next === "manual") edit(legs.map(leg => ({...leg, manual: leg.manual || String(price(leg, byId.get(leg.id)) ?? byId.get(leg.id)?.last ?? "")})));
    else edit(legs);
    setSource(next);
  }

  let result: ReturnType<typeof basketPayoff> | undefined;
  const priced: PricedLeg[] = [];
  let message = "";
  if (legs.length) {
    try {
      for (const leg of legs) {
        const contract = byId.get(leg.id), premium = price(leg, contract);
        if (!contract) throw new Error("A selected contract is no longer listed. Remove it to continue.");
        if (premium === null) throw new Error("A selected leg has no premium. Choose another strike or change the pricing source.");
        priced.push({contract, side: leg.side, lots: Number(leg.lots), premium});
      }
      result = basketPayoff(priced);
    } catch (reason) { message = (reason as Error).message; }
  }
  const orderable = !!desk && !!result && source === "market" && dataReady && !sending;
  const buy = priced.find(leg => leg.side === "BUY"), sell = priced.find(leg => leg.side === "SELL");
  const preset = priced.length === 2 && buy && sell && buy.contract.kind === sell.contract.kind && buy.lots === sell.lots &&
    buy.contract.multiplier === sell.contract.multiplier ? Object.values(SPREADS).find(p => p.kind === buy.contract.kind && p.buyLower === (buy.contract.strike < sell.contract.strike)) : undefined;
  async function confirm() {
    if (!desk || !review || !orderable || submitting.current) return;
    submitting.current = true; setSending(true); setError("");
    try {
      await desk.placeBasket({market, root, rootLabel, expiry, legs: review});
      setNotice(review.length + (review.length === 1 ? " paper order filled." : " paper orders filled."));
      setLegs([]); setReview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The paper basket could not be filled."); setReview(null);
    } finally { submitting.current = false; setSending(false); }
  }
  return <div className="basket-desk" data-view={view}>
    <nav className="basket-views" aria-label="Strategy builder views">{views.map(({id, label, icon: Icon}) =>
      <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}><Icon size={16}/>{label}{id === "basket" && <b>{legs.length}</b>}</button>)}</nav>
    <section className="spread-card basket-chain" aria-label="Strategy option chain">
      <div className="basket-title"><h2>Option chain</h2><button type="button" aria-pressed={all} onClick={() => setAll(!all)}>{all ? "Near ATM" : "All strikes"}</button></div>
      <OptionChainTable contracts={chain.contracts} reference={chain.reference} currency={currency} legs={legs} nearby={!all} focusAtm={all}
        selected={seed?.id} focusStrike={seed?.strike} onSide={add} allowUnquoted={source !== "market"}/>
      {!!legs.length && <button className="basket-mobile-review" type="button" onClick={() => setView("basket")}>View basket ({legs.length})</button>}
    </section>
    <section className="spread-card basket-selection" aria-label="Strategy basket">
      <div className="basket-title"><h2>{preset ? preset.label + " spread" : "Strategy basket"}</h2>
        <select aria-label="Apply spread preset" value="" disabled={sending} onChange={e => applyPreset(e.target.value)}>
          <option value="">Spread presets</option>
          {(["Debit", "Credit"] as const).map(flow => <optgroup key={flow} label={flow + " spreads"}>
            {Object.entries(SPREADS).filter(([,p]) => p.flow === flow).map(([id,p]) => <option key={id} value={id}>{p.label} · {flow.toLowerCase()}</option>)}
          </optgroup>)}
        </select>
      </div>
      <label className="basket-pricing">Premium source<select value={source} disabled={sending} onChange={e => changeSource(e.target.value as PremiumSource)}>
        <option value="market">Buy at ask · Sell at bid</option><option value="last">Last traded price</option><option value="manual">Manual premium</option>
      </select></label>
      {!legs.length && <p className="spread-empty">Choose B or S on the chain, or apply a spread preset.</p>}
      {!!legs.length && <div className="basket-legs">{legs.map(leg => {
        const c = byId.get(leg.id), premium = price(leg,c);
        return <div key={leg.id} className="basket-leg">
          <div className="basket-leg-name"><b data-side={leg.side}>{leg.side === "BUY" ? "Buy" : "Sell"}</b><strong>{c ? label(c) : leg.id}</strong></div>
          <label>Lots<input disabled={sending} type="number" min="1" max="100000" step="1" value={leg.lots} onChange={e => edit(legs.map(item => item === leg ? {...item,lots:e.target.value} : item))}/></label>
          {source === "manual" ? <label>Premium<input disabled={sending} type="number" min="0" step="any" value={leg.manual} onChange={e => edit(legs.map(item => item === leg ? {...item,manual:e.target.value} : item))}/></label>
            : <div className="basket-leg-price"><small>{source === "last" ? "LTP" : leg.side === "BUY" ? "Ask" : "Bid"}</small><strong>{premium === null ? "—" : money.format(premium)}</strong></div>}
          <button type="button" className="basket-remove" disabled={sending} aria-label={"Remove " + (c ? label(c) : leg.id)} onClick={() => edit(legs.filter(item => item.id !== leg.id))}><Trash2 size={15}/></button>
        </div>;
      })}</div>}
      {result && <div className="basket-total"><span>Net {result.debit < 0 ? "credit" : "debit"}</span><strong>{money.format(Math.abs(result.debit))}</strong></div>}
      {message && <p role="status" className="spread-message">{message}</p>}
      {desk && legs.length > 0 && !review && <button className="basket-primary" type="button" disabled={!orderable} onClick={() => { setReview(priced); setError(""); }}>Review paper basket</button>}
      {review && <div className="basket-confirm" aria-label="Confirm paper orders">
        <strong>Review {rootLabel} · {expiry.slice(0,10)}</strong>
        {review.map(l => <div key={l.contract.id}><span>{l.side === "BUY" ? "Buy" : "Sell"} {l.lots} × {label(l.contract)}</span><b>{money.format(l.premium)}</b></div>)}
        <small>Fills require fresh quotes at these prices or better. Fees apply.</small>
        <div><button disabled={sending} onClick={() => setReview(null)}>Back</button><button className="basket-primary" disabled={!orderable} onClick={confirm}>{sending ? "Placing…" : "Place paper basket"}</button></div>
      </div>}
      {(notice || error) && <p className="spread-message" role={error ? "alert" : "status"}>{error || notice}</p>}
    </section>
    <section className="spread-card basket-payoff" aria-label="Expiry payoff"><h2>Expiry payoff</h2>
      {result ? <BasketPayoff result={result} money={money} reference={chain.reference}/> : <p className="spread-empty">{message || "Add a leg to see the expiry payoff."}</p>}
    </section>
  </div>;
}
