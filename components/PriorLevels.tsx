"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import type { StudyConfig } from "@/lib/indicator-catalog";
import { studyDefaults } from "@/lib/indicator-catalog";
import { comparisonRequest } from "@/lib/chart-compare";
import { priorMarks, priorOptionsFromInputs } from "@/lib/prior-levels";

function priceLabel(price: number) {
  return price.toLocaleString("en-IN", { maximumFractionDigits: price >= 1000 ? 1 : 2 });
}

export function PriorLevels({ candles, chart, series, timeframe, instrumentKey, config, refreshRef, onAlert }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  instrumentKey: string;
  config?: StudyConfig;
  refreshRef: MutableRefObject<(() => void) | null>;
  onAlert?: (price: number) => void;
}) {
  const [, redraw] = useState(0);
  const [daily, setDaily] = useState<Candle[]>([]);
  const [dailyState, setDailyState] = useState<"loading" | "ready" | "error">("loading");
  const stamp = candles.length ? `${candles.length}:${candles[0]?.time}:${candles.at(-1)?.time}` : "";
  const options = priorOptionsFromInputs(config?.inputs ?? studyDefaults("prior-levels").inputs);
  useEffect(() => {
    const controller = new AbortController();
    setDaily([]);
    setDailyState("loading");
    void fetch(instrumentKey.startsWith("DELTA|") || instrumentKey.startsWith("TVC|") ? comparisonRequest(instrumentKey, "1D") : `/api/upstox/candles?${new URLSearchParams({ instrumentKey, timeframe: "1D", years: "3" })}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { candles?: Candle[] }) => { if (controller.signal.aborted) return; if (Array.isArray(payload.candles) && payload.candles.length) { setDaily(payload.candles); setDailyState("ready"); } else setDailyState("error"); })
      .catch(() => { if (!controller.signal.aborted) setDailyState("error"); });
    return () => controller.abort();
  }, [instrumentKey]);
  const marks = useMemo(() => priorMarks(daily.length ? daily : candles, options), [daily, candles, options, stamp]);
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
  }, [refreshRef, chart, stamp, daily.length]);
  if (timeframe === "1Y") return <div className="chart-or-note">Prior highs need a monthly chart or lower</div>;
  if (!marks.length) return <div className="chart-or-note">{dailyState === "loading" ? "Loading prior highs and lows" : dailyState === "error" ? "Daily history for these levels is unavailable" : "Turn on a period in the indicator settings"}</div>;
  if (!chart || !series) return null;
  const plotRight = chart.timeScale().width();
  const labelAt = Math.max(0, plotRight - 34);
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19_800;
  const placed = [...marks].sort((a, b) => b.price - a.price);
  let labelY = -999;
  return <div className="chart-previous-day" aria-label="Prior highs and lows">
    {placed.map((row) => {
      const y = series.priceToCoordinate(row.price);
      if (y == null || y < 8 || y > (chart.paneSize(0).height - 8)) return null;
      const raw = chart.timeScale().timeToCoordinate((row.time + shift) as UTCTimestamp);
      const start = raw == null || raw < 0 ? 0 : Math.min(raw, labelAt - 8);
      const textY = y < labelY + 12 ? labelY + 12 : y;
      labelY = textY;
      return <div key={row.id} className={`chart-prior-mark ${row.tone}`}>
        {labelAt - 4 - start > 2 && <i className="chart-prior-line" style={{ top: y, left: start, width: labelAt - 4 - start }} />}
        <button type="button" className="chart-prior-label" style={{ top: textY, left: labelAt }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onAlert?.(row.price); }} aria-label={`${row.label} ${priceLabel(row.price)}. Set alert`} title={`${row.label} ${priceLabel(row.price)}`}>{row.label}</button>
      </div>;
    })}
  </div>;
}
