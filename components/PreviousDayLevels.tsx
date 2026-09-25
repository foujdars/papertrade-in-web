"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { previousDayLevels } from "@/lib/previous-day";

function priceLabel(price: number) {
  return price.toLocaleString("en-IN", { maximumFractionDigits: price >= 1000 ? 1 : 2 });
}

export function PreviousDayLevels({ candles, chart, series, timeframe, session, refreshRef, onAlert }: {
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
  const levels = useMemo(() => previousDayLevels(candles, timeframe, session), [candles, timeframe, session, stamp]);
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
  if (["1W", "1M", "1Y"].includes(timeframe)) return <div className="chart-or-note">Previous day needs a daily or intraday chart</div>;
  if (!levels) return <div className="chart-or-note">Yesterday’s full range is not on this chart yet</div>;
  if (!chart || !series) return null;
  const pane = chart.paneSize(0);
  const width = Math.max(0, pane.width - chart.priceScale("right").width());
  const rows = [
    { key: "high", label: "PDH", price: levels.high, className: "high" },
    { key: "close", label: "PDC", price: levels.close, className: "close" },
    { key: "low", label: "PDL", price: levels.low, className: "low" },
  ];
  return <div className="chart-previous-day" aria-label={`Previous day ${levels.date}`}>
    {rows.map((row) => {
      const y = series.priceToCoordinate(row.price);
      if (y == null || y < 8 || y > pane.height - 8) return null;
      return <div key={row.key} className={`chart-pd-line ${row.className}`} style={{ top: y, width }}>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAlert?.(row.price); }}>{row.label} {priceLabel(row.price)}{onAlert ? " · Alert" : ""}</button>
      </div>;
    })}
  </div>;
}
