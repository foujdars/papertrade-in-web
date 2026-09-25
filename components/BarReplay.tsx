"use client";
import { CandleLoader } from "./CandleLoader";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { MarketChart, DEFAULT_CHART_INDICATORS, type ChartActionRequest, type DrawingTool } from "@/components/MarketChart";
import { ChartFunctionMenu } from "@/components/ChartFunctionMenu";
import { ChartTimeframeMenu } from "@/components/CompactSelectors";
import { StockLogo } from "@/components/StockLogo";
import { type Candle, type Instrument } from "@/lib/market";
import { prepareReplayCandles } from "@/lib/bar-replay";
import { useChartPreference } from "@/lib/chart-view-preferences";

const ignoreFeed = () => undefined;
const dateLabel = (time: number) => new Date(time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type ReplayController = {
  candles: Candle[];
  visible: Candle[];
  cursor: number;
  selecting: boolean;
  playing: boolean;
  loading: boolean;
  message: string;
  speed: number;
  setSpeed: (speed: number) => void;
  startTime: number | null;
  current?: Candle;
  ended: boolean;
  prompt: boolean;
  replayStartTime: number | null;
  resetSelection: () => void;
  previewAt: (time: number) => void;
  playFromHere: () => void;
  selectAt: (time: number) => void;
  togglePlay: () => void;
  step: () => void;
  back: () => void;
  restart: () => void;
  retryLoad: () => void;
};

export function useReplayController(instrument: Instrument | null, timeframe: string): ReplayController {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(0);
  const [selecting, setSelecting] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const key = instrument?.instrumentKey ?? "";

  useEffect(() => {
    if (!key) { setCandles([]); setLoading(false); setPlaying(false); setMessage(""); return; }
    const controller = new AbortController();
    setLoading(true); setMessage("Loading replay…"); setSelecting(true); setPlaying(false); setHasStarted(false); setShowStart(false); setStartTime(null); setCursor(0);
    const params = new URLSearchParams({ instrumentKey: key, timeframe, scope: "combined" });
    void fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { candles?: Candle[] };
      if (!response.ok || !payload.candles?.length) throw new Error("Historical candles are unavailable for this instrument and timeframe.");
      const snapshot = prepareReplayCandles(payload.candles);
      if (snapshot.length < 2) throw new Error("Not enough completed candles for replay. Choose another timeframe.");
      if (controller.signal.aborted) return;
      setCandles(snapshot); setCursor(Math.max(0, snapshot.length - 60)); setLoading(false); setMessage("");
    }).catch((error) => { if (!controller.signal.aborted) { setLoading(false); setCandles([]); setMessage(error instanceof Error ? error.message : "Could not load replay history."); } });
    return () => controller.abort();
  }, [key, timeframe, retry]);

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
  const ended = !selecting && candles.length > 0 && cursor >= candles.length - 1;

  function resetSelection() { setHasStarted(false); setShowStart(false); setSelecting(true); setPlaying(false); setCursor((value) => Math.min(value, Math.max(0, candles.length - 2))); setStartTime(null); }
  function startAt(time: number) {
    const index = candles.findIndex((candle) => candle.time === time);
    if (index < 0 || index >= candles.length - 1) return;
    setHasStarted(false); setShowStart(true); setCursor(index); setStartTime(time); setSelecting(false); setPlaying(false);
  }
  function previewAt(time: number) {
    const index = candles.findIndex(candle => candle.time === time);
    if (!selecting || index < 0 || index >= candles.length - 1 || index === cursor) return;
    setCursor(index); setShowStart(false);
  }
  function armStart(time: number) {
    const index = candles.findIndex((candle) => candle.time === time);
    if (!selecting || index < 0 || index >= candles.length - 1) return;
    setHasStarted(false); setShowStart(true); setCursor(index); setStartTime(time); setPlaying(false);
  }
  function playFromHere() {
    if (!current || cursor >= candles.length - 1) return;
    setStartTime(current.time); setSelecting(false); setHasStarted(true); setShowStart(false); setPlaying(true);
  }
  function restart() {
    if (startTime == null) return;
    startAt(startTime);
    setHasStarted(true); setShowStart(false); setPlaying(true);
  }

  return {
    candles, visible, cursor, selecting, playing, loading, message, speed, startTime, current, ended,
    prompt: showStart && !hasStarted,
    replayStartTime: current?.time ?? null,
    resetSelection, previewAt, playFromHere, selectAt: armStart,
    togglePlay: () => { if (playing) setPlaying(false); else playFromHere(); },
    step: () => { setPlaying(false); setCursor((value) => Math.min(value + 1, Math.max(0, candles.length - 1))); if (selecting) setShowStart(true); },
    back: () => { setPlaying(false); setCursor((value) => Math.max(0, value - 1)); if (selecting) setShowStart(true); },
    setSpeed,
    restart,
    retryLoad: () => setRetry((value) => value + 1),
  };
}

const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8, 10];

export function ChartReplayBar({ replay, onExit }: { replay: ReplayController; onExit?: () => void }) {
  return <div className="chart-replay-bar" role="toolbar" aria-label="Bar replay">
    <div className="chart-replay-meta"><span>{replay.loading ? "Loading replay…" : replay.message ? replay.message : replay.selecting ? (replay.prompt ? "Tap Play on the candle" : "Move the crosshair, then tap a candle") : replay.ended ? "Replay complete" : replay.current ? `${dateLabel(replay.current.time)} IST` : ""}</span><span>{replay.candles.length ? `${replay.cursor + 1} / ${replay.candles.length}` : ""}</span></div>
    {!!replay.message && !replay.loading && <button type="button" onClick={replay.retryLoad}>Retry</button>}
    <div className="chart-replay-transport">
      {replay.playing && <button type="button" onClick={replay.togglePlay}>Pause</button>}
      <button type="button" onClick={replay.back} disabled={!replay.candles.length || replay.cursor <= 0}>Back</button>
      <button type="button" onClick={replay.step} disabled={!replay.candles.length || replay.ended}>Next</button>
      <button type="button" onClick={replay.restart} disabled={replay.startTime == null}>Again</button>
      {onExit && <button type="button" onClick={onExit}>Exit</button>}
    </div>
    <div className="chart-replay-speeds" role="group" aria-label="Replay speed">
      {REPLAY_SPEEDS.map((speed) => <button key={speed} type="button" aria-pressed={replay.speed === speed} disabled={!replay.candles.length} onClick={() => replay.setSpeed(speed)}>{speed}×</button>)}
    </div>
  </div>;
}

export function BarReplay({ instrument, initialTimeframe, theme, onClose }: { instrument: Instrument; initialTimeframe: string; theme: "light" | "neon"; onClose?: () => void }) {
  const [magnet] = useChartPreference("magnet");
  const [hidden] = useChartPreference("hidden");
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const replay = useReplayController(instrument, timeframe);
  const [timeMenu, setTimeMenu] = useState(false);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [indicators, setIndicators] = useState(DEFAULT_CHART_INDICATORS);
  const [action, setAction] = useState<ChartActionRequest>();
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [clearSignal, setClearSignal] = useState(0);

  function reload(nextTimeframe: string) { setTool("cursor"); setClearSignal((value) => value + 1); setTimeframe(nextTimeframe); setTimeMenu(false); }

  return <section className={`bar-replay ${replay.selecting ? "selecting" : "running"}`} aria-label={`${instrument.symbol} bar replay`} onKeyDown={(event) => { if (event.key === "Escape" && (timeMenu || functionsOpen)) { event.stopPropagation(); setTimeMenu(false); setFunctionsOpen(false); } }}>
    <header className="bar-replay-heading"><span className="stock-identity"><StockLogo {...instrument} size={30} /><span><b>{instrument.symbol}</b><small>Bar replay</small></span></span>{onClose && <button type="button" onClick={onClose} aria-label="Exit bar replay"><X size={20} /></button>}</header>
    <div className="bar-replay-tools">
      <button type="button" onClick={() => { if (replay.playing) replay.togglePlay(); setTimeMenu(true); }}>{timeframe}<SlidersHorizontal size={15} /></button>
      <button type="button" onClick={() => setFunctionsOpen(true)}>Functions</button>
      <button type="button" aria-pressed={tool === "trend-line"} disabled={replay.selecting || !replay.candles.length} onClick={() => setTool(tool === "cursor" ? "trend-line" : "cursor")}>Trend line</button>
      <button type="button" onClick={() => setAction((value) => ({ type: "fit", token: (value?.token ?? 0) + 1 }))}>Fit</button>
    </div>
    <div className="bar-replay-chart">
      {!!replay.visible.length && <MarketChart key={`${instrument.instrumentKey}-${timeframe}`} instrument={instrument} timeframe={timeframe} activeTool={tool} magnet={magnet} hiddenDrawings={replay.selecting || hidden} candlesOnly={hidden} indicators={indicators} chartAction={action} chartTheme={theme} visibleBars={60} replayCandles={replay.visible} replaySelecting={replay.selecting} replayStartTime={replay.replayStartTime} replayPrompt={replay.prompt} onReplayPreview={replay.previewAt} onReplaySelect={replay.selectAt} onReplayPlay={replay.playFromHere} clearSignal={clearSignal} onDrawingComplete={() => setTool("cursor")} onFeedStatus={ignoreFeed} />}
      {!replay.visible.length && <div className="bar-replay-empty" role="status">{replay.loading ? <CandleLoader label={replay.message || "Loading replay…"} /> : <p>{replay.message || "Replay is unavailable."}</p>}{!replay.loading && <button type="button" onClick={replay.retryLoad}>Retry</button>}</div>}
      {timeMenu && <ChartTimeframeMenu current={timeframe} onSelect={reload} onClose={() => setTimeMenu(false)} />}
      {functionsOpen && <ChartFunctionMenu indicators={indicators} onToggleIndicator={(name) => setIndicators((value) => ({ ...value, [name]: !value[name] }))} onAction={(type) => setAction((value) => ({ type, token: (value?.token ?? 0) + 1 }))} onClose={() => setFunctionsOpen(false)} />}
    </div>
    {(replay.loading || !!replay.message || replay.candles.length > 0) && <ChartReplayBar replay={replay} onExit={onClose} />}
  </section>;
}

export function BarReplayDialog({ instrument, timeframe, theme, onClose }: { instrument: Instrument; timeframe: string; theme: "light" | "neon"; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); return () => { document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  return <div className="bar-replay-backdrop" role="presentation"><div ref={ref} className="bar-replay-dialog" role="dialog" aria-modal="true" aria-label="Bar replay" onKeyDown={(event) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") { const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((node) => node.getClientRects().length && node.tabIndex >= 0); const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><BarReplay instrument={instrument} initialTimeframe={timeframe} theme={theme} onClose={onClose} /></div></div>;
}
