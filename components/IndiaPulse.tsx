"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FLOW_WINDOWS, flowChartRows, flowsInRange, sessionBounds, vixBand, type AdPoint, type FlowPoint, type IndiaVix, type NseBreadth, type PutCallRatio } from "@/lib/india-pulse";
import { useTransientBack } from "./useTransientBack";

type Pulse = { breadth: NseBreadth | null; tape: AdPoint[]; vix: IndiaVix | null; vixCheckedAt: number | null; flows: FlowPoint[]; pcr: PutCallRatio | null; sessionLive: boolean };

const crore = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
const istDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const flowDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const checkedTime = (at: number) => `${istDate.format(at)}, ${clock.format(at)} IST`;

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  useTransientBack(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <details ref={ref} open={open}><summary aria-label={label} onClick={(event) => { event.preventDefault(); setOpen(value => !value); }}>i</summary>{open ? children : null}</details>;
}

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

function FlowChart({ rows }: { rows: FlowPoint[] }) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(360);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Older buckets retain their totals; the newest bar always represents one reported day.
  const plotted = useMemo(() => flowChartRows(rows, chartWidth < 440 ? 6 : 24), [rows, chartWidth]);
  const selected = plotted.find(row => row.date === selectedDate) ?? plotted.at(-1)!;
  const width = Math.max(300, chartWidth);
  const height = 172;
  const left = 46;
  const right = 12;
  const top = 14;
  const bottom = 30;
  const flowMax = Math.max(...plotted.flatMap(row => [Math.abs(row.fii), Math.abs(row.dii)]), 1);
  const slot = (width - left - right) / plotted.length;
  const barWidth = Math.min(12, Math.max(3, slot * 0.22));
  const yFlow = (value: number) => top + (1 - (value + flowMax) / (flowMax * 2)) * (height - top - bottom);
  const mid = yFlow(0);
  const labelEvery = Math.max(1, Math.ceil(plotted.length / (width < 440 ? 4 : 6)));
  const cashTick = (value: number) => value === 0 ? "0" : `${value < 0 ? "−" : ""}${new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 0 }).format(Math.abs(value))}`;
  return <div className="india-flow-visual">
    <svg ref={chartRef} className="india-flow-chart" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="FII and DII net cash bars; choose a date for exact figures">
    {[-flowMax, 0, flowMax].map(value => <g key={value}><line className="grid" x1={left} x2={width - right} y1={yFlow(value)} y2={yFlow(value)} /><text className="flow-axis" x={left - 8} y={yFlow(value) + 4} textAnchor="end">{cashTick(value)}</text></g>)}
    {plotted.map((row, index) => {
      const x = left + index * slot + slot / 2;
      const fii = Math.abs(yFlow(row.fii) - mid);
      const dii = Math.abs(yFlow(row.dii) - mid);
      return <g key={row.date} className={selected.date === row.date ? "selected" : ""} role="button" tabIndex={0} aria-pressed={selected.date === row.date} aria-label={`${row.label}: FII ${crore(row.fii)} crore, DII ${crore(row.dii)} crore`} onClick={() => setSelectedDate(row.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDate(row.date); } }}>
        <title>{row.label} · FII {crore(row.fii)} Cr · DII {crore(row.dii)} Cr</title>
        <rect className="flow-hit" x={x - slot / 2} y={top} width={slot} height={height - top - bottom} />
        <rect className={row.fii >= 0 ? "fii up" : "fii down"} x={x - barWidth - 1} y={row.fii >= 0 ? mid - fii : mid} width={barWidth} height={Math.max(fii, 1)} rx="1" />
        <rect className={row.dii >= 0 ? "dii up" : "dii down"} x={x + 1} y={row.dii >= 0 ? mid - dii : mid} width={barWidth} height={Math.max(dii, 1)} rx="1" />
        {(index % labelEvery === 0 && index < plotted.length - 1 - labelEvery / 2) || index === plotted.length - 1 ? <text className="flow-date" x={index === 0 ? left : index === plotted.length - 1 ? width - right : x} y={height - 8} textAnchor={index === 0 ? "start" : index === plotted.length - 1 ? "end" : "middle"} pointerEvents="none">{flowDate.format(new Date(`${row.date}T00:00:00Z`))}</text> : null}
      </g>;
    })}
    </svg>
    {plotted.length > 1 ? <div className="india-flow-detail" aria-live="polite"><b>{selected.label}</b><span>FII <strong className={selected.fii < 0 ? "down" : "up"}>{crore(selected.fii)} Cr</strong></span><span>DII <strong className={selected.dii < 0 ? "down" : "up"}>{crore(selected.dii)} Cr</strong></span></div> : null}
  </div>;
}

function FlowRangeMenu({ range, onChange }: { range: (typeof FLOW_WINDOWS)[number]["id"]; onChange: (value: (typeof FLOW_WINDOWS)[number]["id"]) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  return <div className="india-flow-range" ref={rootRef}>
    <button ref={triggerRef} type="button" className="india-flow-range-trigger" aria-label={`Chart timeline, ${range}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>{range}<span aria-hidden="true">⌄</span></button>
    {open && <div className="india-flow-range-menu" role="listbox" aria-label="Chart timeline" onKeyDown={event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      options[(current + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length]?.focus();
    }}>{FLOW_WINDOWS.map(item => <button key={item.id} type="button" role="option" aria-selected={range === item.id} onClick={() => { onChange(item.id); setOpen(false); triggerRef.current?.focus(); }}>{item.label}<span aria-hidden="true">{range === item.id ? "✓" : ""}</span></button>)}</div>}
  </div>;
}

function usePulse() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [range, setRange] = useState<(typeof FLOW_WINDOWS)[number]["id"]>("1M");
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetch("/api/market/india-pulse", { signal: controller.signal, cache: "no-store" })
        .then(response => response.json())
        .then(body => { if (body?.ok) setPulse({ breadth: body.breadth ?? null, tape: Array.isArray(body.tape) ? body.tape : [], vix: body.vix ?? null, vixCheckedAt: Number.isFinite(body.vixCheckedAt) ? body.vixCheckedAt : null, flows: Array.isArray(body.flows) ? body.flows : [], pcr: body.pcr ?? null, sessionLive: Boolean(body.sessionLive) }); })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  return { pulse, range, setRange };
}

export function IndiaPulse() {
  const { pulse } = usePulse();
  const breadth = pulse?.breadth;
  const latestPoint = pulse?.tape[pulse.tape.length - 1];
  const advance = pulse?.sessionLive ? breadth?.advance ?? latestPoint?.advance : latestPoint?.advance;
  const decline = pulse?.sessionLive ? breadth?.decline ?? latestPoint?.decline : latestPoint?.decline;
  const advanceShare = advance !== undefined && decline !== undefined ? advance / Math.max(1, advance + decline) : 0;
  const marketOpen = Boolean(pulse?.sessionLive && clock.format(Date.now()) < "15:30");
  const sessionDate = latestPoint ? istDate.format(latestPoint.t) : "";
  const sampleTime = latestPoint ? clock.format(latestPoint.t) : "";
  const adStatus = marketOpen
    ? latestPoint ? Date.now() - latestPoint.t < 3 * 60_000 ? `Live · ${sampleTime} IST` : `Last update ${sampleTime} IST` : "Waiting for live data"
    : latestPoint ? `${sessionDate} · ${sampleTime >= "15:25" ? "final" : "last sample"} ${sampleTime} IST` : "";
  const vixStatus = pulse?.vixCheckedAt ? `${marketOpen ? "Market open" : "Market closed"} · checked ${checkedTime(pulse.vixCheckedAt)}` : "";
  const pcr = pulse?.pcr;
  const pcrCheckedAt = pcr ? Date.parse(pcr.asOf) : NaN;
  const pcrStatus = Number.isFinite(pcrCheckedAt) ? `${marketOpen ? "Market open" : "Market closed"} · OI checked ${checkedTime(pcrCheckedAt)}` : "";
  const pcrShare = pcr ? Math.max(5, Math.min(95, pcr.putOi / (pcr.putOi + pcr.callOi) * 100)) : 50;
  return <section className="home-section india-pulse" aria-label="Indian market pulse">
    <header><span><b>Market pulse</b></span><small>Moneycontrol</small></header>
    <div className="india-pulse-board">
      <div className="india-ad">
        <div>
          <span>Advance/Decline (NSE){adStatus ? ` · ${adStatus}` : ""}</span>
          <div className="india-ad-bar" aria-hidden="true"><i style={{ width: `${Math.round(advanceShare * 100)}%` }} /></div>
          <div className="india-ad-counts"><b className="up">{advance !== undefined ? advance.toLocaleString("en-IN") : "—"}</b><b className="down">{decline !== undefined ? decline.toLocaleString("en-IN") : "—"}</b></div>
        </div>
        <div className="india-ad-legend"><b className="up"><i />Advance</b><b className="down"><i />Decline</b></div>
        {pulse && pulse.tape.length ? <SessionChart points={pulse.tape} /> : <div className="india-pulse-wait">{pulse?.sessionLive ? "Today's line starts with the first live sample." : "Chart unavailable"}</div>}
      </div>
      <div className="india-vix">
        <div className="india-vix-head"><span>India VIX <small>Expected 30-day volatility</small></span>{pulse?.vix ? <b className={`india-vix-status ${vixBand(pulse.vix.price).tone}`}>{vixBand(pulse.vix.price).label}</b> : null}</div>
        <div className="india-vix-value">{pulse?.vix ? <><strong>{pulse.vix.price.toFixed(2)}</strong><b className={pulse.vix.change < 0 ? "down" : "up"}>{pulse.vix.change > 0 ? "+" : ""}{pulse.vix.change.toFixed(2)} · {pulse.vix.changePercent > 0 ? "+" : ""}{pulse.vix.changePercent.toFixed(2)}%</b></> : <strong>—</strong>}</div>
        {vixStatus && <small className="india-pulse-freshness">{vixStatus}</small>}
        <div className="india-vix-range" role="img" aria-label={pulse?.vix ? `India VIX ${pulse.vix.price.toFixed(2)}, ${vixBand(pulse.vix.price).label}; indicative bands: calm below 15, watch 15 to 20, elevated 20 to 30, high above 30` : "Indicative VIX volatility bands"}>
          <div className="india-vix-track" aria-hidden="true"><i className="calm" /><i className="watch" /><i className="elevated" /><i className="high" />{pulse?.vix && <span style={{ left: `${vixBand(pulse.vix.price).position}%` }} />}</div>
          <div className="india-vix-labels"><span>Calm<br /><b>&lt;15</b></span><span>Watch<br /><b>15–20</b></span><span>Elevated<br /><b>20–30</b></span><span>High<br /><b>30+</b></span></div>
        </div>
        <small className="india-vix-note">Indicative bands · Higher VIX means more expected volatility, not market direction.</small>
      </div>
      <div className="india-pcr">
        <div className="india-pcr-head"><span>Nifty put/call ratio</span><InfoTip label="What is put/call ratio?"><p>Put/call ratio = total put open interest ÷ total call open interest for the nearest Nifty expiry.</p></InfoTip></div>
        <div className="india-pcr-main"><strong>{pcr ? pcr.value.toFixed(2) : "—"}</strong><span>{pcr ? `Nearest expiry · ${pcr.expiry}` : "Option-chain data unavailable"}</span></div>
        {pcrStatus && <small className="india-pulse-freshness">{pcrStatus}</small>}
        <div className="india-pcr-track" role="img" aria-label={pcr ? `Put open interest ${pcr.putOi.toLocaleString("en-IN")}, call open interest ${pcr.callOi.toLocaleString("en-IN")}, ratio ${pcr.value.toFixed(2)}` : "Put/call ratio unavailable"}><i style={{ width: `${pcrShare}%` }} /></div>
        <div className="india-pcr-labels"><span>Put OI {pcr ? new Intl.NumberFormat("en-IN", { notation: "compact" }).format(pcr.putOi) : "—"}</span><span>Call OI {pcr ? new Intl.NumberFormat("en-IN", { notation: "compact" }).format(pcr.callOi) : "—"}</span></div>
      </div>
    </div>
  </section>;
}

export function IndiaFlows() {
  const { pulse, range, setRange } = usePulse();
  const windowDays = FLOW_WINDOWS.find(item => item.id === range)?.days ?? 31;
  const series = flowsInRange(pulse?.flows ?? [], windowDays);
  const latest = pulse?.flows[0];
  const latestDate = latest?.date ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${latest.date}T00:00:00Z`)) : "";
  return <div className="india-flows-slot">
    <div className="india-flows">
      <div className="india-flow-top">
        <div className="india-flow-heading"><b>FII / DII flows</b><span>{latestDate ? `Reported ${latestDate}` : "—"}</span><InfoTip label="Explain chart colors"><div className="india-flow-key"><span><i className="fii-buy" />FII buying</span><span><i className="fii-sell" />FII selling</span><span><i className="dii-buy" />DII buying</span><span><i className="dii-sell" />DII selling</span></div></InfoTip></div>
        <div className="india-flow-summary"><div className="india-flow-stats"><div><span>FII net</span><strong className={latest && latest.fii < 0 ? "down" : "up"}>{latest ? `${crore(latest.fii)} Cr` : "—"}</strong></div><div><span>DII net</span><strong className={latest && latest.dii < 0 ? "down" : "up"}>{latest ? `${crore(latest.dii)} Cr` : "—"}</strong></div></div><FlowRangeMenu range={range} onChange={setRange} /></div>
      </div>
      {series.length ? <FlowChart rows={series} /> : <div className="india-pulse-wait">Flow data unavailable</div>}
    </div>
  </div>;
}
