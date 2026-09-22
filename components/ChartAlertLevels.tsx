"use client";
import { useEffect, useState } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import type { PriceTask } from "@/lib/price-actions";

/** Screen-space annotations never change the chart's autoscale or intercept gestures. */
export function ChartAlertLevels({ chart, series, tasks, instrumentKey, dark }: {
  chart: IChartApi | null; series: ISeriesApi<"Candlestick"> | ISeriesApi<any> | null;
  tasks: PriceTask[]; instrumentKey: string; dark: boolean;
}) {
  const [layout, setLayout] = useState({ width: 0, height: 0, levels: [] as { id: string; price: number; y: number }[] });
  useEffect(() => {
    if (!chart || !series) return;
    let frame = 0, previous = "";
    const draw = () => {
      const width = chart.timeScale().width(), height = chart.panes()[0]?.getHeight() ?? 0;
      const levels = tasks.filter(t => t.kind === "alert" && t.status === "pending" && t.expiresAt > Date.now() && t.instrument.instrumentKey === instrumentKey).flatMap(t => {
        const y = series.priceToCoordinate(t.price);
        return y !== null && y >= 0 && y <= height ? [{ id: t.id, price: t.price, y }] : [];
      });
      const next = { width, height, levels }, key = JSON.stringify(next);
      if (key !== previous) { previous = key; setLayout(next); }
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [chart, series, tasks, instrumentKey]);
  return <svg className="chart-alert-levels" width={layout.width} height={layout.height} aria-label="Active alert price levels" style={{ color: dark ? "#c4b5fd" : "#62547d" }}>
    {layout.levels.map(level => <g key={level.id} data-alert-id={level.id} data-alert-price={level.price}>
      <title>Alert at ₹{level.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</title>
      <line x1={0} x2={layout.width - 8} y1={level.y} y2={level.y} stroke="currentColor" strokeWidth={1} strokeDasharray="5 5" opacity={.8} />
      <path d={`M${layout.width - 8},${level.y - 5} l6,5 l-6,5 Z`} fill="currentColor" />
      <text x={layout.width - 14} y={Math.max(12, level.y - 6)} textAnchor="end" fill="currentColor" fontSize={11}>₹{level.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</text>
    </g>)}
  </svg>;
}
