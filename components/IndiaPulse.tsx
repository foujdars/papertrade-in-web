"use client";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { adLinePath, mergeBreadthSnapshot, breadthShares, FLOW_WINDOWS, flowChartRows, flowsInRange, sessionBounds, vixBand, type AdPoint, type FlowPoint, type IndiaVix, type NseBreadth, type PutCallRatio } from "@/lib/india-pulse";
import { useTransientBack } from "./useTransientBack";
import { ChartNoAxesCombined, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { MarketGauge } from "./MarketGauge";
import { startVisiblePolling } from "@/lib/visible-polling";

type Pulse = { breadth: NseBreadth | null; tape: AdPoint[]; vix: IndiaVix | null; breadthCheckedAt: number | null; flows: FlowPoint[]; pcr: PutCallRatio | null; sessionLive: boolean };

const crore = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
const sessionDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const stockCount = new Intl.NumberFormat("en-IN");
const flowDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

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
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(360);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);
  const height = width >= 600 ? 192 : 144;
  const left = 40, right = 8, top = 11, bottom = 26;
  const last = points[points.length - 1];
  const max = axisMax(Math.max(...points.flatMap(point => [point.advance, point.decline])));
  const bounds = sessionBounds(points);
  const start = bounds.start, end = Math.max(bounds.end, last.t);
  const x = (t: number) => left + ((Math.min(end, Math.max(start, t)) - start) / (end - start)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const line = (key: "advance" | "decline") => adLinePath(points, key, x, y);
  const ticks = [start, start + 105 * 60000, start + 225 * 60000, end];
  return <svg ref={chartRef} className="india-ad-chart" style={{ height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`NSE stock counts on ${sessionDate.format(last.t)}. Last plotted at ${clock.format(last.t)} IST, ${stockCount.format(last.advance)} advances and ${stockCount.format(last.decline)} declines.`}>
    {[0, max / 2, max].map(value => <g key={value}>
      <line className="grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} />
      <text className="india-breadth-axis" x={left - 7} y={y(value) + 4} textAnchor="end">{stockCount.format(value)}</text>
    </g>)}
    <path className="india-breadth-line down" d={line("decline")} /><path className="india-breadth-line up" d={line("advance")} />
    {points.filter((p, i) => (!i || p.t - points[i - 1].t > 5 * 60000) && (i === points.length - 1 || points[i + 1].t - p.t > 5 * 60000)).map(p => <g key={p.t}><circle className="up" cx={x(p.t)} cy={y(p.advance)} r="2" /><circle className="down" cx={x(p.t)} cy={y(p.decline)} r="2" /></g>)}
    <circle className="up" cx={x(last.t)} cy={y(last.advance)} r="3" />
    <circle className="down" cx={x(last.t)} cy={y(last.decline)} r="3" />
    {ticks.map((tick, index) => <g key={tick}>
      <line className="grid" x1={x(tick)} x2={x(tick)} y1={height - bottom} y2={height - bottom + 4} />
      <text className="india-breadth-time" x={x(tick)} y={height - 6} textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}>{clock.format(tick)}</text>
    </g>)}
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
  const height = 144;
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
    <svg ref={chartRef} className="india-flow-chart" style={{ height }} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="FII and DII net cash bars; choose a date for exact figures">
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
  useTransientBack(open, () => { setOpen(false); triggerRef.current?.focus(); });
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

function usePulse(part: "breadth" | "gauges" | "flows", enabled = true) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [range, setRange] = useState<(typeof FLOW_WINDOWS)[number]["id"]>("1M");
  useEffect(() => {
    if (!enabled) return;
    return startVisiblePolling(async signal => {
      const response = await fetch(`/api/market/india-pulse?part=${part}`, { signal, cache: "no-store" });
      const body = await response.json();
      if (signal.aborted) return;
      if (!response.ok || !body?.ok) throw new Error("Pulse unavailable");
      const receivedAt = Date.now();
      setFailed(part === "breadth" && !body.breadth);
      setPulse(previous => ({ ...mergeBreadthSnapshot(previous, { breadth: body.breadth ?? null, breadthCheckedAt: Number.isFinite(body.breadthCheckedAt) ? body.breadthCheckedAt : null, tape: Array.isArray(body.tape) ? body.tape : [] }, Boolean(body.sessionLive), receivedAt), vix: body.vix ?? null, flows: Array.isArray(body.flows) ? body.flows : [], pcr: body.pcr ?? null, sessionLive: Boolean(body.sessionLive) }));
    }, part === "breadth" ? 10_000 : part === "flows" ? 5 * 60_000 : 30_000, () => setFailed(true));
  }, [part, enabled, retry]);
  return { pulse, range, setRange, failed, refresh: () => setRetry(value => value + 1) };
}

export function IndiaPulse({ showBreadth = true, showGauges = true }: { showBreadth?: boolean; showGauges?: boolean }) {
  const { pulse: gauges } = usePulse("gauges", showGauges);
  const vix = gauges?.vix;
  const band = vix ? vixBand(vix.price) : null;
  const pcr = gauges?.pcr;
  const pcrShare = pcr ? Math.max(5, Math.min(95, pcr.putOi / (pcr.putOi + pcr.callOi) * 100)) : null;
  const oi = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
  return <div className="india-pulse-layout">
    {showBreadth && <MarketPulse />}
    {showGauges && <section className="home-section india-gauge-panel" aria-label="India VIX and Nifty put/call ratio">
      <div className="india-vix">
        <div className="india-gauge-heading"><h3>India VIX</h3></div>
        <MarketGauge variant="vix" position={band?.position ?? null} label={vix ? `India VIX ${vix.price.toFixed(2)}, ${band!.label}; indicative bands: calm below 15, watch 15 to 20, elevated 20 to 30, high above 30` : "India VIX unavailable; indicative volatility bands"} />
        <div className="india-vix-value"><strong>{vix ? vix.price.toFixed(2) : "—"}</strong>{vix ? <b className={vix.change < 0 ? "down" : "up"}>{vix.change > 0 ? "+" : ""}{vix.change.toFixed(2)} · {vix.changePercent > 0 ? "+" : ""}{vix.changePercent.toFixed(2)}%</b> : null}</div>
        <div className="india-gauge-foot">{band ? <b className={`india-vix-status ${band.tone}`}>{band.label}</b> : null}</div>
      </div>
      <div className="india-pcr">
        <div className="india-gauge-heading"><h3>Nifty put/call ratio</h3>{pcr && <small>{pcr.expiry}</small>}</div>
        <MarketGauge variant="pcr" position={pcrShare} putOi={pcr ? oi.format(pcr.putOi) : "—"} callOi={pcr ? oi.format(pcr.callOi) : "—"} label={pcr ? `Put open interest ${pcr.putOi.toLocaleString("en-IN")}, call open interest ${pcr.callOi.toLocaleString("en-IN")}, ratio ${pcr.value.toFixed(2)}` : "Put/call ratio unavailable"} />
        <div className="india-pcr-main"><strong>{pcr ? pcr.value.toFixed(2) : "—"}</strong></div>
      </div>
    </section>}
  </div>;
}

function MarketPulse() {
  const { pulse, failed, refresh } = usePulse("breadth");
  const [expanded, setExpanded] = useState(false);
  const chartId = useId();
  const tape = pulse?.tape ?? [];
  const lastPoint = tape.at(-1);
  const snapshot = lastPoint && lastPoint.t > (pulse?.breadthCheckedAt ?? 0) ? lastPoint : pulse?.breadth;
  const shares = snapshot && breadthShares(snapshot);
  const advancePercent = shares ? Math.round(shares.advance * 10) / 10 : 0;
  const showTrend = expanded && tape.length > 1;
  useTransientBack(showTrend, () => setExpanded(false));

  return <section className="home-section india-pulse india-breadth-card" aria-label="Indian market pulse">
    <header className="india-breadth-head">
      <b>Market Pulse</b>
      {tape.length > 1 && <button type="button" className="india-breadth-expand" aria-expanded={showTrend} aria-controls={chartId}
        onClick={() => setExpanded(value => !value)}><ChartNoAxesCombined size={15} aria-hidden="true" /> Intraday <ChevronDown size={13} aria-hidden="true" /></button>}
    </header>
    <div className="india-ad">
      {snapshot && shares ? <div className="india-breadth-snapshot">
        <div className="india-breadth-ratio">
          <div><b>Advance / decline ratio</b><small>Share of NSE stocks that moved</small></div>
          <strong>{shares.ratio}{shares.ratio !== "∞" && <span> : 1</span>}</strong>
        </div>
        <div className="india-breadth-share-bar" aria-hidden="true">
          <span className="up" style={{ width: `${shares.advance}%` }} /><span className="down" style={{ width: `${shares.decline}%` }} />
        </div>
        <div className="india-breadth-counts">
          <div><span className="india-breadth-key up"><TrendingUp size={15} aria-hidden="true" /> Advances</span><b>{stockCount.format(snapshot.advance)} <small>{advancePercent.toFixed(1)}%</small></b></div>
          <div><span className="india-breadth-key down"><TrendingDown size={15} aria-hidden="true" /> Declines</span><b>{stockCount.format(snapshot.decline)} <small>{(100 - advancePercent).toFixed(1)}%</small></b></div>
        </div>
      </div> : <div className="india-pulse-wait" role="status">{pulse || failed ? "No breadth data" : "Loading breadth…"}</div>}
      <div id={chartId} hidden={!showTrend}>
        {showTrend && lastPoint && <div className="india-breadth-trend">
          <small>{sessionDate.format(lastPoint.t)} · IST</small>
          <SessionChart points={tape} />
        </div>}
      </div>
      {failed && <div className="india-breadth-retry" role="status"><button type="button" onClick={refresh}>Retry market pulse</button></div>}
    </div>
  </section>;
}

export function IndiaFlows() {
  const { pulse, range, setRange } = usePulse("flows");
  const windowDays = FLOW_WINDOWS.find(item => item.id === range)?.days ?? 31;
  const series = flowsInRange(pulse?.flows ?? [], windowDays);
  const latest = pulse?.flows[0];
  const latestDate = latest?.date ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${latest.date}T00:00:00Z`)) : "";
  return <div className="india-flows-slot">
    <div className="india-flows">
      <div className="india-flow-top">
        <div className="india-flow-heading"><b>FII / DII flows</b><span>{latestDate ? `Reported ${latestDate}` : "—"}</span><InfoTip label="Chart legend"><div className="india-flow-key"><span><i className="fii-buy" />FII buying</span><span><i className="fii-sell" />FII selling</span><span><i className="dii-buy" />DII buying</span><span><i className="dii-sell" />DII selling</span></div></InfoTip></div>
        <div className="india-flow-summary"><div className="india-flow-stats"><div><span>FII net</span><strong className={latest && latest.fii < 0 ? "down" : "up"}>{latest ? `${crore(latest.fii)} Cr` : "—"}</strong></div><div><span>DII net</span><strong className={latest && latest.dii < 0 ? "down" : "up"}>{latest ? `${crore(latest.dii)} Cr` : "—"}</strong></div></div><FlowRangeMenu range={range} onChange={setRange} /></div>
      </div>
      {series.length ? <FlowChart rows={series} /> : <div className="india-pulse-wait">Flow data unavailable</div>}
    </div>
  </div>;
}
