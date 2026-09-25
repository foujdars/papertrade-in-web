"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type { IChartApi } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { anchoredVwap } from "@/lib/anchored-vwap";

const storageKey = (instrumentKey: string) => `papertrade-anchored-vwap:${instrumentKey}`;

export function AnchoredVwap({ candles, chart, series, timeframe, instrumentKey, replay, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  instrumentKey: string;
  replay: boolean;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [aim, setAim] = useState(Math.max(0, candles.length - 1));
  const [, redraw] = useState(0);
  const stamp = candles.length ? `${candles.length}:${candles.at(-1)?.time}:${candles.at(-1)?.close}:${candles.at(-1)?.volume}` : "";
  const hasVolume = candles.some((candle) => candle.volume > 0);

  function remember(index: number) {
    const candle = candles[Math.min(candles.length - 1, Math.max(0, index))];
    if (!candle) return;
    window.localStorage.setItem(storageKey(instrumentKey), String(candle.time));
    setAnchor(candle.time);
  }

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(storageKey(instrumentKey)));
    setAnchor(Number.isFinite(saved) && saved > 0 ? saved : null);
  }, [instrumentKey]);

  useEffect(() => {
    if (!chart || replay || anchor !== null) return;
    const move = (param: { point?: { x: number } }) => {
      if (!param.point || !candles.length) return;
      const logical = chart.timeScale().coordinateToLogical(param.point.x);
      if (logical == null) return;
      setAim(Math.min(candles.length - 1, Math.max(0, Math.round(logical))));
    };
    chart.subscribeCrosshairMove(move);
    return () => chart.unsubscribeCrosshairMove(move);
  }, [chart, replay, anchor, candles]);

  useEffect(() => {
    if (!chart || replay || anchor !== null) return;
    const element = chart.chartElement();
    let start: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; };
    const up = (event: PointerEvent) => {
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) { start = null; return; }
      const logical = chart.timeScale().coordinateToLogical(event.clientX - element.getBoundingClientRect().left);
      start = null;
      if (logical == null || !candles.length) return;
      const index = Math.min(candles.length - 1, Math.max(0, Math.round(logical)));
      const candle = candles[index];
      if (!candle) return;
      window.localStorage.setItem(storageKey(instrumentKey), String(candle.time));
      setAnchor(candle.time);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointerup", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
    };
  }, [chart, replay, anchor, candles, instrumentKey]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    chart?.timeScale().subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      chart?.timeScale().unsubscribeVisibleLogicalRangeChange(refresh);
      refreshRef.current = null;
    };
  }, [chart, refreshRef, stamp]);

  if (!hasVolume) return <div className="chart-or-note">Anchored VWAP needs traded volume</div>;
  const scale = chart?.timeScale();
  const xAt = (index: number) => scale?.logicalToCoordinate(index as never) ?? null;
  const yAt = (price: number) => series?.priceToCoordinate(price) ?? null;
  const points = anchor === null || !chart || !series ? [] : anchoredVwap(candles, anchor).flatMap((point) => {
    const index = candles.findIndex((candle) => candle.time === point.time);
    const x = index < 0 ? null : xAt(index);
    const y = yAt(point.value);
    return x == null || y == null ? [] : [`${x},${y}`];
  });
  const aimX = anchor === null ? xAt(aim) : xAt(candles.findIndex((candle) => candle.time === anchor));
  return <>
    {anchor === null && <div className="chart-or-note">Tap a candle to start. Dragging still scrolls.</div>}
    {anchor !== null && points.length < 2 && <div className="chart-or-note">Tap an earlier candle. The line runs forward from there.</div>}
    {points.length > 1 && <svg className="chart-avwap-line" aria-hidden="true"><polyline points={points.join(" ")} /></svg>}
    {aimX != null && anchor === null && <span className="chart-avwap-aim" style={{ left: aimX }} />}
    {anchor === null && !replay && <button type="button" className="chart-avwap-anchor" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); remember(aim); }}>Anchor</button>}
    {anchor !== null && aimX != null && <button type="button" className="chart-avwap-tag" style={{ left: aimX }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); window.localStorage.removeItem(storageKey(instrumentKey)); setAnchor(null); }} aria-label="Clear anchored VWAP">AVWAP</button>}
  </>;
}
