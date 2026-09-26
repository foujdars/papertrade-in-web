"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import type { StudyConfig } from "@/lib/indicator-catalog";
import { studyDefaults } from "@/lib/indicator-catalog";
import { comparisonRequest } from "@/lib/chart-compare";
import { psbbPlots, type PsbbSetup } from "@/lib/psbb";

const PSBB_TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;

function yOf(series: { priceToCoordinate: (price: number) => number | null }, price: number, height: number) {
  const y = series.priceToCoordinate(price);
  if (y == null) return null;
  return Math.min(height - 8, Math.max(8, y));
}

export function PsbbMarks({ candles, chart, series, timeframe, instrumentKey, config, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  instrumentKey: string;
  config?: StudyConfig;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [, redraw] = useState(0);
  const [extra, setExtra] = useState<Record<string, Candle[]>>({});
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.close}` : "";
  const optionKey = JSON.stringify(config?.inputs ?? null);
  const inputs = useMemo(() => config?.inputs ?? studyDefaults("psbb").inputs, [optionKey]);
  const allowed = PSBB_TIMEFRAMES.includes(timeframe as typeof PSBB_TIMEFRAMES[number]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const frames = PSBB_TIMEFRAMES.filter((frame) => frame !== timeframe);
    void Promise.all(frames.map(async (frame) => {
      try {
        const response = await fetch(comparisonRequest(instrumentKey, frame), { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { candles?: Candle[] };
        return [frame, Array.isArray(payload.candles) ? payload.candles : []] as const;
      } catch {
        return [frame, []] as const;
      }
    })).then((rows) => { if (!controller.signal.aborted) setExtra(Object.fromEntries(rows)); });
    return () => controller.abort();
  }, [instrumentKey, timeframe, allowed]);
  const setups = useMemo(() => {
    if (!allowed) return [];
    const sources: Array<[string, Candle[]]> = [[timeframe, candles], ...PSBB_TIMEFRAMES.filter((frame) => frame !== timeframe).map((frame) => [frame, extra[frame] ?? []] as [string, Candle[]])];
    return sources.flatMap(([frame, source]) => {
      const latest = psbbPlots(source, inputs).at(-1);
      return latest ? [{ ...latest, frame }] : [];
    });
  }, [allowed, timeframe, candles, extra, inputs, stamp]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    const scale = chart?.timeScale();
    scale?.subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => { cancelAnimationFrame(frame); scale?.unsubscribeVisibleLogicalRangeChange(refresh); refreshRef.current = null; };
  }, [refreshRef, chart, stamp, setups.length]);
  if (!allowed) return <div className="chart-or-note">PSBB is shown on 1m, 5m, 15m, 1H, 4H and 1D</div>;
  if (!setups.length) return <div className="chart-or-note">No PSBB setup on 1m, 5m, 15m, 1H, 4H or 1D</div>;
  if (!chart || !series) return null;
  const shift = timeframe === "1D" ? 0 : 19_800;
  const width = chart.timeScale().width();
  const height = chart.paneSize(0).height;
  const xOf = (time: number) => chart.timeScale().timeToCoordinate((time + shift) as UTCTimestamp);
  let labelY = -999;
  return <div className="chart-psbb" aria-label="PSBB setups">
    {setups.map((setup) => {
      const start = xOf(setup.start);
      const finish = xOf(setup.end);
      const x1 = setup.frame === timeframe && start != null ? Math.max(0, start) : 8;
      const x2 = setup.status === "formed" || finish == null ? width - 8 : Math.max(x1 + 36, Math.min(width - 8, finish));
      const anchor = yOf(series, setup.trigger, height);
      const top = anchor == null ? null : anchor < labelY + 14 ? labelY + 14 : anchor;
      if (top != null) labelY = top;
      return <Setup key={`${setup.frame}:${setup.side}:${setup.start}`} setup={setup} x1={x1} x2={x2} tagTop={top} series={series} height={height} />;
    })}
  </div>;
}

function Setup({ setup, x1, x2, tagTop, series, height }: { setup: PsbbSetup & { frame: string }; x1: number; x2: number; tagTop: number | null; series: { priceToCoordinate: (price: number) => number | null }; height: number }) {
  const rows = [["Trigger", setup.trigger], ["Stop", setup.stop], ["Target 1", setup.target1], ["Target 2", setup.target2]] as const;
  const label = setup.status === "success" ? "SUCCESS" : setup.status === "failed" ? "FAILED" : "FORMED";
  return <>
    {rows.map(([name, price]) => {
      const y = yOf(series, price, height);
      if (y == null || x2 - x1 < 4) return null;
      return <i key={name} className={`chart-psbb-line ${name === "Stop" ? "stop" : name.startsWith("Target") ? "target" : "trigger"}`} style={{ top: y, left: x1, width: x2 - x1 }} />;
    })}
    {tagTop != null && <b className={`chart-psbb-tag ${setup.status}`} style={{ top: tagTop, left: Math.min(x2, x1 + 8) }}>{setup.frame} {label}</b>}
  </>;
}
