"use client";

import { useState } from "react";
import type { Candle } from "@/lib/market";
import { runChartScript } from "@/lib/chart-script";

const PLACEHOLDER = "overlay\nplot(sma(close, 20))\nplot(ema(close, 9), \"fast\")";

export function ChartScriptBox({ candles, script, onRun, onClose }: {
  candles: Candle[];
  script: string;
  onRun: (script: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(script);
  const [error, setError] = useState<string | null>(null);
  return <form className="chart-script-box" onSubmit={(event) => {
    event.preventDefault();
    const sample = candles.length ? candles : [{ time: 0, open: 1, high: 2, low: 1, close: 1.5, volume: 1 }];
    const result = runChartScript(draft, sample);
    if (result.error) { setError(result.error); return; }
    setError(null);
    onRun(draft);
  }}>
    <header>
      <b>Script</b>
      <button type="submit">Run</button>
      <button type="button" onClick={onClose} aria-label="Close script">×</button>
    </header>
    <textarea value={draft} spellCheck={false} aria-label="Chart script" placeholder={PLACEHOLDER} onChange={(event) => setDraft(event.target.value)} />
    <small>sma, ema, rsi and atr. Same script on Indian and global charts. Start with overlay to draw on the candles.</small>
    {error && <p className="chart-script-error" role="alert">{error}</p>}
  </form>;
}
