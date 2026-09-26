"use client";

import { useEffect, useMemo, useState, type MutableRefObject, type RefObject } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import type { StudyConfig } from "@/lib/indicator-catalog";
import { studyDefaults } from "@/lib/indicator-catalog";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { psbbAnalysis, PSBB_TIMEFRAMES } from "@/lib/psbb";

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.panes()[pane]?.getHeight() ?? 0;
  return top;
}

export function PsbbMarks({ candles, chart, series, timeframe, config, refreshRef, studyRenderer }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  config?: StudyConfig;
  refreshRef: MutableRefObject<(() => void) | null>;
  studyRenderer: RefObject<ChartStudyRenderer | null>;
}) {
  const [, redraw] = useState(0);
  const closed = candles.at(-2);
  const stamp = `${candles.length}:${candles.at(-1)?.time}:${closed?.high}:${closed?.low}:${closed?.close}`;
  const inputs = useMemo(() => ({ ...studyDefaults("psbb").inputs, ...config?.inputs, target1: config?.inputs?.target1 || 1, target2: config?.inputs?.target2 || 1.5 }), [config?.inputs]);
  const allowed = PSBB_TIMEFRAMES.some((value) => value === timeframe) && (!config?.timeframes.length || config.timeframes.includes(timeframe));
  // Candle arrays can be updated in place by the live feed; the closed-bar stamp
  // invalidates this calculation without recalculating on every forming tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const analysis = useMemo(() => allowed ? psbbAnalysis(candles, inputs, timeframe) : { setups: [], anchors: [] }, [allowed, candles, inputs, stamp, timeframe]);
  const setup = analysis.setups.at(-1);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    const scale = chart?.timeScale();
    scale?.subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => { cancelAnimationFrame(frame); scale?.unsubscribeVisibleLogicalRangeChange(refresh); refreshRef.current = null; };
  }, [refreshRef, chart, stamp, setup?.secondTime, setup?.status]);
  if (!allowed) return <div className="chart-or-note">PSBB divergence is shown on 1m, 5m, 15m, 1H, 4H and 1D</div>;
  if (!chart || !series) return null;
  const shift = timeframe === "1D" ? 0 : 19_800;
  const plotWidth = chart.timeScale().width();
  const paneCount = chart.panes().length;
  let height = 0;
  for (let pane = 0; pane < paneCount; pane += 1) height += chart.panes()[pane]?.getHeight() ?? 0;
  const xOf = (time: number) => {
    const x = chart.timeScale().timeToCoordinate((time + shift) as UTCTimestamp);
    return x == null ? null : Math.max(0, Math.min(plotWidth, x));
  };
  const yOf = (price: number) => series.priceToCoordinate(price);
  const anchorMarks = analysis.anchors.filter((anchor) => anchor.time !== setup?.firstTime).map((anchor) => {
    const x = xOf(anchor.time), y = yOf(anchor.price);
    return x === null || y === null ? null : <text key={`${anchor.side}:${anchor.time}`} className="chart-psbb-point" x={Math.max(12, x)} y={y + (anchor.side === "short" ? -8 : 14)}>D1</text>;
  });
  if (!setup) return <><div className="chart-or-note">{analysis.anchors.length ? "PSBB · D1 marked · Waiting for divergence" : "PSBB · Waiting for RSI to cross 70 or 30"}</div><svg className="chart-psbb" width={plotWidth} height={height} aria-label="PSBB threshold anchors">{anchorMarks}</svg></>;
  const x1 = xOf(setup.firstTime);
  const x2 = xOf(setup.secondTime);
  const y1 = yOf(setup.firstPrice);
  const y2 = yOf(setup.secondPrice);
  const rsi = studyRenderer.current?.bundles.find((bundle) => bundle.id === "rsi");
  const rsiSeries = rsi?.series[0] as ISeriesApi<"Line"> | undefined;
  const rsiBase = rsi ? paneTop(chart, rsi.pane) : 0;
  const rsiY = (value: number) => {
    const y = rsiSeries?.priceToCoordinate(value);
    return y == null ? null : y + rsiBase;
  };
  const ry1 = rsiY(setup.firstRsi);
  const ry2 = rsiY(setup.secondRsi);
  const levels = setup.shifted && setup.entry !== null && setup.stop !== null && setup.target1 !== null && setup.target2 !== null ? [
    ["SL", setup.stop, "stop"],
    ["E", setup.entry, "entry"],
    ["TP1", setup.target1, "target"],
    ["TP2", setup.target2, "target"],
  ] as const : [];
  const levelX = xOf(setup.mssTime ?? setup.secondTime) ?? x2 ?? 0;
  const waitingY = setup.entry === null ? null : yOf(setup.entry);
  const waitingX = setup.entryTime === null ? null : xOf(setup.entryTime);
  const swing = setup.side === "short" ? "swing low" : "swing high";
  const status = setup.phase === "waiting-structure" ? `Waiting for new ${swing}`
    : setup.phase === "waiting-mss" ? "Waiting for MSS close"
    : setup.status === "passed" ? "TP2 reached" : setup.status === "failed" ? "Stop reached"
    : setup.target1Hit ? "TP1 reached · TP2 active" : "MSS confirmed";
  const description = `${timeframe} PSBB · ${setup.side === "short" ? "Bearish" : "Bullish"}${setup.structureCase ? ` · Case ${setup.structureCase === "before" ? "A" : "B"}` : ""} · ${status}`;
  return <><div className="chart-or-note">{description}</div><svg className="chart-psbb" width={plotWidth} height={height} aria-label={description}>
    {anchorMarks}
    {x1 != null && x2 != null && y1 != null && y2 != null && <line className="chart-psbb-diverge" x1={x1} y1={y1} x2={x2} y2={y2} />}
    {x1 != null && x2 != null && ry1 != null && ry2 != null && <line className="chart-psbb-diverge" x1={x1} y1={ry1} x2={x2} y2={ry2} />}
    {x1 != null && y1 != null && <text className="chart-psbb-point" x={Math.max(12, x1)} y={y1 + (setup.side === "short" ? -8 : 14)}>D1</text>}
    {x2 != null && y2 != null && <text className="chart-psbb-point" x={Math.max(12, x2)} y={y2 + (setup.side === "short" ? -8 : 14)}>{setup.side === "short" ? "SH" : "SL"}</text>}
    {!setup.shifted && waitingX != null && waitingY != null && <g>
      <line className="chart-psbb-level entry waiting" x1={waitingX} y1={waitingY} x2={plotWidth - 4} y2={waitingY} />
      <text className="chart-psbb-level entry" textAnchor="end" x={plotWidth - 6} y={waitingY - 4}>MSS?</text>
    </g>}
    {levels.map(([name, price, tone]) => {
      const y = yOf(price);
      if (y == null) return null;
      return <g key={name}>
        <line className={`chart-psbb-level ${tone}${setup.extended && name === "E" ? " extended" : ""}`} x1={levelX} y1={y} x2={plotWidth - 4} y2={y} />
        <text className={`chart-psbb-level ${tone}`} textAnchor="end" x={plotWidth - 6} y={y - 4}>{name}</text>
      </g>;
    })}
  </svg></>;
}
