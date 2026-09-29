"use client";
import { useEffect, useState } from "react";
import type { AdPoint, CashFlow, IndiaVix, NseBreadth } from "@/lib/india-pulse";

type Pulse = { breadth: NseBreadth | null; tape: AdPoint[]; vix: IndiaVix | null; flows: CashFlow[] };

const crore = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

function axisMax(value: number) {
  const steps = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  return steps.find(step => step >= value) ?? Math.ceil(value / 1000) * 1000;
}

function SessionChart({ points }: { points: AdPoint[] }) {
  const width = 320;
  const height = 156;
  const left = 36;
  const right = 8;
  const top = 10;
  const bottom = 18;
  const max = axisMax(Math.max(...points.flatMap(point => [point.advance, point.decline])));
  const start = points[0].t;
  const end = Math.max(points[points.length - 1].t, start + 60_000);
  const x = (t: number) => left + ((t - start) / (end - start)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const line = (key: "advance" | "decline") => points.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const marks = points.length < 3 ? points : [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  return <svg className="india-ad-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="NSE advances and declines through the session">
    {[0, max / 2, max].map(value => <g key={value}><line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 4} y={y(value) + 3} textAnchor="end">{Math.round(value)}</text></g>)}
    <path d={line("decline")} /><path d={line("advance")} />
    {points.length < 2 ? <><circle className="down" cx={x(points[0].t)} cy={y(points[0].decline)} r="3" /><circle className="up" cx={x(points[0].t)} cy={y(points[0].advance)} r="3" /></> : null}
    {marks.map(point => <text key={point.t} x={x(point.t)} y={height - 4} textAnchor={point === points[0] ? "start" : point === points[points.length - 1] ? "end" : "middle"}>{clock.format(point.t)}</text>)}
  </svg>;
}

function VixGauge({ vix }: { vix: IndiaVix }) {
  if (vix.low === null || vix.high === null || vix.high <= vix.low) return null;
  const t = Math.min(1, Math.max(0, (vix.price - vix.low) / (vix.high - vix.low)));
  const start = Math.PI;
  const angle = start - t * Math.PI;
  const point = (radians: number) => [60 + 38 * Math.cos(radians), 50 - 38 * Math.sin(radians)];
  const [sx, sy] = point(start);
  const [ex, ey] = point(angle);
  const large = t > 0.5 ? 1 : 0;
  return <svg className="india-vix-gauge" viewBox="0 0 120 58" aria-hidden="true"><path d="M22 50 A38 38 0 0 1 98 50" /><path d={`M${sx.toFixed(1)} ${sy.toFixed(1)} A38 38 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} /><circle cx={ex} cy={ey} r="3.5" /></svg>;
}

function FlowChart({ rows }: { rows: CashFlow[] }) {
  const ordered = [...rows].reverse();
  const max = Math.max(...ordered.flatMap(row => [Math.abs(row.fii), Math.abs(row.dii)]), 1);
  const width = 280;
  const height = 78;
  const mid = 36;
  const slot = width / ordered.length;
  return <svg className="india-flow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="FII and DII cash flows"><line x1="0" x2={width} y1={mid} y2={mid} />{ordered.map((row, index) => {
    const x = index * slot + slot / 2;
    const fii = (Math.abs(row.fii) / max) * 30;
    const dii = (Math.abs(row.dii) / max) * 30;
    return <g key={row.date}><rect className={row.fii >= 0 ? "fii up" : "fii down"} x={x - 8} y={row.fii >= 0 ? mid - fii : mid} width="6" height={Math.max(fii, 1)} rx="1" /><rect className={row.dii >= 0 ? "dii up" : "dii down"} x={x + 1} y={row.dii >= 0 ? mid - dii : mid} width="6" height={Math.max(dii, 1)} rx="1" /></g>;
  })}</svg>;
}

export function IndiaPulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/market/india-pulse", { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => { if (body?.ok) setPulse({ breadth: body.breadth ?? null, tape: Array.isArray(body.tape) ? body.tape : [], vix: body.vix ?? null, flows: Array.isArray(body.flows) ? body.flows : [] }); })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  const breadth = pulse?.breadth;
  const latestPoint = pulse?.tape[pulse.tape.length - 1];
  const advance = latestPoint?.advance ?? breadth?.advance;
  const decline = latestPoint?.decline ?? breadth?.decline;
  const advanceShare = advance !== undefined && decline !== undefined ? advance / Math.max(1, advance + decline) : 0;
  const latest = pulse?.flows[0];
  return <section className="home-section india-pulse" aria-label="Indian market pulse">
    <header><span><b>Market pulse</b></span><small>Moneycontrol</small></header>
    <div className="india-pulse-board">
      <div className="india-ad">
        <div>
          <span>Advance/Decline (NSE)</span>
          <div className="india-ad-bar" aria-hidden="true"><i style={{ width: `${Math.round(advanceShare * 100)}%` }} /></div>
          <div className="india-ad-counts"><b className="up">{advance !== undefined ? advance.toLocaleString("en-IN") : "—"}</b><b className="down">{decline !== undefined ? decline.toLocaleString("en-IN") : "—"}</b></div>
        </div>
        <div className="india-ad-legend"><b className="up"><i />Advance ({advance !== undefined ? advance.toLocaleString("en-IN") : "—"})</b><b className="down"><i />Decline ({decline !== undefined ? decline.toLocaleString("en-IN") : "—"})</b></div>
        {pulse && pulse.tape.length ? <SessionChart points={pulse.tape} /> : <div className="india-pulse-wait">Session line builds live from 9:15 IST</div>}
        <small>NSE session · live counts, not a guessed path</small>
      </div>
      <div className="india-vix">
        <div><span>India VIX</span>{pulse?.vix ? <><strong>{pulse.vix.price.toFixed(2)}</strong><b className={pulse.vix.change < 0 ? "down" : "up"}>{pulse.vix.change > 0 ? "+" : ""}{pulse.vix.change.toFixed(2)} · {pulse.vix.changePercent > 0 ? "+" : ""}{pulse.vix.changePercent.toFixed(2)}%</b></> : <strong>—</strong>}</div>
        {pulse?.vix && <VixGauge vix={pulse.vix} />}
      </div>
      <div className="india-flows">
        <div className="india-flow-head"><span>FII / DII</span><small>{latest ? `${latest.label} · cash ₹ cr` : "Cash ₹ cr"}</small></div>
        {latest ? <>
          <div className="india-flow-now"><b><i className="fii" />FII <em className={latest.fii < 0 ? "down" : "up"}>{crore(latest.fii)}</em></b><b><i className="dii" />DII <em className={latest.dii < 0 ? "down" : "up"}>{crore(latest.dii)}</em></b></div>
          <FlowChart rows={pulse?.flows ?? []} />
        </> : <div className="india-pulse-wait">Flow data unavailable</div>}
      </div>
    </div>
  </section>;
}
