"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { analyzeSmc, isSmcZone, untouchedSmcMarks, SMC_ZONE_COLOURS, SMC_LESSONS, type SmcKind, type SmcMark } from "@/lib/smc-learner";
import { useTransientBack } from "./useTransientBack";
import { useChartPreference } from "@/lib/chart-view-preferences";

const groups: Record<string, SmcKind[]> = {
  Structure: ["BOS / BMS", "CHoCH", "SMS / MSS"], FVG: ["FVG"], "Order blocks": ["OB"],
  Breakers: ["Breaker"], Liquidity: ["Sweep", "EQH", "EQL"],
};
const dateText = (time: number) => new Date(time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function SmcLearner({ candles, chart, series, timeframe, replay, dark, refreshRef }: {
  candles: Candle[]; chart: IChartApi | null; series: ISeriesApi<"Candlestick"> | null;
  timeframe: string; replay: boolean; dark: boolean; refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lesson, setLesson] = useChartPreference("smcLesson");
  const [filters, setFilters] = useChartPreference("smcFilters");
  const [rangeVisible, setRangeVisible] = useChartPreference("smcRange");
  const [, redraw] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const explanationRef = useRef<HTMLElement>(null);
  const analysisCache = useRef<{ bars: Candle[]; result: ReturnType<typeof analyzeSmc>; intraday: boolean } | null>(null);
  useTransientBack(open, () => setOpen(false));
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw(v => v + 1); }); };
    refreshRef.current = refresh;
    refresh();
    return () => { cancelAnimationFrame(frame); refreshRef.current = null; };
  }, [refreshRef, chart, candles]);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
  }, [open]);
  // Live mode deliberately waits for the next bar before confirming the latest
  // bar. Replay candles are already fully revealed, closed historical bars.
  const analysis = useMemo(() => {
    const closed = replay ? candles : candles.slice(0, -1);
    const intraday = !["1D", "1W", "1M", "1Y"].includes(timeframe);
    const cached = analysisCache.current;
    // Reprice the live bar smoothly without recalculating closed-bar patterns.
    if (cached && cached.intraday === intraday && cached.bars.length === closed.length && closed.every((bar, i) => bar === cached.bars[i])) return cached.result;
    const result = analyzeSmc(closed, intraday);
    analysisCache.current = { bars: closed, result, intraday };
    return result;
  }, [candles, timeframe, replay]);
  const allowed = new Set(filters.flatMap(group => groups[group]));
  const relevant = untouchedSmcMarks(analysis.marks, replay ? undefined : candles.at(-1)).filter(m => allowed.has(m.kind));
  const recent = [...relevant].sort((a, b) => b.confirmed - a.confirmed).slice(0, 30);
  const focused = analysis.marks.find(m => m.id === selected);
  const enabledKinds = Object.keys(SMC_LESSONS) as SmcKind[];
  const pane = chart?.paneSize(0) ?? { width: 0, height: 0 };
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19800;
  const x = (time: number) => chart?.timeScale().timeToCoordinate((time + shift) as UTCTimestamp) ?? null;
  const y = (price: number) => series?.priceToCoordinate(price) ?? null;
  const occupied: number[] = [];
  const shapes = [...relevant].reverse().flatMap((m) => {
    const left = x(m.confirmed), end = x(isSmcZone(m) ? m.end ?? candles.at(-1)?.time ?? m.confirmed : m.confirmed);
    const top = y(m.high), bottom = y(m.low);
    if (left === null || end === null || top === null || bottom === null || end < 0 || left > pane.width || bottom < 0 || top > pane.height) return [];
    return [{ mark: m, left: Math.max(0, left), right: Math.min(pane.width - 2, end + (isSmcZone(m) && !m.end ? 18 : 0)), top, bottom }];
  }).slice(0, 24);
  const showMark = (m: SmcMark) => { setSelected(m.id); setLesson(m.kind); requestAnimationFrame(() => explanationRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })); };
  return <>
    <svg className="smc-overlay" width={pane.width} height={pane.height} aria-hidden="true">
      {rangeVisible && analysis.range && (() => {
        const high = y(analysis.range.high), low = y(analysis.range.low), mid = y(analysis.range.midpoint);
        if (high === null || low === null || mid === null) return null;
        return <g><rect x={0} y={high} width={pane.width} height={Math.max(0, mid - high)} fill="#f04458" opacity=".035"/><rect x={0} y={mid} width={pane.width} height={Math.max(0, low - mid)} fill="#00a67e" opacity=".035"/><path d={`M0 ${mid}H${pane.width}`} stroke="#a78bfa" strokeDasharray="3 4"/><text x={8} y={mid - 6} fill={dark ? "#c4b5fd" : "#6d28d9"}>50% equilibrium · premium above / discount below</text></g>;
      })()}
      {shapes.map(({ mark: m, left, right, top, bottom }) => {
        const colour = m.direction === "bullish" ? (dark ? "#44dfc0" : "#00856b") : (dark ? "#ff91aa" : "#c12d54");
        const zone = isSmcZone(m);
        if (zone) {
          const fill = SMC_ZONE_COLOURS[m.kind as keyof typeof SMC_ZONE_COLOURS];
          const arrowX = Math.max(left + 4, right - 12);
          const arrowY = Math.max(10, Math.min(pane.height - 10, (top + bottom) / 2));
          const bull = m.direction === "bullish";
          return <g key={m.id} data-smc-zone={m.kind} data-smc-direction={m.direction}>
            <rect x={left} y={top} width={Math.max(2, right - left)} height={Math.max(2, bottom - top)} fill={fill} fillOpacity={dark ? ".28" : ".24"} stroke="none" />
            <path d={bull ? `M${arrowX} ${arrowY - 5}l-5 9h10z` : `M${arrowX} ${arrowY + 5}l-5 -9h10z`} fill={bull ? (dark ? "#44dfc0" : "#009b7c") : (dark ? "#ff83ad" : "#e53572")} stroke="none" />
          </g>;
        }
        let labelY = Math.max(86, Math.min(pane.height - 12, top - 5));
        let attempts = 0;
        while (occupied.some(v => Math.abs(v - labelY) < 16) && attempts++ < 5) labelY += 16;
        const labelVisible = attempts <= 5 && labelY < pane.height - 10;
        if (labelVisible) occupied.push(labelY);
        const label = m.kind;
        return <g key={m.id} opacity={m.end ? .5 : 1}>
          <path d={`M${Math.max(0, x(m.origin) ?? left)} ${top}H${right}`} stroke={colour} strokeDasharray={m.kind === "Sweep" ? "2 3" : "6 3"}/>
          {labelVisible && <text x={Math.min(Math.max(left + 3, 4), Math.max(4, pane.width - label.length * 7))} y={labelY} fill={colour}>{label}</text>}
        </g>;
      })}
    </svg>
    <div className="smc-zone-key" aria-label="SMC zone colours"><span><i style={{ background: SMC_ZONE_COLOURS.OB }}/>OB</span><span><i style={{ background: SMC_ZONE_COLOURS.FVG }}/>FVG</span><span><i style={{ background: SMC_ZONE_COLOURS.Breaker }}/>Breaker</span><span className="smc-direction-key"><b>▲</b><em>▼</em></span></div>
    <button className={`smc-learn-button ${dark ? "smc-dark" : ""}`} onClick={() => setOpen(true)} aria-label="Open SMC Learner">SMC <span>Learn</span></button>
    {open && createPortal(<div className={`smc-backdrop ${dark ? "smc-dark" : ""}`} onPointerDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="smc-sheet" role="dialog" aria-modal="true" aria-label="SMC Learner" onKeyDown={e => {
        if (e.key !== "Tab") return;
        const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]'));
        const first = nodes[0], last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
        <header><div><small>PRICE ACTION · LEARNING LAB</small><h2>SMC Learner</h2></div><button ref={closeRef} onClick={() => setOpen(false)} aria-label="Close SMC Learner">×</button></header>
        <p className="smc-summary">{analysis.direction} · {timeframe}<br/><small>{replay ? "Only revealed replay candles are analysed." : "Live candle excluded: confirmations appear when the next bar starts."} Swings need 3 bars on each side.</small></p>
        <div className="smc-filters" aria-label="Visible SMC concepts">{Object.keys(groups).map(group => <button key={group} aria-pressed={filters.includes(group)} onClick={() => setFilters(v => v.includes(group) ? v.filter(g => g !== group) : [...v, group])}>{group}</button>)}</div>
        <p className="smc-note">Only untouched zones are shown: purple = order block, gold = FVG, pink = breaker. ▲ Bullish / potential support · ▼ Bearish / potential resistance. Zones disappear on the first retest, including a touch by the live candle.</p>
        <div className="smc-options"><label><input type="checkbox" checked={rangeVisible} onChange={e => setRangeVisible(e.target.checked)}/> Premium / discount range</label></div>
        {rangeVisible && <p className="smc-note">The latest confirmed swing high–low range is split at 50%. Premium and discount describe position in this range, not fair value or an entry recommendation.</p>}
        <label className="smc-lesson-select">Learn a concept<select value={lesson} onChange={e => { setLesson(e.target.value as SmcKind); setSelected(null); }}>{enabledKinds.map(k => <option key={k}>{k}</option>)}</select></label>
        <article ref={explanationRef} className="smc-explanation"><h3>{lesson}</h3><p>{SMC_LESSONS[lesson]}</p>{focused && <><strong>{focused.direction} · {focused.status}</strong><p>{focused.reason}</p><small>Source candle: {dateText(focused.origin)} IST<br/>Confirmation candle: {dateText(focused.confirmed)} IST — known after its close</small><button onClick={() => {
          const index = candles.findIndex(bar => bar.time === focused.confirmed);
          if (index >= 0) chart?.timeScale().setVisibleLogicalRange({ from: Math.max(-2, index - 24), to: index + 12 });
          setOpen(false);
        }}>Show this example on chart →</button></>}</article>
        <h3>Examples on this chart</h3><small>Latest 30 filtered examples; at most 24 visible marks on the chart. Tap an example to understand it.</small>
        <div className="smc-examples">{recent.length ? recent.map(m => <button key={m.id} aria-pressed={selected === m.id} onClick={() => showMark(m)}><b>{m.kind} <span>{m.direction}</span></b><small>{dateText(m.confirmed)} IST · {m.status} · {m.low.toFixed(2)}{m.high !== m.low ? `–${m.high.toFixed(2)}` : ""}</small></button>) : <p>No confirmed examples for these filters yet. Load more history or try another timeframe; patterns are never fabricated.</p>}</div>
        <p className="smc-note">Original OHLC-based teaching rules, not LuxAlgo or a Pine-script engine. No AI calls or credits while using this indicator. Definitions vary among educators; zones are candidates, not evidence of institutional orders. Uses loaded history only and does not cover every SMC methodology. Educational only, not buy/sell advice.</p>
      </section>
    </div>, document.body)}
  </>;
}
