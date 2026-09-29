"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { ema5ReversalAt, emaSeries } from "@/lib/ema5-reversal";

/** Mark closed BTC candles whose low has just lifted off EMA 5. */
export function Ema5ReversalMarks({ candles, chart, series, timeframe }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: Pick<ISeriesApi<"Candlestick">, "priceToCoordinate" | "attachPrimitive" | "detachPrimitive"> | null;
  timeframe: "5m" | "15m";
}) {
  const [, redraw] = useState(0);
  const last = candles.at(-1);
  const stamp = `${candles.length}:${last?.time}:${last?.open}:${last?.high}:${last?.low}:${last?.close}`;
  const signals = useMemo(() => {
    const seconds = timeframe === "5m" ? 300 : 900;
    const values = emaSeries(candles.map((bar) => bar.close), 5);
    const hits: Array<{ time: number; price: number }> = [];
    for (let index = 5; index < candles.length - 1; index++) {
      if (ema5ReversalAt(candles, index, values, seconds)) hits.push({ time: candles[index].time, price: candles[index].low });
    }
    return hits.slice(-80);
  // The feed can update the trailing candle in place.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, stamp, timeframe]);
  useLayoutEffect(() => {
    if (!chart || !series) return;
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
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
  return <svg className="chart-ema5-entries" width={width} height={height} aria-label="5 EMA reversal candles">
    {signals.map((signal) => {
      const x = chart.timeScale().timeToCoordinate((signal.time + 19800) as UTCTimestamp);
      const y = series.priceToCoordinate(signal.price);
      if (x === null || y === null || x < 0 || x > width || y < 0 || y > height) return null;
      return <g key={signal.time}><title>5 EMA reversal</title>
        <text x={x} y={y + 19} textAnchor="middle" fontSize={20} fontWeight={800} fill="#0ea5e9">↑</text>
      </g>;
    })}
  </svg>;
}
