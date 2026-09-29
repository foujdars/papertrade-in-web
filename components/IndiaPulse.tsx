"use client";
import { useEffect, useState } from "react";
import { FLOW_WINDOWS, flowsInRange, sessionBounds, type AdPoint, type FlowPoint, type IndiaVix, type NseBreadth } from "@/lib/india-pulse";

type Pulse = { breadth: NseBreadth | null; tape: AdPoint[]; vix: IndiaVix | null; flows: FlowPoint[] };

const crore = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

function axisMax(value: number) {
  const steps = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
  return steps.find(step => step >= value) ?? Math.ceil(value / 1000) * 1000;
}

function SessionChart({ points }: { points: AdPoint[] }) {
  const width = 360;
  const height = 210;
  const left = 36;
  const right = 12;
  const top = 12;
  const bottom = 22;
  const max = axisMax(Math.max(...points.flatMap(point => [point.advance, point.decline])));
  const bounds = sessionBounds(points);
  const start = bounds.start;
  const end = Math.max(bounds.end, points[points.length - 1].t);
  const x = (t: number) => left + ((Math.min(end, Math.max(start, t)) - start) / (end - start)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const line = (key: "advance" | "decline") => points.map((point, index) => `${index ? "L" : "M"}${x(point.t).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const ticks = [start, start + (end - start) * 0.25, start + (end - start) * 0.5, start + (end - start) * 0.75, end];
  return <svg className="india-ad-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="NSE advances and declines through the session">
    {[0, max / 2, max].map(value => <g key={value}><line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text x={left - 4} y={y(value) + 3} textAnchor="end">{Math.round(value)}</text></g>)}
    <path d={line("decline")} /><path d={line("advance")} />
    {points.length < 2 ? <><circle className="down" cx={x(points[0].t)} cy={y(points[0].decline)} r="3" /><circle className="up" cx={x(points[0].t)} cy={y(points[0].advance)} r="3" /></> : null}
    {ticks.map((tick, index) => <text key={tick} x={x(tick)} y={height - 4} textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}>{clock.format(tick)}</text>)}
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

function FlowChart({ rows }: { rows: FlowPoint[] }) {
  const width = 640;
  const height = 250;
  const left = 46;
  const right = 52;
  const top = 16;
  const bottom = 28;
  const flowMax = Math.max(...rows.flatMap(row => [Math.abs(row.fii), Math.abs(row.dii)]), 1);
  const niftyValues = rows.map(row => row.nifty).filter((value): value is number => value !== null);
  const niftyMin = niftyValues.length ? Math.min(...niftyValues) : 0;
  const niftyMax = niftyValues.length ? Math.max(...niftyValues) : 1;
  const niftyPad = Math.max(20, (niftyMax - niftyMin) * 0.12);
  const low = niftyMin - niftyPad;
  const high = niftyMax + niftyPad;
  const slot = (width - left - right) / rows.length;
  const yFlow = (value: number) => top + (1 - (value + flowMax) / (flowMax * 2)) * (height - top - bottom);
  const yNifty = (value: number) => top + (1 - (value - low) / (high - low || 1)) * (height - top - bottom);
  const mid = yFlow(0);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  const line = niftyValues.length ? rows.map((row, index) => row.nifty === null ? null : `${index && rows[index - 1]?.nifty !== null ? "L" : "M"}${left + index * slot + slot / 2},${yNifty(row.nifty).toFixed(1)}`).filter(Boolean).join(" ") : "";
  return <svg className="india-flow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="FII and DII net cash with Nifty 50">
    {[-flowMax, 0, flowMax].map(value => <g key={value}><line className="grid" x1={left} x2={width - right} y1={yFlow(value)} y2={yFlow(value)} /><text className="flow-axis" x={left - 6} y={yFlow(value) + 3} textAnchor="end">{Math.round(value / 1000)}k</text></g>)}
    {niftyValues.length ? [low, (low + high) / 2, high].map(value => <text key={value} className="nifty-axis" x={width - right + 6} y={yNifty(value) + 3}>{Math.round(value).toLocaleString("en-IN")}</text>) : null}
    {rows.map((row, index) => {
      const x = left + index * slot + slot / 2;
      const fii = Math.abs(yFlow(row.fii) - mid);
      const dii = Math.abs(yFlow(row.dii) - mid);
      return <g key={row.date}>
        <rect className={row.fii >= 0 ? "fii up" : "fii down"} x={x - 7} y={row.fii >= 0 ? mid - fii : mid} width="6" height={Math.max(fii, 1)} rx="1" />
        <rect className={row.dii >= 0 ? "dii up" : "dii down"} x={x + 1} y={row.dii >= 0 ? mid - dii : mid} width="6" height={Math.max(dii, 1)} rx="1" />
        {index % labelEvery === 0 || index === rows.length - 1 ? <text className="flow-date" x={x} y={height - 8} textAnchor="middle">{row.label.replace(/^[A-Za-z]{3}\s/, "")}</text> : null}
      </g>;
    })}
    {line ? <path className="nifty" d={line} /> : null}
    {rows.at(-1)?.nifty !== null && rows.at(-1)?.nifty !== undefined ? <circle className="nifty-dot" cx={left + (rows.length - 1) * slot + slot / 2} cy={yNifty(rows.at(-1)!.nifty!)} r="3.5" /> : null}
  </svg>;
}

export function IndiaPulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [range, setRange] = useState<(typeof FLOW_WINDOWS)[number]["id"]>("1M");
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
  const windowDays = FLOW_WINDOWS.find(item => item.id === range)?.days ?? 31;
  const series = flowsInRange(pulse?.flows ?? [], windowDays);
  const latest = pulse?.flows[0];
  const niftyChange = latest?.niftyChange;
  const niftyPercent = latest?.nifty && niftyChange !== null && niftyChange !== undefined ? (niftyChange / (latest.nifty - niftyChange)) * 100 : null;
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
      </div>
      <div className="india-vix">
        <div><span>India VIX</span>{pulse?.vix ? <><strong>{pulse.vix.price.toFixed(2)}</strong><b className={pulse.vix.change < 0 ? "down" : "up"}>{pulse.vix.change > 0 ? "+" : ""}{pulse.vix.change.toFixed(2)} · {pulse.vix.changePercent > 0 ? "+" : ""}{pulse.vix.changePercent.toFixed(2)}%</b></> : <strong>—</strong>}</div>
        {pulse?.vix && <VixGauge vix={pulse.vix} />}
      </div>
      <div className="india-flows">
        <div className="india-flow-top">
          <div className="india-flow-stats">
            <div><span><i className="fii" />FII Net</span><strong className={latest && latest.fii < 0 ? "down" : "up"}>{latest ? `${crore(latest.fii)} Cr` : "—"}</strong></div>
            <div><span><i className="dii" />DII Net</span><strong className={latest && latest.dii < 0 ? "down" : "up"}>{latest ? `${crore(latest.dii)} Cr` : "—"}</strong></div>
            <div><span><i className="nifty" />Nifty 50</span><strong>{latest?.nifty ? latest.nifty.toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}</strong>{niftyChange !== null && niftyChange !== undefined && niftyPercent !== null ? <em className={niftyChange < 0 ? "down" : "up"}>{niftyChange > 0 ? "+" : ""}{Math.round(niftyChange).toLocaleString("en-IN")} ({niftyPercent > 0 ? "+" : ""}{niftyPercent.toFixed(2)}%)</em> : null}</div>
          </div>
          <div className="india-flow-ranges" role="group" aria-label="FII and DII range">{FLOW_WINDOWS.map(item => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>
        </div>
        {series.length ? <FlowChart rows={series} /> : <div className="india-pulse-wait">Flow data unavailable</div>}
        <div className="india-flow-legend"><span><i className="fii up" />FII Net Buying</span><span><i className="fii down" />FII Net Selling</span><span><i className="dii up" />DII Net Buying</span><span><i className="dii down" />DII Net Selling</span><span><i className="nifty" />Nifty 50 (Close)</span></div>
      </div>
    </div>
  </section>;
}
