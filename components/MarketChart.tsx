"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Chart,
  DeepPartial,
  KLineData,
  OverlayCreate,
  OverlayEvent,
  Styles,
} from "klinecharts";
import { generateCandles, timeframes, type Candle, type Instrument } from "@/lib/market";

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

type KLineModule = typeof import("klinecharts");

let paperOverlaysRegistered = false;

const chartStyles: DeepPartial<Styles> = {
  grid: {
    show: true,
    horizontal: { show: true, color: "#edf0f6", style: "dashed", size: 1, dashedValue: [3, 3] },
    vertical: { show: true, color: "#edf0f6", style: "dashed", size: 1, dashedValue: [3, 3] },
  },
  candle: {
    type: "candle_solid",
    bar: {
      upColor: "#00a67e",
      downColor: "#f04458",
      noChangeColor: "#8b93a6",
      upBorderColor: "#00a67e",
      downBorderColor: "#f04458",
      noChangeBorderColor: "#8b93a6",
      upWickColor: "#00a67e",
      downWickColor: "#f04458",
      noChangeWickColor: "#8b93a6",
    },
    priceMark: {
      high: { show: true, color: "#6b748a", textOffset: 5, textSize: 10, textFamily: "Inter", textWeight: "500" },
      low: { show: true, color: "#6b748a", textOffset: 5, textSize: 10, textFamily: "Inter", textWeight: "500" },
      last: {
        show: true,
        line: { show: true, style: "dashed", size: 1, dashedValue: [4, 3] },
        text: {
          show: true,
          color: "#ffffff",
          size: 11,
          family: "Inter",
          weight: 700,
          borderStyle: "solid",
          borderDashedValue: [],
          borderSize: 0,
          borderColor: "transparent",
          borderRadius: 2,
        },
      },
    },
    tooltip: {
      showRule: "follow_cross",
      showType: "standard",
      title: { show: true, color: "#20263b", size: 12, family: "Inter", weight: 700, marginLeft: 0, marginTop: 0, marginRight: 12, marginBottom: 8, template: "{ticker} · {period}" },
      legend: { color: "#65708a", size: 11, family: "Inter", weight: 600, marginLeft: 0, marginTop: 0, marginRight: 8, marginBottom: 0, defaultValue: "--", template: [] },
      features: [],
    },
  },
  indicator: {
    lastValueMark: {
      show: true,
      text: {
        show: true,
        color: "#ffffff",
        size: 10,
        family: "Inter",
        weight: 700,
        borderStyle: "solid",
        borderDashedValue: [],
        borderSize: 0,
        borderColor: "transparent",
        borderRadius: 2,
      },
    },
  },
  xAxis: {
    show: true,
    size: "auto",
    axisLine: { show: true, color: "#dfe3ec", size: 1 },
    tickLine: { show: true, color: "#dfe3ec", size: 1, length: 3 },
    tickText: { show: true, color: "#65708a", size: 11, family: "Inter", weight: 600, marginStart: 6, marginEnd: 4 },
  },
  yAxis: {
    show: true,
    size: "auto",
    axisLine: { show: true, color: "#dfe3ec", size: 1 },
    tickLine: { show: true, color: "#dfe3ec", size: 1, length: 3 },
    tickText: { show: true, color: "#65708a", size: 11, family: "Inter", weight: 500, marginStart: 6, marginEnd: 6 },
  },
  separator: { size: 1, color: "#e5e8f0", fill: true, activeBackgroundColor: "#d9d4ff" },
  crosshair: {
    show: true,
    horizontal: {
      show: true,
      line: { show: true, color: "#8c96aa", style: "dashed", size: 1, dashedValue: [4, 3] },
      text: {
        show: true,
        color: "#ffffff",
        size: 11,
        family: "Inter",
        weight: 650,
        borderStyle: "solid",
        borderDashedValue: [],
        borderSize: 0,
        borderColor: "#252b3d",
        borderRadius: 2,
        backgroundColor: "#252b3d",
        paddingLeft: 5,
        paddingTop: 3,
        paddingRight: 5,
        paddingBottom: 3,
      },
      features: [],
    },
    vertical: {
      show: true,
      line: { show: true, color: "#8c96aa", style: "dashed", size: 1, dashedValue: [4, 3] },
      text: {
        show: true,
        color: "#ffffff",
        size: 11,
        family: "Inter",
        weight: 650,
        borderStyle: "solid",
        borderDashedValue: [],
        borderSize: 0,
        borderColor: "#252b3d",
        borderRadius: 2,
        backgroundColor: "#252b3d",
        paddingLeft: 5,
        paddingTop: 3,
        paddingRight: 5,
        paddingBottom: 3,
      },
    },
  },
  overlay: {
    point: {
      color: "#ffffff",
      borderColor: "#6b5cff",
      borderSize: 2,
      radius: 4,
      activeColor: "#ffffff",
      activeBorderColor: "#5b4be8",
      activeBorderSize: 3,
      activeRadius: 5,
    },
    line: { color: "#6b5cff", style: "solid", size: 2, dashedValue: [5, 4], smooth: false },
    rect: { style: "stroke_fill", color: "#6b5cff16", borderColor: "#6b5cff", borderSize: 1, borderStyle: "solid", borderDashedValue: [], borderRadius: 0 },
    text: {
      style: "fill",
      color: "#ffffff",
      size: 11,
      family: "Inter",
      weight: 700,
      borderStyle: "solid",
      borderDashedValue: [],
      borderSize: 0,
      borderColor: "transparent",
      borderRadius: 3,
      backgroundColor: "#6b5cff",
      paddingLeft: 5,
      paddingTop: 3,
      paddingRight: 5,
      paddingBottom: 3,
    },
  },
};

function registerPaperOverlays(kline: KLineModule) {
  if (paperOverlaysRegistered) return;

  kline.registerOverlay({
    name: "paperRectangle",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    mode: "weak_magnet",
    modeSensitivity: 8,
    createPointFigures: ({ coordinates }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const width = Math.abs(a.x - b.x);
      const height = Math.abs(a.y - b.y);
      return [
        { type: "rect", attrs: { x, y, width, height } },
        {
          type: "line",
          attrs: { coordinates: [{ x, y: y + height / 2 }, { x: x + width, y: y + height / 2 }] },
          styles: { style: "dashed", dashedValue: [5, 4], color: "#6b5cff", size: 1 },
        },
      ];
    },
  });

  kline.registerOverlay({
    name: "paperPriceRange",
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    mode: "weak_magnet",
    modeSensitivity: 8,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const first = Number(overlay.points[0]?.value);
      const second = Number(overlay.points[1]?.value);
      const percent = Number.isFinite(first) && first !== 0 && Number.isFinite(second)
        ? `${second >= first ? "+" : ""}${(((second - first) / first) * 100).toFixed(2)}%`
        : "Price range";
      return [
        { type: "line", attrs: { coordinates: [a, b] }, styles: { color: "#6b5cff", size: 2 } },
        { type: "line", attrs: { coordinates: [{ x: a.x - 7, y: a.y }, { x: a.x + 7, y: a.y }] }, styles: { color: "#6b5cff", size: 1 } },
        { type: "line", attrs: { coordinates: [{ x: b.x - 7, y: b.y }, { x: b.x + 7, y: b.y }] }, styles: { color: "#6b5cff", size: 1 } },
        { type: "text", attrs: { x: b.x + 9, y: (a.y + b.y) / 2, text: percent, baseline: "middle" } },
      ];
    },
  });

  const registerPosition = (name: string, label: string, color: string, long: boolean) => {
    kline.registerOverlay({
      name,
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      mode: "weak_magnet",
      modeSensitivity: 8,
      createPointFigures: ({ coordinates }) => {
        if (coordinates.length < 2) return [];
        const [a, b] = coordinates;
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const width = Math.abs(a.x - b.x);
        const height = Math.abs(a.y - b.y);
        const middleY = long ? y + height * 0.62 : y + height * 0.38;
        return [
          {
            type: "rect",
            attrs: { x, y, width, height },
            styles: { style: "stroke_fill", color: `${color}18`, borderColor: color, borderSize: 1 },
          },
          {
            type: "line",
            attrs: { coordinates: [{ x, y: middleY }, { x: x + width, y: middleY }] },
            styles: { color, size: 1, style: "dashed", dashedValue: [5, 3] },
          },
          {
            type: "text",
            attrs: { x: x + 6, y: y + 7, text: label, baseline: "top" },
            styles: { backgroundColor: color, color: "#ffffff" },
          },
        ];
      },
    });
  };

  registerPosition("paperLongPosition", "LONG", "#00a67e", true);
  registerPosition("paperShortPosition", "SHORT", "#f04458", false);
  paperOverlaysRegistered = true;
}

function toKLineData(candle: Candle): KLineData {
  return {
    timestamp: Number(candle.time) * 1_000,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function mergeSeries(existing: Candle[], incoming: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const candle of [...existing, ...incoming]) byTime.set(Number(candle.time), candle);
  return [...byTime.values()]
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-1_600);
}

function periodFor(timeframe: string) {
  if (timeframe === "1D") return { type: "day" as const, span: 1 };
  if (timeframe.endsWith("H")) return { type: "hour" as const, span: Number(timeframe.replace("H", "")) || 1 };
  return { type: "minute" as const, span: Number(timeframe.replace("m", "")) || 5 };
}

const overlayNames: Partial<Record<DrawingTool, string>> = {
  trend: "segment",
  horizontal: "horizontalStraightLine",
  ray: "horizontalRayLine",
  channel: "priceChannelLine",
  rectangle: "paperRectangle",
  fib: "fibonacciLine",
  range: "paperPriceRange",
  long: "paperLongPosition",
  short: "paperShortPosition",
};

function snapshotOverlay(event: OverlayEvent<unknown>): OverlayCreate {
  return {
    name: event.overlay.name,
    groupId: "papertrade",
    points: event.overlay.points.map((point) => ({
      timestamp: point.timestamp,
      dataIndex: point.dataIndex,
      value: point.value,
    })),
    mode: event.overlay.mode,
    modeSensitivity: event.overlay.modeSensitivity,
    visible: true,
  };
}

export function MarketChart({
  instrument,
  timeframe,
  activeTool,
  toolSignal = 0,
  magnet,
  hiddenDrawings,
  lockedDrawings = false,
  clearSignal = 0,
  undoSignal = 0,
  redoSignal = 0,
  visibleBars = 155,
  onPrice,
  onFeedStatus,
}: {
  instrument: Instrument;
  timeframe: string;
  activeTool: DrawingTool;
  toolSignal?: number;
  magnet: boolean;
  hiddenDrawings: boolean;
  lockedDrawings?: boolean;
  clearSignal?: number;
  undoSignal?: number;
  redoSignal?: number;
  visibleBars?: number;
  onPrice: (value: number) => void;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  const chartHost = useRef<HTMLDivElement>(null);
  const chartApi = useRef<Chart | null>(null);
  const [initialCandles] = useState<Candle[]>(() => generateCandles(instrument, timeframe, 420));
  const dataRef = useRef<Candle[]>(initialCandles);
  const streamCallback = useRef<((data: KLineData) => void) | null>(null);
  const historyRef = useRef<OverlayCreate[]>([]);
  const redoRef = useRef<OverlayCreate[]>([]);
  const previousClear = useRef(clearSignal);
  const previousUndo = useRef(undoSignal);
  const previousRedo = useRef(redoSignal);
  const initialVisibleBars = useRef(visibleBars);
  const [latestCandle, setLatestCandle] = useState<Candle | undefined>(() => initialCandles.at(-1));
  const [feedMode, setFeedMode] = useState<"loading" | "live" | "simulated">("loading");

  useEffect(() => {
    if (!chartHost.current) return;
    const host = chartHost.current;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let klineModule: KLineModule | null = null;

    void import("klinecharts").then((kline) => {
      if (cancelled) return;
      klineModule = kline;
      registerPaperOverlays(kline);
      const chart = kline.init(host, {
        locale: "en-US",
        timezone: "Asia/Kolkata",
        styles: chartStyles,
        zoomAnchor: "cursor",
        layout: {
          barSpaceLimit: { min: 2, max: 40 },
          pane: { minHeight: 86, dragEnabled: true },
          yAxis: { position: "right", inside: false, scrollZoomEnabled: true, gap: { top: 0.12, bottom: 0.12 } },
        },
      });
      if (!chart) return;

      chartApi.current = chart;
      chart.setOffsetRightDistance(78);
      chart.setDataLoader({
        getBars: ({ type, callback }) => {
          if (type === "init") {
            callback(dataRef.current.map(toKLineData), { forward: false, backward: false });
          } else {
            callback([], { forward: false, backward: false });
          }
        },
        subscribeBar: ({ callback }) => {
          streamCallback.current = callback;
        },
        unsubscribeBar: () => {
          streamCallback.current = null;
        },
      });
      chart.setSymbol({ ticker: `${instrument.symbol} · NSE`, pricePrecision: 2, volumePrecision: 0 });
      chart.setPeriod(periodFor(timeframe));
      chart.createIndicator({
        name: "EMA",
        shortName: "EMA 5 21",
        paneId: "candle_pane",
        calcParams: [5, 21],
        precision: 2,
        styles: {
          lines: [
            { color: "#0ea5e9", size: 2, style: "solid", dashedValue: [], smooth: false },
            { color: "#ff8a00", size: 2, style: "solid", dashedValue: [], smooth: false },
          ],
        },
      }, true);
      const rsiId = chart.createIndicator({
        name: "RSI",
        shortName: "RSI 14",
        calcParams: [14],
        precision: 2,
        minValue: 0,
        maxValue: 100,
        styles: {
          lines: [{ color: "#7c4dff", size: 2, style: "solid", dashedValue: [], smooth: false }],
        },
      });
      if (rsiId) {
        const rsiIndicator = chart.getIndicators({ id: rsiId })[0];
        if (rsiIndicator) chart.setPaneOptions({ id: rsiIndicator.paneId, height: 126, minHeight: 90, dragEnabled: true });
      }

      const width = Math.max(320, host.clientWidth - 86);
      chart.setBarSpace(Math.max(2.4, Math.min(18, width / Math.max(30, initialVisibleBars.current))));
      chart.scrollToRealTime();
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(host);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      streamCallback.current = null;
      if (chartApi.current && klineModule) klineModule.dispose(chartApi.current);
      chartApi.current = null;
    };
  }, [instrument.symbol, timeframe]);

  useEffect(() => {
    const chart = chartApi.current;
    const host = chartHost.current;
    if (!chart || !host) return;
    const width = Math.max(320, host.clientWidth - 86);
    chart.setBarSpace(Math.max(2.4, Math.min(18, width / Math.max(30, visibleBars))));
    chart.scrollToRealTime(180);
  }, [visibleBars]);

  useEffect(() => {
    const chart = chartApi.current;
    const name = overlayNames[activeTool];
    if (!chart || !name || activeTool === "cursor") return;
    const onDrawEnd = (event: OverlayEvent<unknown>) => {
      historyRef.current.push(snapshotOverlay(event));
      redoRef.current = [];
    };
    chart.createOverlay({
      name,
      groupId: "papertrade",
      mode: magnet ? "strong_magnet" : "normal",
      modeSensitivity: 10,
      visible: !hiddenDrawings,
      lock: lockedDrawings,
      onDrawEnd,
    });
  }, [activeTool, hiddenDrawings, lockedDrawings, magnet, toolSignal]);

  useEffect(() => {
    chartApi.current?.overrideOverlay({ groupId: "papertrade", visible: !hiddenDrawings });
  }, [hiddenDrawings]);

  useEffect(() => {
    chartApi.current?.overrideOverlay({ groupId: "papertrade", lock: lockedDrawings });
  }, [lockedDrawings]);

  useEffect(() => {
    if (clearSignal === previousClear.current) return;
    previousClear.current = clearSignal;
    chartApi.current?.removeOverlay({ groupId: "papertrade" });
    historyRef.current = [];
    redoRef.current = [];
  }, [clearSignal]);

  useEffect(() => {
    if (undoSignal === previousUndo.current) return;
    previousUndo.current = undoSignal;
    const chart = chartApi.current;
    const overlay = chart?.getOverlays({ groupId: "papertrade" }).at(-1);
    const snapshot = historyRef.current.pop();
    if (chart && overlay && snapshot) {
      chart.removeOverlay({ id: overlay.id });
      redoRef.current.push(snapshot);
    }
  }, [undoSignal]);

  useEffect(() => {
    if (redoSignal === previousRedo.current) return;
    previousRedo.current = redoSignal;
    const chart = chartApi.current;
    const snapshot = redoRef.current.pop();
    if (chart && snapshot) {
      chart.createOverlay(snapshot);
      historyRef.current.push(snapshot);
    }
  }, [redoSignal]);

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
        dataRef.current = payload.candles;
        const latest = payload.candles.at(-1);
        setLatestCandle(latest);
        if (latest) onPrice(latest.close);
        chartApi.current?.resetData();
        chartApi.current?.scrollToRealTime();
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
  }, [instrument.instrumentKey, onFeedStatus, onPrice, timeframe]);

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
      const now = Math.floor(Date.now() / 1_000);
      const step = timeframes[timeframe] ?? 300;
      if (now >= Number(last.time) + step) {
        const close = updated.close;
        dataRef.current = [...source, {
          time: (Number(last.time) + step) as Candle["time"],
          open: close,
          high: close,
          low: close,
          close,
        }];
      } else {
        dataRef.current = [...source.slice(0, -1), updated];
      }
      const latest = dataRef.current.at(-1);
      if (!latest) return;
      streamCallback.current?.(toKLineData(latest));
      setLatestCandle(latest);
      onPrice(latest.close);
    }, 1_400);
    return () => window.clearInterval(interval);
  }, [feedMode, onPrice, timeframe]);

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
        dataRef.current = mergeSeries(dataRef.current, payload.candles);
        const latest = dataRef.current.at(-1);
        if (latest) {
          streamCallback.current?.(toKLineData(latest));
          setLatestCandle(latest);
          onPrice(latest.close);
        }
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
  }, [feedMode, instrument.instrumentKey, onFeedStatus, onPrice, timeframe]);

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
          quotes?: Record<string, { lastPrice?: number; lastTradeAt?: string }>;
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

  return (
    <div className="chart-stack kline-stack">
      <div className="price-chart-wrap kline-chart-wrap">
        <div ref={chartHost} className="price-chart kline-chart" aria-label="Interactive KLineChart candlestick chart" />
        <div className="chart-symbol-legend kline-symbol-legend">
          <b>{instrument.name.toUpperCase()} · {timeframe} · NSE</b>
          {latestCandle && (
            <span>
              O <i>{latestCandle.open.toFixed(2)}</i>
              H <i>{latestCandle.high.toFixed(2)}</i>
              L <i>{latestCandle.low.toFixed(2)}</i>
              C <i className={latestCandle.close >= latestCandle.open ? "positive" : "negative"}>{latestCandle.close.toFixed(2)}</i>
            </span>
          )}
        </div>
        <div className="indicator-legend kline-indicator-legend">
          <span><i className="ema-fast" />EMA 5</span>
          <span><i className="ema-slow" />EMA 21</span>
          <span><i className="rsi-color" />RSI 14</span>
        </div>
      </div>
    </div>
  );
}
