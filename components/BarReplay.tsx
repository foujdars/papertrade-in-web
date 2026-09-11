"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Pause, Play, RotateCcw, SkipForward, X, SlidersHorizontal } from "lucide-react";
import { MarketChart, DEFAULT_CHART_INDICATORS, type ChartActionRequest, type DrawingTool } from "@/components/MarketChart";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { ChartTimeframeMenu } from "@/components/CompactSelectors";
import { StockLogo } from "@/components/StockLogo";
import { formatInr, type Candle, type Instrument } from "@/lib/market";
import { emptyReplayAccount, prepareReplayCandles, replayPnl, replayTrade } from "@/lib/bar-replay";

const ignoreFeed = () => undefined;
const dateLabel = (time: number) => new Date(time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function BarReplay({ instrument, initialTimeframe, theme, onClose }: { instrument: Instrument; initialTimeframe: string; theme: "light" | "neon"; onClose?: () => void }) {
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selecting, setSelecting] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [account, setAccount] = useState(emptyReplayAccount);
  const lotSize = Math.max(1, instrument.lotSize || 1);
  const [quantity, setQuantity] = useState(String(lotSize));
  const [message, setMessage] = useState("Loading historical candles…");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [timeMenu, setTimeMenu] = useState(false);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [indicators, setIndicators] = useState(DEFAULT_CHART_INDICATORS);
  const [action, setAction] = useState<ChartActionRequest>();
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [clearSignal, setClearSignal] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ instrumentKey: instrument.instrumentKey, timeframe, scope: "combined" });
    void fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { candles?: Candle[] };
      if (!response.ok || !payload.candles?.length) throw new Error("Historical candles are unavailable for this instrument and timeframe. Try again or choose another timeframe.");
      const snapshot = prepareReplayCandles(payload.candles);
      if (snapshot.length < 2) throw new Error("Not enough completed candles for replay. Choose another timeframe.");
      if (controller.signal.aborted) return;
      setCandles(snapshot); setCursor(Math.max(0, snapshot.length - 60)); setLoading(false); setMessage("");
    }).catch((error) => { if (!controller.signal.aborted) { setLoading(false); setMessage(error instanceof Error ? error.message : "Could not load replay history."); } });
    return () => controller.abort();
  }, [instrument.instrumentKey, timeframe, retry]);

  useEffect(() => {
    if (!playing || selecting || cursor >= candles.length - 1) return;
    const timer = window.setTimeout(() => {
      setCursor((value) => Math.min(value + 1, candles.length - 1));
      if (cursor + 1 >= candles.length - 1) setPlaying(false);
    }, 1000 / speed);
    return () => window.clearTimeout(timer);
  }, [playing, selecting, cursor, candles.length, speed]);

  const visible = useMemo(() => selecting ? candles : candles.slice(0, cursor + 1), [candles, selecting, cursor]);
  const current = candles[cursor];
  const pnl = account.realized + (current ? replayPnl(account.position, current.close) : 0);
  const units = Number(quantity);
  const validQuantity = Number.isSafeInteger(units) && units > 0 && units % lotSize === 0;
  const ended = !selecting && cursor >= candles.length - 1;
  function resetSelection() { setSelecting(true); setPlaying(false); setCursor((value) => Math.min(value, Math.max(0, candles.length - 2))); setAccount(emptyReplayAccount()); setStartTime(null); setTool("cursor"); setClearSignal((value) => value + 1); }
  function reload(nextTimeframe: string) { resetSelection(); setCandles([]); setCursor(0); setLoading(true); setMessage("Loading historical candles…"); setTimeframe(nextTimeframe); setTimeMenu(false); }
  function startAt(time: number) {
    const index = candles.findIndex((candle) => candle.time === time);
    if (index < 0 || index >= candles.length - 1) return;
    setCursor(index); setStartTime(time); setSelecting(false); setPlaying(false); setAccount(emptyReplayAccount()); setClearSignal((value) => value + 1);
  }
  function trade(side: "BUY" | "SELL" | "CLOSE") {
    if (selecting || !current || (!account.position && !validQuantity)) return;
    setAccount((value) => replayTrade(value, side, current, units));
  }

  return <section className={`bar-replay ${selecting ? "selecting" : "running"}`} aria-label={`${instrument.symbol} bar replay`} onKeyDown={(event) => { if (event.key === "Escape" && (timeMenu || functionsOpen)) { event.stopPropagation(); setTimeMenu(false); setFunctionsOpen(false); } }}>
    <header className="bar-replay-heading"><span className="stock-identity"><StockLogo {...instrument} size={30} /><span><b>{instrument.symbol}</b><small>Bar replay · Practice only</small></span></span>{onClose && <button type="button" onClick={onClose} aria-label="Exit bar replay"><X size={20} /></button>}</header>
    <div className="bar-replay-tools">
      <button type="button" onClick={() => { setPlaying(false); setTimeMenu(true); }}>{timeframe}<SlidersHorizontal size={15} /></button>
      <button type="button" onClick={() => setFunctionsOpen(true)}>Functions</button>
      <button type="button" aria-pressed={tool === "trend-line"} disabled={selecting || !candles.length} onClick={() => setTool(tool === "cursor" ? "trend-line" : "cursor")}>Trend line</button>
      <button type="button" onClick={() => setAction((value) => ({ type: "fit", token: (value?.token ?? 0) + 1 }))}>Fit</button>
    </div>
    <div className="bar-replay-chart">
      {!!visible.length && <MarketChart key={`${instrument.instrumentKey}-${timeframe}`} instrument={instrument} timeframe={timeframe} activeTool={tool} magnet hiddenDrawings={selecting} indicators={indicators} chartAction={action} chartTheme={theme} visibleBars={60} replayCandles={visible} replaySelecting={selecting} replayStartTime={selecting ? current?.time ?? null : startTime} onReplaySelect={startAt} tradeMarkers={selecting ? [] : account.fills} clearSignal={clearSignal} onDrawingComplete={() => setTool("cursor")} onFeedStatus={ignoreFeed} />}
      {!visible.length && <div className="bar-replay-empty" role="status"><RotateCcw size={25} /><p>{message}</p>{!loading && <button type="button" onClick={() => { reload(timeframe); setRetry((value) => value + 1); }}>Retry</button>}</div>}
      {timeMenu && <ChartTimeframeMenu current={timeframe} onSelect={reload} onClose={() => setTimeMenu(false)} />}
      {functionsOpen && <ChartFunctionMenu indicators={indicators} onToggleIndicator={(name) => setIndicators((value) => ({ ...value, [name]: !value[name] }))} onAction={(type) => setAction((value) => ({ type, token: (value?.token ?? 0) + 1 }))} onClose={() => setFunctionsOpen(false)} />}
    </div>
    {selecting ? <div className="bar-replay-start"><span><Crosshair size={16} />Tap a candle to start, or choose a bar below.</span><div><input type="range" aria-label="Replay starting candle" min={0} max={Math.max(0, candles.length - 2)} value={cursor} disabled={!candles.length} onChange={(event) => setCursor(Number(event.target.value))} /><button type="button" disabled={!current} onClick={() => current && startAt(current.time)}>Start here</button></div><small>{current ? `${dateLabel(current.time)} IST · Available history only` : ""}</small></div> : <>
      <div className="bar-replay-progress"><span>{current ? `${dateLabel(current.time)} IST` : ""}</span><span>{ended ? "Replay complete" : `${cursor + 1} / ${candles.length}`}</span></div>
      <div className="bar-replay-playback"><button type="button" onClick={resetSelection} aria-label="Choose a new replay start"><Crosshair size={18} /></button><button type="button" onClick={() => setPlaying(!playing)} disabled={ended} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" disabled={ended} onClick={() => { setPlaying(false); setCursor((value) => Math.min(value + 1, candles.length - 1)); }} aria-label="Next candle"><SkipForward size={18} /></button><button type="button" onClick={() => setSpeed((value) => value === 4 ? .5 : value * 2)} aria-label={`Replay speed ${speed}x`}>{speed}×</button><button type="button" onClick={() => startTime && startAt(startTime)} aria-label="Restart replay"><RotateCcw size={18} /></button></div>
      <div className="bar-replay-practice"><div><span>{account.position ? `${account.position.side === "BUY" ? "Long" : "Short"} ${account.position.quantity} @ ${formatInr(account.position.price)}` : "No practice position"}</span><strong className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{formatInr(pnl)}</strong></div><div className="bar-replay-orders"><button type="button" className="replay-sell" onClick={() => trade("SELL")} disabled={account.position?.side === "SELL" || (!account.position && !validQuantity)}>Sell</button><label>Qty<input type="number" inputMode="numeric" min={lotSize} step={lotSize} value={quantity} disabled={!!account.position} onChange={(event) => setQuantity(event.target.value)} /></label><button type="button" className="replay-buy" onClick={() => trade("BUY")} disabled={account.position?.side === "BUY" || (!account.position && !validQuantity)}>Buy</button><button type="button" onClick={() => trade("CLOSE")} disabled={!account.position}>Close</button></div>{!validQuantity && <small role="alert">Enter a positive quantity in multiples of {lotSize}.</small>}<small>Replay P&amp;L excludes charges. Your portfolio is unchanged.</small></div>
    </>}
  </section>;
}

export function BarReplayDialog({ instrument, timeframe, theme, onClose }: { instrument: Instrument; timeframe: string; theme: "light" | "neon"; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); return () => { document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  return <div className="bar-replay-backdrop" role="presentation"><div ref={ref} className="bar-replay-dialog" role="dialog" aria-modal="true" aria-label="Bar replay and practice" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") { const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length && node.tabIndex >= 0); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><BarReplay instrument={instrument} initialTimeframe={timeframe} theme={theme} onClose={onClose} /></div></div>;
}
