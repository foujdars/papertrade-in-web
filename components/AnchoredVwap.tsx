"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { LineSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { anchoredVwap } from "@/lib/anchored-vwap";

const CALENDAR = new Set(["1D", "1W", "1M", "1Y"]);
const storageKey = (instrumentKey: string) => `papertrade-anchored-vwap:${instrumentKey}`;

function chartTime(epoch: number, timeframe: string) {
  return Math.floor(epoch + (CALENDAR.has(timeframe) ? 0 : 19_800)) as UTCTimestamp;
}

function epochFromClick(time: Time, timeframe: string) {
  if (typeof time === "number") return time - (CALENDAR.has(timeframe) ? 0 : 19_800);
  if (typeof time === "string") return Math.floor(Date.parse(time) / 1000);
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

export function AnchoredVwap({ candles, chart, timeframe, instrumentKey, activeTool, replay, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  timeframe: string;
  instrumentKey: string;
  activeTool: string;
  replay: boolean;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [x, setX] = useState<number | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.close}:${candles.at(-1)?.volume}` : "";
  const hasVolume = candles.some((candle) => candle.volume > 0);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey(instrumentKey)));
    setAnchor(Number.isFinite(saved) && saved > 0 ? saved : null);
  }, [instrumentKey]);

  useEffect(() => {
    if (!chart || anchor === null || !hasVolume) return;
    const series = chart.addSeries(LineSeries, { color: "#d946ef", lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: true, title: "AVWAP" });
    seriesRef.current = series;
    return () => {
      seriesRef.current = null;
      chart.removeSeries(series);
    };
  }, [chart, anchor, hasVolume]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || anchor === null) return;
    const points = anchoredVwap(candles, anchor).map((point) => ({ time: chartTime(point.time, timeframe), value: point.value }));
    series.setData(points);
  }, [anchor, timeframe, stamp, candles]);

  useEffect(() => {
    if (!chart || activeTool !== "cursor" || replay) return;
    const onClick = (param: { time?: Time }) => {
      if (param.time === undefined) return;
      const epoch = epochFromClick(param.time, timeframe);
      const candle = [...candles].reverse().find((item) => item.time <= epoch) ?? candles.find((item) => item.time >= epoch);
      if (!candle) return;
      window.localStorage.setItem(storageKey(instrumentKey), String(candle.time));
      setAnchor(candle.time);
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [chart, activeTool, candles, timeframe, instrumentKey, replay]);

  useEffect(() => {
    let frame = 0;
    const place = () => {
      if (!chart || anchor === null) { setX(null); return; }
      const next = chart.timeScale().timeToCoordinate(chartTime(anchor, timeframe));
      setX(next === null ? null : next);
    };
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };
    refreshRef.current = refresh;
    chart?.timeScale().subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
      refreshRef.current = null;
    };
  }, [chart, anchor, timeframe, refreshRef]);

  if (!hasVolume) return <div className="chart-or-note">Anchored VWAP needs traded volume</div>;
  return <>
    {anchor === null && <div className="chart-or-note">Tap a candle to anchor VWAP</div>}
    {x !== null && <button type="button" className="chart-avwap-tag" style={{ left: x }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); window.localStorage.removeItem(storageKey(instrumentKey)); setAnchor(null); }} aria-label="Clear anchored VWAP">AVWAP</button>}
  </>;
}
