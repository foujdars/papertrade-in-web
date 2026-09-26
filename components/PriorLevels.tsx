"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { priorHighLows } from "@/lib/prior-levels";

function priceLabel(price: number) {
  return price.toLocaleString("en-IN", { maximumFractionDigits: price >= 1000 ? 1 : 2 });
}

const ROWS = [
  { key: "day", high: "PDH", low: "PDL", highClass: "high", lowClass: "low" },
  { key: "week", high: "PWH", low: "PWL", highClass: "week-high", lowClass: "week-low" },
  { key: "month", high: "PMH", low: "PML", highClass: "month-high", lowClass: "month-low" },
] as const;

export function PriorLevels({ candles, chart, series, timeframe, session, refreshRef, onAlert }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  session: boolean;
  refreshRef: MutableRefObject<(() => void) | null>;
  onAlert?: (price: number) => void;
}) {
  const [, redraw] = useState(0);
  const stamp = candles.length ? `${candles.length}:${candles[0]?.time}:${candles.at(-1)?.time}:${candles.at(-1)?.close}` : "";
  const levels = useMemo(() => priorHighLows(candles, timeframe, session), [candles, timeframe, session, stamp]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    const scale = chart?.timeScale();
    scale?.subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      scale?.unsubscribeVisibleLogicalRangeChange(refresh);
      refreshRef.current = null;
    };
  }, [refreshRef, chart, stamp]);
  if (timeframe === "1Y") return <div className="chart-or-note">Prior highs need a monthly chart or lower</div>;
  if (!levels) return <div className="chart-or-note">Earlier day, week or month is not on this chart yet</div>;
  if (!chart || !series) return null;
  const pane = chart.paneSize(0);
  const width = Math.max(0, pane.width - chart.priceScale("right").width());
  const marks = ROWS.flatMap((row) => {
    const span = levels[row.key];
    if (!span) return [];
    return [
      { key: row.high, label: row.high, price: span.high, className: row.highClass },
      { key: row.low, label: row.low, price: span.low, className: row.lowClass },
    ];
  });
  return <div className="chart-previous-day" aria-label="Previous day, week and month highs and lows">
    {marks.map((row) => {
      const y = series.priceToCoordinate(row.price);
      if (y == null || y < 8 || y > pane.height - 8) return null;
      return <div key={row.key} className={`chart-pd-line chart-prior-line ${row.className}`} style={{ top: y, width }}>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAlert?.(row.price); }} aria-label={`${row.label} ${priceLabel(row.price)}. Set alert`} title={`${row.label} ${priceLabel(row.price)}`}>{row.label}</button>
      </div>;
    })}
  </div>;
}
