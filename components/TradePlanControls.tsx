"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useRef } from "react";

export const TRADE_STRATEGIES = ["Breakout", "Pullback", "Reversal", "Trend", "Support / resistance", "News", "Other"];

export function StrategyPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const id = useId();
  return <div className="plan-control">
    <span id={id}>Strategy</span>
    <details className="plan-picker" ref={ref}>
      <summary aria-labelledby={id}><span>{value}</span><ChevronDown size={16} /></summary>
      <div className="plan-picker-options" role="group" aria-label="Choose strategy">
        {TRADE_STRATEGIES.map((strategy) => <button type="button" key={strategy} aria-pressed={value === strategy} onClick={() => { onChange(strategy); if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } }}>{strategy}{value === strategy && <Check size={16} />}</button>)}
      </div>
    </details>
  </div>;
}

export function ConfidenceControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="plan-control"><span>Confidence <small>{value}/5</small></span><div className="plan-confidence" role="group" aria-label="Confidence">
    {[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} aria-label={`Confidence ${rating} of 5`} aria-pressed={value === rating} onClick={() => onChange(rating)}>{rating}</button>)}
  </div></div>;
}
