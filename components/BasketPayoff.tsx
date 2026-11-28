"use client";

import { useState } from "react";
import { ChartLine, ChevronDown } from "lucide-react";
import { legGreek, targetPayoff, type basketPayoff, type PricedLeg } from "@/lib/option-basket";
import type { Greek, SpreadContract } from "@/lib/vertical-spread";

const DAY = 86_400_000;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const greekFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });
const targetFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const views = ["P&L chart", "P&L table", "Greeks"] as const;
const greeks: Greek[] = ["delta","gamma","theta","vega"];

export function BasketPayoff({ result, legs, contracts, money, reference, asOf, expiryAt }: {
  result: ReturnType<typeof basketPayoff>; legs: PricedLeg[]; contracts: SpreadContract[]; money: Intl.NumberFormat;
  reference: number | null; asOf: number; expiryAt?: number;
}) {
  const [view, setView] = useState<(typeof views)[number]>("P&L chart");
  const [riskInput, setRisk] = useState<string>();
  const [targetInput, setTarget] = useState<string>();
  const [scenario, setScenario] = useState<number>();
  const [targetPercent, setTargetPercent] = useState(50);
  const [showOi, setShowOi] = useState(true);
  const { strikes, breakEvens, payoff, maxLoss, maxProfit } = result;
  const anchors = [...strikes, ...breakEvens];
  if (reference !== null) anchors.push(reference);
  const low = Math.min(...anchors), high = Math.max(...anchors);
  const padding = Math.max((high-low)*0.45, high*(high === low ? 0.035 : 0.003), 0.000001);
  const start = Math.max(0, low-padding), end = high+padding;
  const points = [...new Set([start, ...strikes, ...breakEvens, end])].sort((a,b) => a-b);
  const expiryValues = points.map(payoff);
  const price = Math.max(start,Math.min(end,scenario ?? reference ?? strikes[0]));
  const modelReady = !!expiryAt && expiryAt > asOf && legs.every(l => l.contract.kind === "FUT" || (l.contract.iv ?? 0) > 0);
  const targetAt = modelReady ? asOf + (expiryAt! - asOf)*targetPercent/100 : asOf;
  const years = modelReady ? Math.max(0, expiryAt! - targetAt)/(365*DAY) : 0;
  const estimate = (spot: number) => modelReady ? targetPayoff(legs,spot,years) : null;
  const modelPoints = modelReady ? Array.from({length:65}, (_,i) => {
    const spot = start + i*(end-start)/64;
    return {spot, value: estimate(spot)!};
  }) : [];
  const modelValues = modelPoints.map(p => p.value);
  const defaultLevel = (limit: number, visible: number) => String(Number((Math.max(0, Number.isFinite(limit) ? limit : visible) / 2).toPrecision(4)));
  const stop = riskInput ?? defaultLevel(maxLoss, -Math.min(...expiryValues));
  const target = targetInput ?? defaultLevel(maxProfit, Math.max(...expiryValues));
  const risk = Number(stop), reward = Number(target);
  const validRisk = Number.isFinite(risk) && risk > 0 && risk <= maxLoss;
  const validReward = Number.isFinite(reward) && reward > 0 && reward <= maxProfit;
  const floor = Math.min(0,...expiryValues,...modelValues,validRisk ? -risk : 0);
  const ceiling = Math.max(0,...expiryValues,...modelValues,validReward ? reward : 0);
  const left = 53, right = 471, top = 14, bottom = 142;
  const x = (value: number) => left+(right-left)*(value-start)/(end-start);
  const y = (value: number) => ceiling === floor ? (top+bottom)/2 : top+(bottom-top)*(ceiling-value)/(ceiling-floor);
  const signed = (value: number) => money.format(Math.abs(value) < 1e-9 ? 0 : value);
  const limit = (value: number) => Number.isFinite(value) ? money.format(value) : "Unlimited";
  const color = (value: number) => value >= 0 ? "spread-up" : "spread-down";
  const totals = greeks.map(greek => {
    const values = legs.map(leg => legGreek(leg,greek));
    return values.reduce<number | null>((sum,n) => sum === null || n === null ? null : sum+n,0);
  });
  const fmtGreek = (v: number | null) => v === null ? "—" : greekFormat.format(v);
  const base = reference ?? strikes[0];
  const scenarioPrices = [...new Set([start, ...[-5,-2,0,2,5].map(change => base*(1+change/100)), ...breakEvens, end])].sort((a,b) => a-b);
  const oi = contracts.filter(c => c.oi != null && c.oi >= 0 && c.strike >= start && c.strike <= end);
  const maxOi = oi.reduce((n,c) => Math.max(n,c.oi!),0);
  const drawOi = showOi && maxOi > 0;
  const oiStrikes = [...new Set(oi.map(c => c.strike))].sort((a,b) => a-b);
  const minGap = oiStrikes.slice(1).reduce((gap,s,i) => Math.min(gap,x(s)-x(oiStrikes[i])),16);
  const barWidth = Math.min(7,minGap*.42);
  const targetValue = estimate(price);
  const currency = money.resolvedOptions().currency;
  const targetControl = modelReady ? <div className="desk-target">
    <label>Target date <strong>{targetFormat.format(targetAt)} IST</strong>
      <input aria-label="Target date" aria-valuetext={targetFormat.format(targetAt) + " IST"} type="range" min={0} max={100} value={targetPercent} onChange={e => setTargetPercent(Number(e.target.value))}/></label>
    <small>Model holds each leg’s IV constant and assumes zero interest and dividends.</small></div> :
    <p className="desk-model-note">Target-date estimates require quoted IV and a known expiry time.</p>;

  return <>
    <dl className="desk-metrics">
      <div><dt>Max profit</dt><dd className="spread-up">{limit(maxProfit)}</dd></div>
      <div><dt>Max loss</dt><dd className="spread-down">{limit(maxLoss)}</dd></div>
      <div><dt>Reward / risk</dt><dd>{Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss > 0 ? greekFormat.format(maxProfit/maxLoss) + "×" : "—"}</dd></div>
      <div><dt>Break-even</dt><dd>{breakEvens.length ? breakEvens.map(value => money.format(value)).join(" / ") : "—"}</dd></div>
    </dl>
    <div className="desk-analysis-tabs" role="group" aria-label="Payoff views">{views.map(tab => <button type="button" key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab}</button>)}</div>
    {view === "P&L chart" && <figure className="desk-payoff-chart">
      <div className="desk-legend"><span className="legend-expiry">At expiry</span>{modelReady && <span className="legend-target">Target date</span>}{reference !== null && <span className="legend-spot">Ref {compact.format(reference)}</span>}</div>
      <svg viewBox={`0 0 480 ${drawOi ? 238 : 169}`} role="img" aria-label="Strategy profit and loss by underlying price"
        onPointerMove={event => { if (event.pointerType === "mouse" && event.buttons === 0) moveScenario(event); }}
        onPointerDown={moveScenario}>
        <title>Payoff in {currency} at expiry{modelReady ? " and on the target date" : ""}</title>
        {[...new Set([floor,(floor+ceiling)/2,ceiling])].map(value => <g key={value}><line className="desk-gridline" x1={left} x2={right} y1={y(value)} y2={y(value)}/><text x={left-6} y={y(value)+3} textAnchor="end">{compact.format(value)}</text></g>)}
        {points.slice(1).map((r,i) => {
          const l = points[i], a = payoff(l), b = payoff(r), positive = payoff((l+r)/2) >= 0;
          return <g key={r}><polygon className={positive ? "spread-profit-zone" : "spread-loss-zone"} points={`${x(l)},${y(0)} ${x(l)},${y(a)} ${x(r)},${y(b)} ${x(r)},${y(0)}`}/>
            <line x1={x(l)} y1={y(a)} x2={x(r)} y2={y(b)} className={positive ? "spread-profit-line" : "spread-loss-line"}/></g>;
        })}
        <line className="spread-zero" x1={left} x2={right} y1={y(0)} y2={y(0)}/>
        {reference !== null && <line className="desk-ref-line" x1={x(reference)} x2={x(reference)} y1={top} y2={bottom}/>}
        {modelReady && <polyline className="desk-model-line" points={modelPoints.map(p => x(p.spot)+","+y(p.value)).join(" ")}/>}
        {riskInput !== undefined && validRisk && <line x1={left} x2={right} y1={y(-risk)} y2={y(-risk)} className="spread-stop-line"/>}
        {targetInput !== undefined && validReward && <line x1={left} x2={right} y1={y(reward)} y2={y(reward)} className="spread-target-line"/>}
        {breakEvens.map(value => <circle key={value} cx={x(value)} cy={y(0)} r="2.6" className="spread-break-even"/>)}
        <circle cx={x(price)} cy={y(payoff(price))} r="3.7" className="spread-point"/>
        {[start,(start+end)/2,end].map((s,i) => <text key={s} x={x(s)} y={bottom+17} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{compact.format(s)}</text>)}
        {drawOi && <g><text x={left} y="182">Open interest · calls / puts</text><text x={right} y="182" textAnchor="end">Max {compact.format(maxOi)}</text>
          {oi.map(c => <rect key={c.id} x={x(c.strike)+(c.kind === "CE" ? -barWidth : 0)} y={229-40*c.oi!/maxOi}
            width={barWidth} height={40*c.oi!/maxOi} fill={c.kind === "CE" ? "var(--spread-gain)" : "var(--spread-loss)"}><title>{c.strike} {c.kind} · OI {c.oi}</title></rect>)}</g>}
      </svg>
      <div className="desk-scenario-readout"><div><small>Settlement price</small><strong>{money.format(price)}</strong></div>
        <div><small>Expiry P&amp;L</small><strong className={color(payoff(price))}>{signed(payoff(price))}</strong></div>
        {targetValue !== null && <div><small>Target P&amp;L</small><strong className={color(targetValue)}>{signed(targetValue)}</strong></div>}</div>
      <input className="desk-price-slider" type="range" aria-label="Settlement price" aria-valuetext={money.format(price)} min={start} max={end} step={(end-start)/500} value={price} onChange={e => setScenario(Number(e.target.value))}/>
      {maxOi > 0 && <label className="desk-oi-switch"><input type="checkbox" checked={showOi} onChange={e => setShowOi(e.target.checked)}/>Show open interest</label>}
      {targetControl}
    </figure>}
    {view === "P&L table" && <><div className="desk-analysis-table"><table><thead><tr><th>Settlement</th><th>Move</th><th>Expiry P&amp;L</th><th>Target P&amp;L</th></tr></thead>
      <tbody>{scenarioPrices.map(spot => {
        const value = estimate(spot);
        return <tr key={spot} data-at-ref={spot === reference}><th>{money.format(spot)}</th><td>{base > 0 ? ((spot/base-1)*100).toFixed(2) + "%" : "—"}</td>
          <td className={color(payoff(spot))}>{signed(payoff(spot))}</td><td className={value === null ? "" : color(value)}>{value === null ? "—" : signed(value)}</td></tr>;
      })}</tbody></table></div>{targetControl}</>}
    {view === "Greeks" && <><div className="desk-analysis-table"><table><thead><tr><th>Contract</th>{greeks.map(g => <th key={g}>{g}</th>)}</tr></thead>
      <tbody>{legs.map(l => <tr key={l.contract.id}><th>{l.contract.kind === "FUT" ? l.contract.symbol : compact.format(l.contract.strike)+" "+l.contract.kind}<small>{l.side} · {l.lots} lots</small></th>
        {greeks.map(g => <td key={g}>{fmtGreek(legGreek(l,g))}</td>)}</tr>)}</tbody>
      <tfoot><tr><th>Net exposure</th>{totals.map((v,i) => <td key={greeks[i]}>{fmtGreek(v)}</td>)}</tr></tfoot></table></div>
      <p className="desk-model-note">Signed exposures include lots and contract size. A dash marks missing exchange data.</p></>}
    {legs.some(l => l.contract.kind === "FUT") && <p className="desk-model-note">Futures are marked at the scenario price on option expiry. Funding and changes in basis are excluded.</p>}
    <details className="desk-risk-plan"><summary><ChartLine size={14}/>Stop &amp; target plan<ChevronDown size={13}/></summary>
      <div className="spread-risk-plan"><label>Stop loss ({currency})<input type="number" step="any" min={0} value={stop} aria-invalid={!validRisk} onChange={e => setRisk(e.target.value)}/></label>
        <label>Target ({currency})<input type="number" step="any" min={0} value={target} aria-invalid={!validReward} onChange={e => setTarget(e.target.value)}/></label>
        <div><span>Risk / reward</span><strong>{validRisk && validReward ? "1 : " + Number((reward/risk).toFixed(2)) : "—"}</strong></div></div>
      <p className="desk-model-note">Planning levels only.{(!validRisk || !validReward) && " Use positive levels within the maximum loss and profit."}</p></details>
  </>;

  function moveScenario(event: React.PointerEvent<SVGSVGElement>) {
    const svg = event.currentTarget, transform = svg.getScreenCTM();
    if (!transform) return;
    const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(transform.inverse());
    if (point.x < left || point.x > right || point.y < top || point.y > bottom) return;
    setScenario(start+(end-start)*(point.x-left)/(right-left));
  }
}
