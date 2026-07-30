"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { ema, generateCandles, rsi, timeframes, type Candle, type Instrument } from "@/lib/market";

export type DrawingTool =
  | "cursor"
  | "trend"
  | "horizontal"
  | "ray"
  | "channel"
  | "rectangle"
  | "fib"
  | "range"
  | "long"
  | "short";

export type FeedStatus = {
  mode: "loading" | "live" | "simulated" | "error";
  message: string;
  updatedAt?: string;
};

type Point = { x: number; y: number };
type Drawing = { id: number; tool: DrawingTool; points: Point[] };

const twoPointTools: DrawingTool[] = ["trend", "ray", "rectangle", "fib", "range", "long", "short"];

function timeToDate(time: Time) {
  if (typeof time === "number") return new Date(time * 1_000);
  if (typeof time === "string") return new Date(time);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function indiaChartTime(time: Time, daily: boolean) {
  const date = timeToDate(time);
  const day = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date).replace(/ (\d{2})$/, " '$1");
  if (daily) return day;
  const clock = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} ${clock}`;
}

function indiaTickMark(time: Time, tickMarkType: TickMarkType, daily: boolean) {
  if (daily || tickMarkType <= TickMarkType.DayOfMonth) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
    }).format(timeToDate(time));
  }
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timeToDate(time));
}

function mergeSeries(existing: Candle[], incoming: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const candle of [...existing, ...incoming]) byTime.set(Number(candle.time), candle);
  return [...byTime.values()]
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-1_600);
}

function DrawingShape({ drawing }: { drawing: Drawing }) {
  const [a, b = a, c = b] = drawing.points;
  const stroke = drawing.tool === "short" ? "#f04458" : drawing.tool === "long" ? "#00a67e" : "#6b5cff";
  const x1 = `${a.x}%`;
  const y1 = `${a.y}%`;
  const x2 = `${b.x}%`;
  const y2 = `${b.y}%`;

  if (drawing.tool === "horizontal") {
    return <line x1="0" y1={y1} x2="100%" y2={y1} stroke={stroke} strokeWidth="1.5" />;
  }
  if (drawing.tool === "ray") {
    return <line x1={x1} y1={y1} x2="100%" y2={y2} stroke={stroke} strokeWidth="1.5" />;
  }
  if (drawing.tool === "trend") {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="2" />;
  }
  if (drawing.tool === "rectangle") {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x);
    const height = Math.abs(a.y - b.y);
    return (
      <>
        <rect x={`${left}%`} y={`${top}%`} width={`${width}%`} height={`${height}%`} fill="#6b5cff18" stroke={stroke} strokeWidth="1.5" />
        <line x1={`${left}%`} y1={`${top + height / 2}%`} x2={`${left + width}%`} y2={`${top + height / 2}%`} stroke={stroke} strokeDasharray="5 4" />
      </>
    );
  }
  if (drawing.tool === "channel") {
    const dx = c.x - b.x;
    const dy = c.y - b.y;
    return (
      <>
        <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${b.x + dx},${b.y + dy} ${a.x + dx},${a.y + dy}`} fill="#6b5cff12" stroke="none" vectorEffect="non-scaling-stroke" transform="scale(1)" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.5" />
        <line x1={`${a.x + dx}%`} y1={`${a.y + dy}%`} x2={`${b.x + dx}%`} y2={`${b.y + dy}%`} stroke={stroke} strokeWidth="1.5" />
      </>
    );
  }
  if (drawing.tool === "fib") {
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return (
      <>
        {levels.map((level) => {
          const y = a.y + (b.y - a.y) * level;
          return (
            <g key={level}>
              <line x1={x1} y1={`${y}%`} x2={x2} y2={`${y}%`} stroke={level === 0.618 ? "#f59e0b" : stroke} strokeWidth="1" />
              <text x={`${Math.min(a.x, b.x) + 0.4}%`} y={`${y - 0.5}%`} fontSize="10" fill="#536079">{level}</text>
            </g>
          );
        })}
      </>
    );
  }
  if (drawing.tool === "range") {
    return (
      <>
        <line x1={x1} y1={y1} x2={x1} y2={y2} stroke={stroke} strokeWidth="1.5" />
        <line x1={`${a.x - 1}%`} y1={y1} x2={`${a.x + 1}%`} y2={y1} stroke={stroke} />
        <line x1={`${a.x - 1}%`} y1={y2} x2={`${a.x + 1}%`} y2={y2} stroke={stroke} />
        <text x={`${a.x + 1.2}%`} y={`${(a.y + b.y) / 2}%`} fontSize="11" fill={stroke}>{Math.abs(a.y - b.y).toFixed(1)}%</text>
      </>
    );
  }
  if (drawing.tool === "long" || drawing.tool === "short") {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x);
    const height = Math.abs(a.y - b.y);
    const mid = drawing.tool === "long" ? top + height * 0.63 : top + height * 0.37;
    return (
      <>
        <rect x={`${left}%`} y={`${top}%`} width={`${width}%`} height={`${height}%`} fill={`${stroke}14`} stroke={stroke} strokeWidth="1.5" />
        <line x1={`${left}%`} y1={`${mid}%`} x2={`${left + width}%`} y2={`${mid}%`} stroke={stroke} strokeDasharray="5 3" />
        <text x={`${left + 0.6}%`} y={`${top + 4}%`} fontSize="11" fontWeight="700" fill={stroke}>{drawing.tool === "long" ? "LONG" : "SHORT"}</text>
      </>
    );
  }
  return null;
}

export function MarketChart({
  instrument,
  timeframe,
  activeTool,
  magnet,
  hiddenDrawings,
  onPrice,
  onFeedStatus,
}: {
  instrument: Instrument;
  timeframe: string;
  activeTool: DrawingTool;
  magnet: boolean;
  hiddenDrawings: boolean;
  onPrice: (value: number) => void;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  const chartHost = useRef<HTMLDivElement>(null);
  const rsiHost = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema5Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Series = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const dataRef = useRef<Candle[]>([]);
  const viewportInitialized = useRef(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draft, setDraft] = useState<Point[]>([]);
  const [feedMode, setFeedMode] = useState<"loading" | "live" | "simulated">("loading");
  const [seriesData, setSeriesData] = useState<Candle[]>(() => generateCandles(instrument, timeframe));

  useEffect(() => {
    if (!chartHost.current || !rsiHost.current) return;
    const common = {
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#65708a", fontFamily: "Inter, Arial, sans-serif", fontSize: 11 },
      localization: {
        locale: "en-IN",
        timeFormatter: (time: Time) => indiaChartTime(time, timeframe === "1D"),
      },
      grid: { vertLines: { color: "#eef1f7" }, horzLines: { color: "#eef1f7" } },
      rightPriceScale: { borderColor: "#e6e9f2", minimumWidth: 64 },
      timeScale: {
        borderColor: "#e6e9f2",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) => indiaTickMark(time, tickMarkType, timeframe === "1D"),
      },
      crosshair: { vertLine: { color: "#98a2b7", style: LineStyle.Dashed }, horzLine: { color: "#98a2b7", style: LineStyle.Dashed } },
      handleScroll: true,
      handleScale: true,
    } as const;
    const chart = createChart(chartHost.current, { ...common, height: chartHost.current.clientHeight });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#00a67e",
      downColor: "#f04458",
      wickUpColor: "#00a67e",
      wickDownColor: "#f04458",
      borderVisible: false,
      priceLineColor: "#6b5cff",
      lastValueVisible: true,
    });
    const fast = chart.addSeries(LineSeries, { color: "#ff6d00", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    const slow = chart.addSeries(LineSeries, { color: "#4caf50", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    const rsiChart = createChart(rsiHost.current, {
      ...common,
      height: rsiHost.current.clientHeight,
      rightPriceScale: { ...common.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    const momentum = rsiChart.addSeries(LineSeries, { color: "#7c4dff", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    momentum.createPriceLine({ price: 70, color: "#f0445870", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "70" });
    momentum.createPriceLine({ price: 30, color: "#00a67e70", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "30" });
    chartApi.current = chart;
    candleSeries.current = candles;
    ema5Series.current = fast;
    ema21Series.current = slow;
    rsiSeries.current = momentum;

    const resize = () => {
      if (!chartHost.current || !rsiHost.current) return;
      chart.resize(chartHost.current.clientWidth, chartHost.current.clientHeight);
      rsiChart.resize(rsiHost.current.clientWidth, rsiHost.current.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(chartHost.current);
    observer.observe(rsiHost.current);
    return () => {
      observer.disconnect();
      chart.remove();
      rsiChart.remove();
    };
  }, [timeframe]);

  useEffect(() => {
    dataRef.current = seriesData;
    candleSeries.current?.setData(seriesData);
    ema5Series.current?.setData(ema(seriesData, 5));
    ema21Series.current?.setData(ema(seriesData, 21));
    rsiSeries.current?.setData(rsi(seriesData, 14));
    if (!viewportInitialized.current) {
      const visibleBars = timeframe === "1D" ? 120 : timeframe.endsWith("H") ? 100 : 155;
      if (seriesData.length > visibleBars) {
        chartApi.current?.timeScale().setVisibleLogicalRange({
          from: seriesData.length - visibleBars,
          to: seriesData.length + 8,
        });
      } else {
        chartApi.current?.timeScale().fitContent();
      }
      viewportInitialized.current = true;
    }
    onPrice(seriesData.at(-1)?.close ?? instrument.price);
  }, [seriesData, instrument.price, onPrice, timeframe]);

  useEffect(() => {
    const controller = new AbortController();
    onFeedStatus({ mode: "loading", message: "Connecting to Upstox…" });

    async function loadUpstoxCandles() {
      try {
        const params = new URLSearchParams({
          instrumentKey: instrument.instrumentKey,
          timeframe,
        });
        const response = await fetch(`/api/upstox/candles?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          candles?: Candle[];
          segments?: string[];
          fetchedAt?: string;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok || !payload.candles?.length) {
          throw new Error(payload.error?.message ?? "Upstox candles are unavailable.");
        }
        viewportInitialized.current = false;
        setSeriesData(payload.candles);
        setFeedMode("live");
        onFeedStatus({
          mode: "live",
          message: payload.segments?.includes("intraday")
            ? "Upstox historical + intraday candles"
            : "Upstox historical candles",
          updatedAt: payload.fetchedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setFeedMode("simulated");
        onFeedStatus({
          mode: "simulated",
          message: error instanceof Error ? `${error.message} Using simulation.` : "Using simulated market data.",
        });
      }
    }

    void loadUpstoxCandles();
    return () => controller.abort();
  }, [instrument.instrumentKey, onFeedStatus, timeframe]);

  useEffect(() => {
    if (feedMode !== "simulated") return;
    const interval = window.setInterval(() => {
      const source = dataRef.current;
      if (!source.length) return;
      const last = source[source.length - 1];
      const change = (Math.random() - 0.48) * last.close * 0.0014;
      const updated: Candle = {
        ...last,
        close: Math.max(1, last.close + change),
        high: Math.max(last.high, last.close + change),
        low: Math.min(last.low, last.close + change),
      };
      const now = Math.floor(Date.now() / 1000);
      const step = timeframes[timeframe] ?? 300;
      if (now >= Number(last.time) + step) {
        const next: Candle = {
          time: (Number(last.time) + step) as UTCTimestamp,
          open: updated.close,
          high: updated.close,
          low: updated.close,
          close: updated.close,
        };
        dataRef.current = [...source, next];
        candleSeries.current?.update(next);
      } else {
        dataRef.current = [...source.slice(0, -1), updated];
        candleSeries.current?.update(updated);
      }
      const live = dataRef.current;
      ema5Series.current?.setData(ema(live, 5));
      ema21Series.current?.setData(ema(live, 21));
      rsiSeries.current?.setData(rsi(live, 14));
      onPrice(live.at(-1)?.close ?? instrument.price);
    }, 1400);
    return () => window.clearInterval(interval);
  }, [feedMode, instrument.price, onPrice, timeframe]);

  useEffect(() => {
    if (feedMode !== "live") return;
    const controller = new AbortController();

    async function refreshIntradayCandles() {
      try {
        const params = new URLSearchParams({
          instrumentKey: instrument.instrumentKey,
          timeframe,
          scope: "intraday",
        });
        const response = await fetch(`/api/upstox/candles?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as {
          ok?: boolean;
          candles?: Candle[];
          fetchedAt?: string;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok || !payload.candles?.length) {
          throw new Error(payload.error?.message ?? "Upstox intraday candles are unavailable.");
        }

        const merged = mergeSeries(dataRef.current, payload.candles);
        setSeriesData(merged);
        onFeedStatus({
          mode: "live",
          message: "Upstox historical + intraday candles",
          updatedAt: payload.fetchedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        onFeedStatus({
          mode: "error",
          message: error instanceof Error ? error.message : "Upstox candle refresh failed.",
        });
      }
    }

    const interval = window.setInterval(() => void refreshIntradayCandles(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [feedMode, instrument.instrumentKey, instrument.price, onFeedStatus, onPrice, timeframe]);

  useEffect(() => {
    if (feedMode !== "live") return;
    const controller = new AbortController();

    async function pollQuote() {
      try {
        const response = await fetch(
          `/api/upstox/quotes?keys=${encodeURIComponent(instrument.instrumentKey)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json() as {
          ok?: boolean;
          fetchedAt?: string;
          quotes?: Record<string, { lastPrice?: number; lastTradeAt?: string; updatedAt?: string }>;
          error?: { message?: string };
        };
        const quote = payload.quotes?.[instrument.symbol];
        const price = Number(quote?.lastPrice);
        if (!response.ok || !payload.ok || !Number.isFinite(price)) {
          throw new Error(payload.error?.message ?? "Upstox quote refresh failed.");
        }

        onPrice(price);
        onFeedStatus({
          mode: "live",
          message: "Upstox historical + intraday candles",
          updatedAt: quote?.lastTradeAt ?? payload.fetchedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        onFeedStatus({
          mode: "error",
          message: error instanceof Error ? error.message : "Upstox quote refresh failed.",
        });
      }
    }

    void pollQuote();
    const interval = window.setInterval(() => void pollQuote(), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [feedMode, instrument.instrumentKey, instrument.symbol, onFeedStatus, onPrice]);

  function addPoint(event: React.PointerEvent<SVGSVGElement>) {
    if (activeTool === "cursor") return;
    const rect = event.currentTarget.getBoundingClientRect();
    let x = ((event.clientX - rect.left) / rect.width) * 100;
    let y = ((event.clientY - rect.top) / rect.height) * 100;
    if (magnet) {
      x = Math.round(x / 2) * 2;
      y = Math.round(y / 2) * 2;
    }
    const next = [...draft, { x, y }];
    const needed = activeTool === "horizontal" ? 1 : activeTool === "channel" ? 3 : twoPointTools.includes(activeTool) ? 2 : 2;
    if (next.length >= needed) {
      setDrawings((current) => [...current, { id: Date.now(), tool: activeTool, points: next }]);
      setDraft([]);
    } else {
      setDraft(next);
    }
  }

  const latestCandle = seriesData.at(-1);

  return (
    <div className="chart-stack">
      <div className="price-chart-wrap">
        <div ref={chartHost} className="price-chart" aria-label="Interactive candlestick chart" />
        <svg
          className={`drawing-layer ${activeTool !== "cursor" ? "drawing-active" : ""}`}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={addPoint}
          aria-label="Chart drawing layer"
        >
          {!hiddenDrawings && drawings.map((drawing) => <DrawingShape key={drawing.id} drawing={drawing} />)}
          {draft.map((point, index) => <circle key={index} cx={`${point.x}%`} cy={`${point.y}%`} r="0.8" fill="#6b5cff" />)}
        </svg>
        <div className="chart-symbol-legend">
          <b>{instrument.name.toUpperCase()} · {timeframe.replace("m", "")} · NSE</b>
          {latestCandle && (
            <span>
              O <i>{latestCandle.open.toFixed(2)}</i>
              H <i>{latestCandle.high.toFixed(2)}</i>
              L <i>{latestCandle.low.toFixed(2)}</i>
              C <i className={latestCandle.close >= latestCandle.open ? "positive" : "negative"}>{latestCandle.close.toFixed(2)}</i>
            </span>
          )}
        </div>
        <div className="indicator-legend">
          <span><i className="ema-fast" />EMA 5</span>
          <span><i className="ema-slow" />EMA 21</span>
        </div>
      </div>
      <div className="rsi-wrap">
        <div className="rsi-label">RSI 14</div>
        <div ref={rsiHost} className="rsi-chart" aria-label="RSI indicator" />
      </div>
    </div>
  );
}
