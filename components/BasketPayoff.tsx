"use client";

import { useState } from "react";
import type { basketPayoff } from "@/lib/option-basket";

export function BasketPayoff({ result, money, reference }: {
  result: ReturnType<typeof basketPayoff>; money: Intl.NumberFormat; reference: number | null;
}) {
  const [riskInput, setRisk] = useState<string>();
  const [targetInput, setTarget] = useState<string>();
  const [scenario, setScenario] = useState<number>();
  const { strikes, breakEvens, payoff, maxLoss, maxProfit } = result;
  const anchors = [...strikes, ...breakEvens];
  if (reference !== null) anchors.push(reference);
  const low = Math.min(...anchors), high = Math.max(...anchors);
  const padding = Math.max((high-low) * 0.35, high * 0.025, 0.000001);
  const start = Math.max(0, low-padding), end = high+padding;
  const points = [...new Set([start, ...strikes, ...breakEvens, end])].sort((a,b) => a-b);
  const shownValues = points.map(payoff);
  const defaultLevel = (limit: number, visible: number) => String(Number((Math.max(0, Number.isFinite(limit) ? limit : visible) / 2).toPrecision(4)));
  const stop = riskInput ?? defaultLevel(maxLoss, -Math.min(...shownValues));
  const target = targetInput ?? defaultLevel(maxProfit, Math.max(...shownValues));
  const risk = Number(stop), reward = Number(target);
  const validRisk = Number.isFinite(risk) && risk > 0 && risk <= maxLoss;
  const validReward = Number.isFinite(reward) && reward > 0 && reward <= maxProfit;
  const floor = Math.min(0, ...shownValues, validRisk ? -risk : 0);
  const ceiling = Math.max(0, ...shownValues, validReward ? reward : 0);
  const x = (value: number) => 68 + 392 * (value-start)/(end-start);
  const y = (value: number) => 10 + 130*(ceiling-value)/(ceiling-floor || 1);
  const price = Math.max(start,Math.min(end,scenario ?? reference ?? strikes[0]));
  const limitText = (value: number) => Number.isFinite(value) ? money.format(value) : "Unlimited";
  const currency = money.resolvedOptions().currency;
  const tick = new Intl.NumberFormat("en", {notation:"compact", maximumFractionDigits:2});
  return <>
    <dl className="spread-metrics">
      <div><dt>Max profit</dt><dd className="spread-up">{limitText(maxProfit)}</dd></div>
      <div><dt>Max loss</dt><dd className="spread-down">{limitText(maxLoss)}</dd></div>
      <div><dt>Break-even</dt><dd>{breakEvens.length ? breakEvens.map(v => money.format(v)).join(" / ") : "—"}</dd></div>
      <div><dt>Net {result.debit < 0 ? "credit" : "debit"}</dt><dd>{money.format(Math.abs(result.debit))}</dd></div>
    </dl>
    <figure className="spread-chart">
      <svg viewBox="0 0 480 155" role="img" aria-label="Estimated profit and loss at expiry across settlement prices">
        {[...new Set([ceiling,0,floor])].map(v => <text key={v} className="spread-chart-tick" x="62" y={y(v)+4} textAnchor="end">{tick.format(v)}</text>)}
        {points.slice(1).map((right,i) => {
          const left = points[i], a = payoff(left), z = payoff(right), positive = payoff((left+right)/2) >= 0;
          return <g key={right}><polygon className={positive ? "spread-profit-zone" : "spread-loss-zone"} points={`${x(left)},${y(0)} ${x(left)},${y(a)} ${x(right)},${y(z)} ${x(right)},${y(0)}`}/>
            <line x1={x(left)} y1={y(a)} x2={x(right)} y2={y(z)} className={positive ? "spread-profit-line" : "spread-loss-line"}/></g>;
        })}
        <line x1={x(start)} x2={x(end)} y1={y(0)} y2={y(0)} className="spread-zero"/>
        {validRisk && <line x1={x(start)} x2={x(end)} y1={y(-risk)} y2={y(-risk)} className="spread-stop-line"/>}
        {validReward && <line x1={x(start)} x2={x(end)} y1={y(reward)} y2={y(reward)} className="spread-target-line"/>}
        {breakEvens.map(value => <circle key={value} cx={x(value)} cy={y(0)} r="3" className="spread-break-even"/>)}
        <line x1={x(price)} x2={x(price)} y1="5" y2="146" className="spread-marker"/>
        <circle cx={x(price)} cy={y(payoff(price))} r="4" className="spread-point"/>
      </svg>
      <div className="spread-chart-axis"><span>{money.format(start)}</span><span>{money.format(end)}</span></div>
      <label>Settlement price <strong>{money.format(price)}</strong><input type="range" min={start} max={end} step={(end-start)/250} value={price}
        aria-valuetext={money.format(price)} onChange={e => setScenario(Number(e.target.value))}/></label>
      <figcaption>Expiry P&amp;L before fees <strong className={payoff(price) >= 0 ? "spread-up" : "spread-down"}>{money.format(payoff(price))}</strong></figcaption>
      <div className="spread-risk-plan">
        <label>Stop loss ({currency})<input type="number" step="any" min="0" value={stop} aria-invalid={!validRisk} onChange={e=>setRisk(e.target.value)}/></label>
        <label>Target ({currency})<input type="number" step="any" min="0" value={target} aria-invalid={!validReward} onChange={e=>setTarget(e.target.value)}/></label>
        <div><span>Risk / reward</span><strong>{validRisk && validReward ? "1 : " + Number((reward/risk).toFixed(2)) : "—"}</strong></div>
      </div>
      <p className="spread-hint">Planning levels only. {(!validRisk || !validReward) && "Use positive levels within the maximum loss and profit."}</p>
    </figure>
  </>;
}
