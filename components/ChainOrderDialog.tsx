"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { useOptionDesk, type BasketOrder } from "./OptionDeskContext";

export function ChainOrderDialog({order, onClose}: {order: BasketOrder; onClose: () => void}) {
  const desk = useOptionDesk(), leg = order.legs[0];
  const [lots,setLots] = useState("1"), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const pending = useRef(false);
  const valid = Number.isSafeInteger(Number(lots)) && Number(lots) >= 1 && Number(lots) <= 100_000;
  const fmt = new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"});
  return <AppDialog className="chain-order-dialog" label="Paper option order" avoidTouchKeyboard containEscape onClose={() => { if (!pending.current) onClose(); }}>
    <div className="basket-title"><h2>{leg.side === "BUY" ? "Buy" : "Sell"} {order.rootLabel}</h2><button type="button" className="spread-close" aria-label="Close order" disabled={busy} onClick={onClose}><X size={16}/></button></div>
    <p>{leg.contract.strike.toLocaleString("en-IN")} {leg.contract.kind === "CE" ? "Call" : "Put"} · {order.expiry.slice(0,10)}</p>
    <div className="basket-total"><span>{leg.side === "BUY" ? "Maximum buy price" : "Minimum sell price"}</span><strong>{fmt.format(leg.premium)}</strong></div>
    <label>Lots<input type="number" min="1" max="100000" step="1" value={lots} disabled={busy} onChange={e=>setLots(e.target.value)}/></label>
    <p>{valid ? (Number(lots) * leg.contract.multiplier!).toLocaleString("en-IN") + " units" : "Enter whole lots."}</p>
    {error && <p role="alert">{error}</p>}
    <button className="basket-primary" disabled={!desk || !valid || busy} onClick={async () => {
      if (pending.current || !desk) return;
      pending.current = true; setBusy(true); setError("");
      try { await desk.placeBasket({...order, legs:[{...leg,lots:Number(lots)}]}); onClose(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Paper order could not be filled."); }
      finally { pending.current = false; setBusy(false); }
    }}>{busy ? "Placing…" : leg.side === "BUY" ? "Place paper buy" : "Place paper sell"}</button>
  </AppDialog>;
}
