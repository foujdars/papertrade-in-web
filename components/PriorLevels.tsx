"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { LineSeries } from "lightweight-charts";
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
  const optionKey = JSON.stringify(config?.inputs ?? null);
  const options = useMemo(() => priorOptionsFromInputs(config?.inputs ?? studyDefaults("prior-levels").inputs), [optionKey]);
  useEffect(() => {
    const controller = new AbortController();
    setDaily([]);
    setDailyState("loading");
    void fetch(instrumentKey.startsWith("DELTA|") || instrumentKey.startsWith("TVC|") ? comparisonRequest(instrumentKey, "1D") : `/api/upstox/candles?${new URLSearchParams({ instrumentKey, timeframe: "1D", years: "5" })}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((payload: { candles?: Candle[] }) => { if (controller.signal.aborted) return; if (Array.isArray(payload.candles) && payload.candles.length) { setDaily(payload.candles); setDailyState("ready"); } else setDailyState("error"); })
      .catch(() => { if (!controller.signal.aborted) setDailyState("error"); });
    return () => controller.abort();
  }, [instrumentKey]);
  const source = daily.length ? daily : timeframe === "1Y" ? [] : candles;
  const marks = useMemo(() => priorMarks(source, options), [source, options, stamp]);
  const markKey = marks.map((mark) => `${mark.id}:${mark.price}:${mark.time}`).join("|");
  useEffect(() => {
    if (!chart || !marks.length) return;
    const minValue = Math.min(...marks.map((mark) => mark.price));
    const maxValue = Math.max(...marks.map((mark) => mark.price));
    let guide: ISeriesApi<"Line"> | null = null;
    try {
      guide = chart.addSeries(LineSeries, {
        color: "transparent",
        lineVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => ({ priceRange: { minValue, maxValue } }),
      });
      const last = candles.at(-1);
      if (last) {
        const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19_800;
        guide.setData([{ time: (Number(last.time) + shift) as UTCTimestamp, value: (minValue + maxValue) / 2 }]);
      }
    } catch { guide = null; }
    return () => { if (guide) try { chart.removeSeries(guide); } catch { /* The chart can already be gone when the timeframe changes. */ } };
  }, [chart, markKey, timeframe, candles.at(-1)?.time]);
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
  if (!marks.length) return <div className="chart-or-note">{dailyState === "loading" ? "Loading prior highs and lows" : dailyState === "error" ? "Daily history for these levels is unavailable" : "Turn on a period in the indicator settings"}</div>;
  if (!chart || !series) return null;
  const plotRight = chart.timeScale().width();
  const labelAt = Math.max(0, plotRight - 34);
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19_800;
  const height = chart.paneSize(0).height;
  const range = chart.priceScale("right").getVisibleRange();
  const placed = [...marks].sort((a, b) => b.price - a.price);
  let labelY = -999;
  return <div className="chart-previous-day" aria-label="Prior highs and lows">
    {placed.map((row) => {
      let y = series.priceToCoordinate(row.price);
      if (y == null || y < 8 || y > height - 8) {
        if (!range) return null;
        if (row.price >= range.to) y = 10;
        else if (row.price <= range.from) y = height - 10;
        else return null;
      }
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
