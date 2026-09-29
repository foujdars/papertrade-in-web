"use client";
import { useEffect, useState } from "react";
import type { CashFlow, IndexBreadth, IndiaVix, NseBreadth } from "@/lib/india-pulse";

type Pulse = { breadth: NseBreadth | null; indices: IndexBreadth[]; vix: IndiaVix | null; flows: CashFlow[] };

const crore = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;

function BreadthChart({ rows }: { rows: IndexBreadth[] }) {
  const width = 148;
  const height = 52;
  const max = Math.max(...rows.flatMap(row => [row.advance, row.decline]), 1);
  const x = (index: number) => rows.length < 2 ? width / 2 : (index / (rows.length - 1)) * (width - 4) + 2;
  const y = (value: number) => height - 3 - (value / max) * (height - 8);
  const line = (key: "advance" | "decline") => rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(row[key]).toFixed(1)}`).join(" ");
  return <svg className="india-ad-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Advances and declines across major NSE indices"><path d={line("decline")} /><path d={line("advance")} /></svg>;
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
    fetch("/api/market/india-pulse", { signal: controller.signal, cache: "no-store" })
      .then(response => response.json())
      .then(body => { if (body?.ok) setPulse({ breadth: body.breadth ?? null, indices: Array.isArray(body.indices) ? body.indices : [], vix: body.vix ?? null, flows: Array.isArray(body.flows) ? body.flows : [] }); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const breadth = pulse?.breadth;
  const advanceShare = breadth ? breadth.advance / Math.max(1, breadth.advance + breadth.decline) : 0;
  const latest = pulse?.flows[0];
  return <section className="home-section india-pulse" aria-label="Indian market pulse">
    <header><span><b>Market pulse</b></span><small>Moneycontrol</small></header>
    <div className="india-pulse-board">
      <div className="india-ad">
        <div>
          <span>Advance/Decline (NSE)</span>
          <div className="india-ad-bar" aria-hidden="true"><i style={{ width: `${Math.round(advanceShare * 100)}%` }} /></div>
          <div className="india-ad-counts"><b className="up">{breadth ? breadth.advance.toLocaleString("en-IN") : "—"}</b><b className="down">{breadth ? breadth.decline.toLocaleString("en-IN") : "—"}</b></div>
        </div>
        <div>
          <span>A/D chart</span>
          {pulse && pulse.indices.length > 1 ? <BreadthChart rows={pulse.indices} /> : <div className="india-pulse-wait">Chart unavailable</div>}
          <small>Major indices</small>
        </div>
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
