"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import type { StudyConfig } from "@/lib/indicator-catalog";
import { studyDefaults } from "@/lib/indicator-catalog";
import { psbbPlots, type PsbbSetup } from "@/lib/psbb";

function yOf(series: { priceToCoordinate: (price: number) => number | null }, price: number, height: number) {
  const y = series.priceToCoordinate(price);
  if (y == null) return null;
  return Math.min(height - 8, Math.max(8, y));
}

export function PsbbMarks({ candles, chart, series, timeframe, config, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  config?: StudyConfig;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [, redraw] = useState(0);
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.close}` : "";
  const optionKey = JSON.stringify(config?.inputs ?? null);
  const inputs = useMemo(() => config?.inputs ?? studyDefaults("psbb").inputs, [optionKey]);
  const setups = useMemo(() => psbbPlots(candles, inputs), [candles, inputs, stamp]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    const scale = chart?.timeScale();
    scale?.subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => { cancelAnimationFrame(frame); scale?.unsubscribeVisibleLogicalRangeChange(refresh); refreshRef.current = null; };
  }, [refreshRef, chart, stamp]);
  if (!setups.length) return <div className="chart-or-note">No PSBB setup in these candles</div>;
  if (!chart || !series) return null;
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19_800;
  const width = chart.timeScale().width();
  const height = chart.paneSize(0).height;
  const xOf = (time: number) => {
    const x = chart.timeScale().timeToCoordinate((time + shift) as UTCTimestamp);
    return x == null ? 0 : Math.max(0, Math.min(width - 8, x));
  };
  return <div className="chart-psbb" aria-label="PSBB setups">
    {setups.map((setup) => <Setup key={`${setup.side}:${setup.start}`} setup={setup} x1={xOf(setup.start)} x2={Math.max(xOf(setup.start) + 28, xOf(setup.end))} series={series} height={height} />)}
  </div>;
}

function Setup({ setup, x1, x2, series, height }: { setup: PsbbSetup; x1: number; x2: number; series: { priceToCoordinate: (price: number) => number | null }; height: number }) {
  const rows = [
    ["Trigger", setup.trigger],
    ["Stop", setup.stop],
    ["Target 1", setup.target1],
    ["Target 2", setup.target2],
  ] as const;
  const label = setup.status === "success" ? "SUCCESS" : setup.status === "failed" ? "FAILED" : "FORMED";
  const anchor = yOf(series, setup.trigger, height);
  return <>
    {rows.map(([name, price]) => {
      const y = yOf(series, price, height);
      if (y == null || x2 - x1 < 4) return null;
      return <i key={name} className={`chart-psbb-line ${name === "Stop" ? "stop" : name.startsWith("Target") ? "target" : "trigger"}`} style={{ top: y, left: x1, width: x2 - x1 }} />;
    })}
    {anchor != null && <b className={`chart-psbb-tag ${setup.status}`} style={{ top: anchor, left: Math.min(x2, x1 + 72) }}>{label}</b>}
  </>;
}
