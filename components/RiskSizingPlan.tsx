"use client";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { ConfidenceControl, StrategyPicker } from "@/components/TradePlanControls";
import { formatInr } from "@/lib/market";

type Props = {
  open: boolean; onToggle: () => void; maxRisk: string; onMaxRiskChange: (value: string) => void;
  suggestedQuantity: number; onApply: () => void; risk: number; reward: number; ratio: number;
  strategy: string; onStrategyChange: (value: string) => void;
  confidence: number; onConfidenceChange: (value: number) => void;
  thesis: string; onThesisChange: (value: string) => void;
};
export function RiskSizingPlan(props: Props) {
  return <section className={`ticket-risk-sizing ${props.open ? "open" : ""}`}>
    <button type="button" className="ticket-section-trigger" aria-expanded={props.open} onClick={props.onToggle}><span><ShieldCheck size={16} /><b>Risk sizing &amp; trade plan</b></span><ChevronDown size={16} /></button>
    {props.open && <div className="ticket-risk-body">
      <div className="ticket-risk-grid"><label>Maximum loss (₹)<input type="number" inputMode="decimal" min="1" step="100" value={props.maxRisk} onChange={(event) => props.onMaxRiskChange(event.target.value)} /></label><div><span>Suggested quantity</span><b>{props.suggestedQuantity || "—"}</b><button type="button" disabled={!props.suggestedQuantity} onClick={props.onApply}>Apply</button></div></div>
      <div className="ticket-risk-summary"><span>Risk<b className="negative">{Number.isFinite(props.risk) ? formatInr(props.risk) : "Set SL"}</b></span><span>Potential reward<b className="positive">{Number.isFinite(props.reward) ? formatInr(props.reward) : "Set TP"}</b></span><span>Reward : risk<b>{props.ratio ? `${props.ratio.toFixed(2)} : 1` : "—"}</b></span></div>
      <div className="ticket-plan-grid"><StrategyPicker value={props.strategy} onChange={props.onStrategyChange} /><ConfidenceControl value={props.confidence} onChange={props.onConfidenceChange} /><label className="wide">Entry reason<textarea value={props.thesis} onChange={(event) => props.onThesisChange(event.target.value)} placeholder="Your setup and invalidation" /></label></div>
    </div>}
  </section>;
}
