"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { average } from "@/lib/study-calculations";
import { ema21EntryAt } from "@/lib/global-alerts";

/** Mark the actual trigger candle on the EMA 21 chart, without changing the other entry study. */
export function Ema21EntryMarks({ candles, chart, series, timeframe }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: Pick<ISeriesApi<"Candlestick">, "priceToCoordinate" | "attachPrimitive" | "detachPrimitive"> | null;
  timeframe: "5m" | "15m";
}) {
  const [, redraw] = useState(0);
  const last = candles.at(-1);
  const stamp = `${candles.length}:${last?.time}:${last?.open}:${last?.high}:${last?.low}:${last?.close}`;
  // The last candle may be forming; only that candle uses its observed close
  // for the breakout so a stale wick cannot look like a live green/red entry.
  const signals = useMemo(() => {
    const seconds = timeframe === "5m" ? 300 : 900;
    const values = average(candles.map(c => c.close), 21, "EMA");
    const hits: Array<{ time: number; price: number; side: "bullish" | "bearish" }> = [];
    for (let index = 24; index < candles.length; index++) {
      const bar = candles[index], forming = index === candles.length - 1;
      const side = ema21EntryAt(candles, index, values, seconds,
        forming ? bar.close : bar.high, forming ? bar.close : bar.low, bar.close);
      if (side) hits.push({ time: bar.time, price: side === "bullish" ? bar.low : bar.high, side });
    }
    return hits.slice(-80);
  // The feed can update the trailing candle in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, stamp, timeframe]);
  useLayoutEffect(() => {
    if (!chart || !series) return;
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw(value => value + 1); }); };
    const projection = { updateAllViews: refresh };
    chart.timeScale().subscribeVisibleLogicalRangeChange(refresh);
    series.attachPrimitive(projection);
    return () => {
      cancelAnimationFrame(frame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
      series.detachPrimitive(projection);
    };
  }, [chart, series]);
  if (!chart || !series || !signals.length) return null;
  const width = chart.timeScale().width();
  const height = chart.panes()[0]?.getHeight() ?? 0;
  return <svg className="chart-ema21-entries" width={width} height={height} aria-label="EMA 21 entry candles">
    {signals.map(signal => {
      const x = chart.timeScale().timeToCoordinate((signal.time + 19800) as UTCTimestamp);
      const y = series.priceToCoordinate(signal.price);
      if (x === null || y === null || x < 0 || x > width || y < 0 || y > height) return null;
      return <g key={signal.time}><title>{`${signal.side === "bullish" ? "Bullish" : "Bearish"} EMA 21 entry`}</title>
        <text x={x} y={y + (signal.side === "bullish" ? 19 : -7)} textAnchor="middle" fontSize={20} fontWeight={800} fill={signal.side === "bullish" ? "#009e73" : "#dc3355"}>{signal.side === "bullish" ? "↑" : "↓"}</text>
      </g>;
    })}
  </svg>;
}
