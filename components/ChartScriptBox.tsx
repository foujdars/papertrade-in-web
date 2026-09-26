"use client";

import { useRef, useState } from "react";
import type { Candle } from "@/lib/market";
import { runChartScript } from "@/lib/chart-script";

const EXAMPLES = [
  { name: "Examples", source: "" },
  { name: "Moving average", source: "overlay\nplot(sma(close, 20), \"SMA 20\")" },
  { name: "Two averages", source: "overlay\nfast = ema(close, 9)\nslow = ema(close, 21)\nplot(fast, \"Fast\")\nplot(slow, \"Slow\")" },
  { name: "RSI", source: "plot(rsi(close, 14), \"RSI\")\nhline(70)\nhline(30)" },
  { name: "ATR", source: "plot(atr(14), \"ATR\")" },
];

export function ChartScriptBox({ candles, script, onRun, onClose }: {
  candles: Candle[];
  script: string;
  onRun: (script: string) => void;
  onClose: () => void;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(script);
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState(EXAMPLES[0].name);
  const lines = Math.max(8, draft.split("\n").length);
  const errorLine = Number(/^Line (\d+)/.exec(error ?? "")?.[1] ?? 0);
  const apply = (source: string) => {
    const sample = candles.length ? candles : [{ time: 0, open: 1, high: 2, low: 1, close: 1.5, volume: 1 }];
    const result = runChartScript(source, sample);
    if (result.error) { setError(result.error); return; }
    setError(null);
    onRun(source);
  };
  return <form className="chart-script-box" onSubmit={(event) => { event.preventDefault(); apply(draft); }}>
    <header>
      <b>Script editor</b>
      <select aria-label="Script example" value={example} onChange={(event) => {
        const next = EXAMPLES.find((item) => item.name === event.target.value) ?? EXAMPLES[0];
        setExample(next.name);
        if (next.source) setDraft(next.source);
      }}>
        {EXAMPLES.map((item) => <option key={item.name}>{item.name}</option>)}
      </select>
      <button type="submit">Add to chart</button>
      <button type="button" onClick={onClose} aria-label="Close script editor">×</button>
    </header>
    <div className="chart-script-editor">
      <div className="chart-script-gutter" ref={gutter} aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index} className={errorLine === index + 1 ? "bad" : ""}>{index + 1}</span>)}</div>
      <textarea value={draft} spellCheck={false} aria-label="Chart script" wrap="off" onScroll={(event) => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }} onChange={(event) => { setDraft(event.target.value); setExample(EXAMPLES[0].name); }} />
    </div>
    <footer>
      <small>open, high, low, close, volume, sma, ema, rsi, atr, plot, hline. Use overlay to draw on the candles. This is the app’s script, not TradingView Pine, and it follows whichever Indian or global chart is open.</small>
      {error && <p className="chart-script-error" role="alert">{error}</p>}
    </footer>
  </form>;
}
