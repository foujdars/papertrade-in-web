"use client";

import { useEffect, useMemo, useState, type MutableRefObject, type RefObject } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import type { StudyConfig } from "@/lib/indicator-catalog";
import { studyDefaults } from "@/lib/indicator-catalog";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { psbbPlots, type PsbbSetup } from "@/lib/psbb";

const PSBB_TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"];

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.paneSize(pane).height;
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
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.close}` : "";
  const optionKey = JSON.stringify(config?.inputs ?? null);
  const inputs = useMemo(() => ({ ...studyDefaults("psbb").inputs, ...config?.inputs, target1: config?.inputs?.target1 || 1, target2: config?.inputs?.target2 || 1.5 }), [optionKey]);
  const allowed = PSBB_TIMEFRAMES.includes(timeframe);
  const setup = useMemo(() => allowed ? psbbPlots(candles, inputs).at(-1) ?? null : null, [allowed, candles, inputs, stamp]);
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
  if (!setup || !chart || !series) return setup ? null : <div className="chart-or-note">No RSI divergence on this timeframe</div>;
  const shift = timeframe === "1D" ? 0 : 19_800;
  const plotWidth = chart.timeScale().width();
  const paneCount = chart.panes().length;
  let height = 0;
  for (let pane = 0; pane < paneCount; pane += 1) height += chart.paneSize(pane).height;
  const xOf = (time: number) => {
    const x = chart.timeScale().timeToCoordinate((time + shift) as UTCTimestamp);
    return x == null ? null : Math.max(0, Math.min(plotWidth, x));
  };
  const yOf = (price: number) => series.priceToCoordinate(price);
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
  const levels = Number.isFinite(setup.entry) && Number.isFinite(setup.stop) ? [
    ["SL", setup.stop, "stop"],
    ["E", setup.entry, "entry"],
    ["T1", setup.target1, "target"],
    ["T2", setup.target2, "target"],
  ] as const : [];
  const levelX = xOf(setup.entryTime) ?? x2 ?? 0;
  return <svg className="chart-psbb" width={plotWidth} height={height} aria-label={`${timeframe} ${setup.side} divergence`}>
    {x1 != null && x2 != null && y1 != null && y2 != null && <line className="chart-psbb-diverge" x1={x1} y1={y1} x2={x2} y2={y2} />}
    {x1 != null && x2 != null && ry1 != null && ry2 != null && <line className="chart-psbb-diverge" x1={x1} y1={ry1} x2={x2} y2={ry2} />}
    {levels.map(([name, price, tone]) => {
      const y = yOf(price);
      if (y == null) return null;
      return <g key={name}>
        <line className={`chart-psbb-level ${tone}`} x1={levelX} y1={y} x2={plotWidth - 28} y2={y} />
        <text className={`chart-psbb-level ${tone}`} x={plotWidth - 26} y={y + 3}>{name}</text>
      </g>;
    })}
  </svg>;
}
