"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Layers2, X } from "lucide-react";
import { volatilityPresets, type BasketPreset } from "@/lib/option-basket";
import { SPREADS } from "@/lib/vertical-spread";
import { AppDialog } from "./AppDialog";

const groups = [
  { name: "Vertical spreads", presets: ["bullCall", "bearPut", "bullPut", "bearCall"] },
  { name: "Volatility strategies", presets: ["straddle", "strangle", "condor"] },
] as const;

const rise = "3,28 17,28 40,8 56,8";
const fall = "3,8 17,8 40,28 56,28";
const cards = {
  bullCall: { ...SPREADS.bullCall, outlook: "Moderate rise", shape: rise },
  bearPut: { ...SPREADS.bearPut, outlook: "Moderate fall", shape: fall },
  bullPut: { ...SPREADS.bullPut, outlook: "Steady or rising", shape: rise },
  bearCall: { ...SPREADS.bearCall, outlook: "Steady or falling", shape: fall },
  straddle: { label: volatilityPresets.straddle, flow: "Debit", outlook: "Large move either way", shape: "3,5 29,29 56,5" },
  strangle: { label: volatilityPresets.strangle, flow: "Debit", outlook: "Move beyond two strikes", shape: "3,6 21,28 37,28 56,6" },
  condor: { label: volatilityPresets.condor, flow: "Credit", outlook: "Range-bound market", shape: "3,28 12,28 22,9 37,9 47,28 56,28" },
} satisfies Record<BasketPreset, { label: string; flow: string; outlook: string; shape: string }>;

export function StrategyPresetPicker({ underlying, expiry, hasLegs, disabled, onApply }: {
  underlying: string; expiry: string; hasLegs: boolean; disabled: boolean; onApply: (preset: BasketPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const date = new Date(expiry.slice(0, 10) + "T00:00:00Z");
  const expiryLabel = Number.isNaN(date.getTime()) ? expiry : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  function choose(preset: BasketPreset) {
    try {
      onApply(preset);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This strategy cannot be built from the listed strikes.");
    }
  }

  return <>
    <button type="button" className="desk-preset" ref={trigger} disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setError(""); setOpen(true); }}><Layers2 size={16}/>Pre-built strategies<ChevronDown size={14}/></button>
    {open && <AppDialog className="desk-preset-dialog" labelledBy={id} returnFocus={trigger} containEscape onClose={() => setOpen(false)}>
      <header className="preset-heading">
        <div><h2 id={id}>Pre-built strategies</h2><p>{underlying}<span aria-hidden="true"> · </span>{expiryLabel}</p></div>
        <button type="button" className="preset-close" aria-label="Close pre-built strategies" onClick={() => setOpen(false)}><X size={19}/></button>
      </header>
      <div className="preset-list">
        {groups.map(group => <section key={group.name} aria-label={group.name}>
          <h3>{group.name}</h3>
          <div className="preset-cards">{group.presets.map(key => {
            const card = cards[key];
            return <button key={key} type="button" className="preset-card" onClick={() => choose(key)}>
              <svg className="preset-shape" viewBox="0 0 60 36" aria-hidden="true" focusable="false">
                <defs><linearGradient id={id + key} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2="38">
                  <stop offset="50%" stopColor="var(--spread-gain)"/><stop offset="50%" stopColor="var(--spread-loss)"/>
                </linearGradient></defs>
                <path d="M3 19H57" className="preset-axis"/><polyline points={card.shape} stroke={`url(#${id}${key})`}/>
              </svg>
              <span className="preset-copy"><strong>{card.label}</strong><small>{card.outlook} · {key === "condor" ? 4 : 2} legs</small></span>
              <span className="preset-flow">{card.flow}</span><ChevronRight className="preset-arrow" size={15} aria-hidden="true"/>
            </button>;
          })}</div>
        </section>)}
      </div>
      {error ? <p className="preset-note" role="alert">{error}</p> : hasLegs && <p className="preset-note">Choosing a strategy replaces the contracts in this draft.</p>}
    </AppDialog>}
  </>;
}
