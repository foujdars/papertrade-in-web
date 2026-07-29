"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
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
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [draft, setDraft] = useState<Point[]>([]);
  const [feedMode, setFeedMode] = useState<"loading" | "live" | "simulated">("loading");
  const [seriesData, setSeriesData] = useState<Candle[]>(() => generateCandles(instrument, timeframe));

  useEffect(() => {
    if (!chartHost.current || !rsiHost.current) return;
    const common = {
      layout: { background: { type: ColorType.Solid, color: "#ffffff" }, textColor: "#65708a", fontFamily: "Inter, Arial, sans-serif", fontSize: 11 },
      grid: { vertLines: { color: "#eef1f7" }, horzLines: { color: "#eef1f7" } },
      rightPriceScale: { borderColor: "#e6e9f2", minimumWidth: 64 },
      timeScale: { borderColor: "#e6e9f2", timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
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
    const fast = chart.addSeries(LineSeries, { color: "#0098e8", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    const slow = chart.addSeries(LineSeries, { color: "#ff8a00", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
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
  }, []);

  useEffect(() => {
    dataRef.current = seriesData;
    candleSeries.current?.setData(seriesData);
    ema5Series.current?.setData(ema(seriesData, 5));
    ema21Series.current?.setData(ema(seriesData, 21));
    rsiSeries.current?.setData(rsi(seriesData, 14));
    chartApi.current?.timeScale().fitContent();
    onPrice(seriesData.at(-1)?.close ?? instrument.price);
  }, [seriesData, instrument.price, onPrice]);

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
          fetchedAt?: string;
          error?: { message?: string };
        };
        if (!response.ok || !payload.ok || !payload.candles?.length) {
          throw new Error(payload.error?.message ?? "Upstox candles are unavailable.");
        }
        setSeriesData(payload.candles);
        setFeedMode("live");
        onFeedStatus({
          mode: "live",
          message: "Upstox market data",
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

    async function pollQuote() {
      try {
        const response = await fetch(
          `/api/upstox/quotes?keys=${encodeURIComponent(instrument.instrumentKey)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json() as {
          ok?: boolean;
          fetchedAt?: string;
          quotes?: Record<string, { lastPrice?: number; updatedAt?: string }>;
          error?: { message?: string };
        };
        const quote = payload.quotes?.[instrument.symbol];
        const price = Number(quote?.lastPrice);
        if (!response.ok || !payload.ok || !Number.isFinite(price)) {
          throw new Error(payload.error?.message ?? "Upstox quote refresh failed.");
        }

        const source = dataRef.current;
        if (!source.length) return;
        const last = source[source.length - 1];
        const quoteTime = Math.floor(new Date(quote?.updatedAt ?? payload.fetchedAt ?? Date.now()).getTime() / 1000);
        const step = timeframes[timeframe] ?? 300;
        const bucket = Math.floor(quoteTime / step) * step;
        let nextData: Candle[];
        let updated: Candle;
        if (bucket > Number(last.time)) {
          updated = {
            time: bucket as UTCTimestamp,
            open: last.close,
            high: Math.max(last.close, price),
            low: Math.min(last.close, price),
            close: price,
          };
          nextData = [...source, updated];
        } else {
          updated = {
            ...last,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            close: price,
          };
          nextData = [...source.slice(0, -1), updated];
        }
        dataRef.current = nextData;
        candleSeries.current?.update(updated);
        ema5Series.current?.setData(ema(nextData, 5));
        ema21Series.current?.setData(ema(nextData, 21));
        rsiSeries.current?.setData(rsi(nextData, 14));
        onPrice(price);
        onFeedStatus({
          mode: "live",
          message: "Upstox market data",
          updatedAt: payload.fetchedAt,
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
  }, [feedMode, instrument.instrumentKey, instrument.symbol, onFeedStatus, onPrice, timeframe]);

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
