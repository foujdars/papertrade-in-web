"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { openingRangeSupported, openingRanges } from "@/lib/opening-range";

const IST_OFFSET_SECONDS = 19_800;

function priceLabel(price: number) {
  return price.toLocaleString("en-IN", { maximumFractionDigits: price >= 1000 ? 1 : 2 });
}

export function OpeningRange({ candles, chart, series, timeframe, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [, redraw] = useState(0);
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.high}:${candles.at(-1)?.low}` : "";
  const ranges = useMemo(() => openingRanges(candles, timeframe), [candles, timeframe, stamp]);
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
  }, [refreshRef, chart, candles, stamp]);
  if (!openingRangeSupported(timeframe)) return <div className="chart-or-note">Opening range needs 15m or lower</div>;
  if (!chart || !series || !ranges.length) return null;
  const shift = IST_OFFSET_SECONDS;
  const scale = chart.timeScale();
  const pane = chart.paneSize(0);
  const plotRight = chart.priceScale("right").width();
  const plotWidth = Math.max(0, pane.width - plotRight);
  const xOf = (epoch: number) => {
    const chartTime = (epoch + shift) as UTCTimestamp;
    const exact = scale.timeToCoordinate(chartTime);
    if (exact != null) return exact;
    let lo = 0;
    let hi = candles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time < epoch) lo = mid + 1;
      else hi = mid;
    }
    const next = candles[lo];
    const prev = candles[lo - 1];
    const at = (time: number) => scale.timeToCoordinate((time + shift) as UTCTimestamp);
    if (prev && next) {
      const left = at(prev.time);
      const right = at(next.time);
      const span = next.time - prev.time;
      if (left == null || right == null || span <= 0) return null;
      return left + ((epoch - prev.time) / span) * (right - left);
    }
    return null;
  };
  return <>
    {ranges.map((range) => {
      const yHigh = series.priceToCoordinate(range.high);
      const yLow = series.priceToCoordinate(range.low);
      const xStart = xOf(range.start);
      const xEnd = xOf(range.end);
      const xExtend = range.complete ? xOf(range.extend) : xEnd;
      if (yHigh == null || yLow == null || xStart == null || xEnd == null || xExtend == null) return null;
      const top = Math.min(yHigh, yLow);
      const height = Math.max(2, Math.abs(yLow - yHigh));
      const boxLeft = Math.max(0, Math.min(xStart, xEnd));
      const boxRight = Math.min(plotWidth, Math.max(xStart, xEnd));
      const lineRight = Math.min(plotWidth, Math.max(xEnd, xExtend));
      const lineLeft = Math.max(0, Math.min(xEnd, xExtend));
      return <div key={range.date} className="chart-opening-range" aria-hidden="true">
        {boxRight - boxLeft > 1 && <div className="chart-or-box" style={{ left: boxLeft, width: boxRight - boxLeft, top, height }} />}
        {range.complete && lineRight - lineLeft > 1 && <>
          <div className="chart-or-line high" style={{ left: lineLeft, width: lineRight - lineLeft, top: yHigh }} />
          <div className="chart-or-line low" style={{ left: lineLeft, width: lineRight - lineLeft, top: yLow }} />
          <span className="chart-or-tag high" style={{ left: Math.max(8, lineRight - 4), top: yHigh }}>ORH {priceLabel(range.high)}</span>
          <span className="chart-or-tag low" style={{ left: Math.max(8, lineRight - 4), top: yLow }}>ORL {priceLabel(range.low)}</span>
        </>}
      </div>;
    })}
  </>;
}
