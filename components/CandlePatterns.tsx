"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { findCandlePatterns, type CandlePatternHit } from "@/lib/candle-patterns";

const dateText = (time: number) => new Date(time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function CandlePatterns({ candles, chart, series, timeframe, replay, refreshRef, triggerHost }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  replay: boolean;
  refreshRef: MutableRefObject<(() => void) | null>;
  triggerHost?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    refresh();
    return () => { cancelAnimationFrame(frame); refreshRef.current = null; };
  }, [refreshRef, chart, candles]);
  const hits = useMemo(() => findCandlePatterns(replay ? candles : candles.slice(0, -1)), [candles, replay]);
  const focused = hits.find((hit) => hit.id === selected) ?? null;
  const pane = chart?.paneSize(0) ?? { width: 0, height: 0 };
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19800;
  const tags = hits.flatMap((hit) => {
    const bar = candles[hit.index];
    if (!bar) return [];
    const x = chart?.timeScale().timeToCoordinate((hit.time + shift) as UTCTimestamp) ?? null;
    const anchor = hit.bias === "bullish" ? bar.low : bar.high;
    const y = series?.priceToCoordinate(anchor) ?? null;
    if (x === null || y === null || x < 8 || x > pane.width - 8 || y < 8 || y > pane.height - 8) return [];
    return [{ hit, x, y }];
  }).slice(-14);
  const trigger = <button type="button" className="chart-pattern-chip" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Candlestick patterns">Patterns <span>{hits.length}</span></button>;
  return <>
    {triggerHost !== undefined ? triggerHost && createPortal(trigger, triggerHost) : <div className="chart-pattern-float">{trigger}</div>}
    {tags.map(({ hit, x, y }) => <button key={hit.id} type="button" className={`candle-pattern-tag ${hit.bias} ${hit.bias === "bullish" ? "below" : "above"} ${selected === hit.id ? "active" : ""}`} style={{ left: x, top: y }} aria-pressed={selected === hit.id} onClick={() => { setSelected(hit.id); setOpen(true); }}>{hit.name}</button>)}
    {open && <section className="candle-pattern-sheet" aria-label="Recognised candlestick patterns">
      <header><b>Candle patterns</b><button type="button" onClick={() => setOpen(false)} aria-label="Close candle patterns">Close</button></header>
      <p>These labels describe the candle shape on closed bars. They are not buy or sell signals.</p>
      {focused && <article className={focused.bias}><b>{focused.name}</b><small>{dateText(focused.time)} IST</small><span>{focused.note}</span></article>}
      <div>{[...hits].reverse().slice(0, 12).map((hit) => <button type="button" key={hit.id} className={hit.bias} aria-pressed={selected === hit.id} onClick={() => setSelected(hit.id)}><b>{hit.name}</b><small>{dateText(hit.time)} IST</small></button>)}</div>
      {!hits.length && <p>No classic pattern on the closed candles yet.</p>}
    </section>}
  </>;
}

export type { CandlePatternHit };
