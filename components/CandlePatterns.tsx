"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { IChartApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/market";
import { filterCandlePatterns, findCandlePatterns, PATTERN_NAMES, spreadPatternTags, type CandlePatternHit, type PatternBias } from "@/lib/candle-patterns";

const dateText = (time: number) => new Date(time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const FILTER_KEY = "papertrade-pattern-filter";

export function CandlePatterns({ candles, chart, series, timeframe, replay, refreshRef }: {
  candles: Candle[];
  chart: IChartApi | null;
  series: { priceToCoordinate: (price: number) => number | null } | null;
  timeframe: string;
  replay: boolean;
  refreshRef: MutableRefObject<(() => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [bias, setBias] = useState<"all" | PatternBias>("all");
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [, redraw] = useState(0);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FILTER_KEY) || "") as { bias?: "all" | PatternBias; hidden?: string[] };
      if (saved.bias === "all" || saved.bias === "bullish" || saved.bias === "bearish" || saved.bias === "neutral") setBias(saved.bias);
      if (Array.isArray(saved.hidden)) setHidden(saved.hidden.filter((name) => PATTERN_NAMES.includes(name)));
    } catch { /* A missing filter just shows every pattern. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) window.localStorage.setItem(FILTER_KEY, JSON.stringify({ bias, hidden }));
  }, [bias, hidden, ready]);
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    refresh();
    return () => { cancelAnimationFrame(frame); refreshRef.current = null; };
  }, [refreshRef, chart, candles]);
  const hits = useMemo(() => filterCandlePatterns(findCandlePatterns(replay ? candles : candles.slice(0, -1)), bias, hidden), [candles, replay, bias, hidden]);
  const focused = hits.find((hit) => hit.id === selected) ?? null;
  const pane = chart?.paneSize(0) ?? { width: 0, height: 0 };
  const shift = ["1D", "1W", "1M", "1Y"].includes(timeframe) ? 0 : 19800;
  const tags = spreadPatternTags(hits.flatMap((hit) => {
    const bar = candles[hit.index];
    if (!bar) return [];
    const x = chart?.timeScale().timeToCoordinate((hit.time + shift) as UTCTimestamp) ?? null;
    const anchor = hit.bias === "bullish" ? bar.low : bar.high;
    const y = series?.priceToCoordinate(anchor) ?? null;
    if (x === null || y === null || x < 8 || x > pane.width - 8 || y < 8 || y > pane.height - 8) return [];
    return [{ hit, name: hit.name, x, y, above: hit.bias !== "bullish" }];
  }).slice(-14));
  return <>
    {tags.map(({ hit, x, y, above }) => <button key={hit.id} type="button" className={`candle-pattern-tag ${hit.bias} ${above ? "above" : "below"} ${selected === hit.id ? "active" : ""}`} style={{ left: x, top: y }} aria-pressed={selected === hit.id} onClick={() => { setSelected(hit.id); setOpen(true); }}>{hit.name}</button>)}
    {open && <section className="candle-pattern-sheet" aria-label="Recognised candlestick patterns">
      <header><b>Candle patterns</b><button type="button" onClick={() => setOpen(false)} aria-label="Close candle patterns">Close</button></header>
      <div className="pattern-filters" role="group" aria-label="Filter by direction">{(["all", "bullish", "bearish", "neutral"] as const).map((item) => <button key={item} type="button" aria-pressed={bias === item} onClick={() => setBias(item)}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      <div className="pattern-name-filters" role="group" aria-label="Filter pattern names">{PATTERN_NAMES.map((name) => <button key={name} type="button" aria-pressed={!hidden.includes(name)} onClick={() => setHidden((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])}>{name}</button>)}</div>
      {focused && <article className={focused.bias}><b>{focused.name}</b><small>{dateText(focused.time)} IST</small><span>{focused.note}</span></article>}
      {!hits.length && <p>No pattern matches this filter on the closed candles.</p>}
    </section>}
  </>;
}

export type { CandlePatternHit };
