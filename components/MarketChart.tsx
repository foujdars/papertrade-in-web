"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { ColorType } from "lightweight-charts";
import type {
  Anchor,
  DrawingManager,
  DrawingStyle,
  IDrawing,
  SerializedDrawing,
  ToolRegistry,
} from "lightweight-charts-drawing";
import { bollingerBands, classicPivotPoints, ema, macd, rsi, sma, supertrend, vwap, type Candle, type Instrument, type PivotLevel } from "@/lib/market";

export const DRAWING_TOOL_CATALOG = [
  { id: "trend-line", label: "Trend Line", category: "Lines", anchors: 2 },
  { id: "horizontal-line", label: "Horizontal Line", category: "Lines", anchors: 1 },
  { id: "vertical-line", label: "Vertical Line", category: "Lines", anchors: 1 },
  { id: "ray", label: "Ray", category: "Lines", anchors: 2 },
  { id: "arrow", label: "Arrow", category: "Lines", anchors: 2 },
  { id: "extended-line", label: "Extended Line", category: "Lines", anchors: 2 },
  { id: "cross-line", label: "Cross Line", category: "Lines", anchors: 1 },
  { id: "info-line", label: "Info Line", category: "Lines", anchors: 2 },
  { id: "trend-angle", label: "Trend Angle", category: "Lines", anchors: 2 },
  { id: "horizontal-ray", label: "Horizontal Ray", category: "Lines", anchors: 1 },
  { id: "parallel-channel", label: "Parallel Channel", category: "Channels", anchors: 3 },
  { id: "regression-trend", label: "Regression Trend", category: "Channels", anchors: 2 },
  { id: "flat-top-bottom", label: "Flat Top / Bottom", category: "Channels", anchors: 3 },
  { id: "disjoint-channel", label: "Disjoint Channel", category: "Channels", anchors: 4 },
  { id: "fib-retracement", label: "Fibonacci Retracement", category: "Fibonacci", anchors: 2 },
  { id: "fib-extension", label: "Fibonacci Extension", category: "Fibonacci", anchors: 3 },
  { id: "fib-channel", label: "Fibonacci Channel", category: "Fibonacci", anchors: 3 },
  { id: "fib-time-zone", label: "Fibonacci Time Zone", category: "Fibonacci", anchors: 2 },
  { id: "fib-speed-fan", label: "Fibonacci Speed Fan", category: "Fibonacci", anchors: 2 },
  { id: "fib-time-extension", label: "Trend-Based Fib Time", category: "Fibonacci", anchors: 3 },
  { id: "fib-circles", label: "Fibonacci Circles", category: "Fibonacci", anchors: 2 },
  { id: "fib-spiral", label: "Fibonacci Spiral", category: "Fibonacci", anchors: 2 },
  { id: "fib-arcs", label: "Fibonacci Arcs", category: "Fibonacci", anchors: 2 },
  { id: "fib-wedge", label: "Fibonacci Wedge", category: "Fibonacci", anchors: 3 },
  { id: "pitchfan", label: "Pitchfan", category: "Fibonacci", anchors: 3 },
  { id: "andrews-pitchfork", label: "Andrews' Pitchfork", category: "Pitchforks", anchors: 3 },
  { id: "schiff-pitchfork", label: "Schiff Pitchfork", category: "Pitchforks", anchors: 3 },
  { id: "modified-schiff-pitchfork", label: "Modified Schiff Pitchfork", category: "Pitchforks", anchors: 3 },
  { id: "inside-pitchfork", label: "Inside Pitchfork", category: "Pitchforks", anchors: 3 },
  { id: "gann-box", label: "Gann Box", category: "Gann", anchors: 2 },
  { id: "gann-fan", label: "Gann Fan", category: "Gann", anchors: 2 },
  { id: "gann-square-fixed", label: "Gann Square Fixed", category: "Gann", anchors: 1 },
  { id: "gann-square", label: "Gann Square", category: "Gann", anchors: 2 },
  { id: "long-position", label: "Long Position", category: "Trading", anchors: 3 },
  { id: "short-position", label: "Short Position", category: "Trading", anchors: 3 },
  { id: "forecast", label: "Forecast", category: "Trading", anchors: 2 },
  { id: "bars-pattern", label: "Bars Pattern", category: "Trading", anchors: 3 },
  { id: "projection", label: "Projection", category: "Trading", anchors: 3 },
  { id: "price-range", label: "Price Range", category: "Measurement", anchors: 2 },
  { id: "date-range", label: "Date Range", category: "Measurement", anchors: 2 },
  { id: "date-price-range", label: "Date and Price Range", category: "Measurement", anchors: 2 },
  { id: "rectangle", label: "Rectangle", category: "Shapes", anchors: 2 },
  { id: "rotated-rectangle", label: "Rotated Rectangle", category: "Shapes", anchors: 3 },
  { id: "circle", label: "Circle", category: "Shapes", anchors: 2 },
  { id: "triangle", label: "Triangle", category: "Shapes", anchors: 3 },
  { id: "ellipse", label: "Ellipse", category: "Shapes", anchors: 2 },
  { id: "arc", label: "Arc", category: "Shapes", anchors: 3 },
  { id: "path", label: "Path", category: "Shapes", anchors: 2 },
  { id: "polyline", label: "Polyline", category: "Shapes", anchors: 2 },
  { id: "curve", label: "Curve", category: "Shapes", anchors: 4 },
  { id: "double-curve", label: "Double Curve", category: "Shapes", anchors: 3 },
  { id: "text-annotation", label: "Text", category: "Annotations", anchors: 1 },
  { id: "callout", label: "Callout", category: "Annotations", anchors: 2 },
  { id: "anchored-text", label: "Anchored Text", category: "Annotations", anchors: 2 },
  { id: "note", label: "Note", category: "Annotations", anchors: 1 },
  { id: "price-note", label: "Price Note", category: "Annotations", anchors: 1 },
  { id: "price-label", label: "Price Label", category: "Annotations", anchors: 1 },
  { id: "flag-mark", label: "Flag Mark", category: "Annotations", anchors: 1 },
  { id: "pin", label: "Pin", category: "Annotations", anchors: 1 },
  { id: "comment", label: "Comment", category: "Annotations", anchors: 1 },
  { id: "signpost", label: "Signpost", category: "Annotations", anchors: 1 },
  { id: "table", label: "Table", category: "Annotations", anchors: 1 },
  { id: "brush", label: "Brush", category: "Annotations", anchors: 2 },
  { id: "highlighter", label: "Highlighter", category: "Annotations", anchors: 2 },
  { id: "arrow-marker", label: "Arrow Marker", category: "Annotations", anchors: 1 },
  { id: "arrow-mark-up", label: "Arrow Mark Up", category: "Annotations", anchors: 1 },
  { id: "arrow-mark-down", label: "Arrow Mark Down", category: "Annotations", anchors: 1 },
] as const;

export type DrawingToolId = (typeof DRAWING_TOOL_CATALOG)[number]["id"];
export type DrawingTool = "cursor" | DrawingToolId;

export type FeedStatus = {
  mode: "loading" | "live" | "stale" | "error";
  message: string;
  updatedAt?: string;
};

export type ChartIndicators = {
  ema5: boolean;
  ema21: boolean;
  ema50: boolean;
  ema200: boolean;
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  bollinger: boolean;
  vwap: boolean;
  supertrend: boolean;
  rsi: boolean;
  macd: boolean;
  pivots: boolean;
};

export const DEFAULT_CHART_INDICATORS: ChartIndicators = {
  ema5: false,
  ema21: false,
  ema50: false,
  ema200: false,
  sma20: false,
  sma50: false,
  sma200: false,
  bollinger: false,
  vwap: false,
  supertrend: false,
  rsi: false,
  macd: false,
  pivots: false,
};

export type ChartAction =
  | "fit"
  | "reset"
  | "live"
  | "zoom-in"
  | "zoom-out"
  | "screenshot"
  | "toggle-grid"
  | "toggle-crosshair"
  | "scale-normal"
  | "scale-log"
  | "scale-percent"
  | "scale-indexed";

export type ChartActionRequest = { type: ChartAction; token: number };

export type ChartOrderTool = {
  enabled: boolean;
  side: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  quantity: number;
  livePnl?: number;
};

export type ChartTradeMarker = {
  id: string;
  time: number;
  price: number;
  side: "BUY" | "SELL";
  role: "ENTRY" | "EXIT";
  quantity?: number;
};

type DraftDrawing = {
  toolType: DrawingToolId;
  requiredAnchors: number;
  confirmed: Anchor[];
  drawing: IDrawing;
  continuous: boolean;
  pointerId: number | null;
};

type DrawingEdit = {
  drawing: IDrawing;
  anchorIndex: number | null;
  start: Anchor;
  originalAnchors: Anchor[];
};

const DRAWING_STORAGE_PREFIX = "papertrade-lwc-drawings-v1";
const LEGACY_TOOL_ALIASES: Record<string, DrawingToolId> = {
  trend: "trend-line",
  straight: "extended-line",
  diagonalRay: "ray",
  horizontal: "horizontal-line",
  vertical: "vertical-line",
  channel: "parallel-channel",
  fib: "fib-retracement",
  range: "price-range",
  long: "long-position",
  short: "short-position",
};
const CONTINUOUS_TOOLS = new Set<DrawingToolId>(["brush", "highlighter", "path"]);

const DEFAULT_DRAWING_STYLE: Partial<DrawingStyle> = {
  lineColor: "#6657ee",
  lineWidth: 1,
  lineDash: [],
  fillColor: "rgba(102, 87, 238, 0.10)",
  fillOpacity: 0.1,
  showLabels: true,
  labelColor: "#6657ee",
  labelFont: "11px Inter, sans-serif",
};

function toolStyle(tool: DrawingToolId): Partial<DrawingStyle> {
  if (tool === "long-position") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#00a67e", fillColor: "rgba(0, 166, 126, .12)" };
  if (tool === "short-position") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#f04458", fillColor: "rgba(240, 68, 88, .12)" };
  if (tool === "highlighter") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#f5b800", fillColor: "rgba(245, 184, 0, .22)" };
  return DEFAULT_DRAWING_STYLE;
}

function toolOptions(tool: DrawingToolId) {
  if (tool.startsWith("fib-")) {
    return { visible: true, locked: false, showPrices: false, showPercentages: true, showLabels: true };
  }
  return { visible: true, locked: false };
}

function normalizeTool(tool: DrawingTool): DrawingToolId | null {
  if (tool === "cursor") return null;
  return LEGACY_TOOL_ALIASES[tool] ?? tool as DrawingToolId;
}

function drawingStorageKey(instrument: Instrument) {
  return `${DRAWING_STORAGE_PREFIX}:${instrument.instrumentKey}`;
}

function legacyDrawingStorageKey(instrument: Instrument, timeframe: string) {
  return `${DRAWING_STORAGE_PREFIX}:${instrument.instrumentKey}:${timeframe}`;
}

function readStoredDrawings(key: string, legacyKey?: string): SerializedDrawing[] {
  try {
    const current = window.localStorage.getItem(key);
    if (current !== null) {
      const parsed = JSON.parse(current) as SerializedDrawing[];
      return Array.isArray(parsed) ? parsed : [];
    }
    const legacyKeys = new Set<string>();
    if (legacyKey) legacyKeys.add(legacyKey);
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const candidate = window.localStorage.key(index);
      if (candidate?.startsWith(`${key}:`)) legacyKeys.add(candidate);
    }
    const merged = new Map<string, SerializedDrawing>();
    for (const candidate of legacyKeys) {
      const parsed = JSON.parse(window.localStorage.getItem(candidate) ?? "[]") as SerializedDrawing[];
      if (!Array.isArray(parsed)) continue;
      for (const drawing of parsed) merged.set(drawing.id, drawing);
    }
    return [...merged.values()];
  } catch {
    return [];
  }
}

function mergeSeries(existing: Candle[], incoming: Candle[]) {
  const byTime = new Map<number, Candle>();
  for (const candle of [...existing, ...incoming]) byTime.set(Number(candle.time), candle);
  return [...byTime.values()]
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-1_600);
}

function toCandleData(candle: Candle): CandlestickData<Time> {
  return {
    time: Math.floor(Number(candle.time)) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function latestIndicatorValues(data: Candle[]) {
  return {
    ema5: ema(data, 5).at(-1)?.value ?? 0,
    ema21: ema(data, 21).at(-1)?.value ?? 0,
    ema50: ema(data, 50).at(-1)?.value ?? 0,
    ema200: ema(data, 200).at(-1)?.value ?? 0,
    sma20: sma(data, 20).at(-1)?.value ?? 0,
    sma50: sma(data, 50).at(-1)?.value ?? 0,
    sma200: sma(data, 200).at(-1)?.value ?? 0,
    vwap: vwap(data).at(-1)?.value ?? 0,
    rsi: rsi(data, 14).at(-1)?.value ?? 50,
  };
}

function timeToTimestamp(time: Time) {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Math.floor(new Date(time).getTime() / 1_000);
  return Date.UTC(time.year, time.month - 1, time.day) / 1_000;
}

function projectDrawingsToCandles(snapshot: SerializedDrawing[], candles: Candle[]) {
  if (!candles.length) return snapshot;
  const candleTimes = candles.map((candle) => Number(candle.time));
  return snapshot.map((item) => ({
    ...item,
    anchors: item.anchors.map((anchor) => {
      const timestamp = timeToTimestamp(anchor.time);
      let nearest = candleTimes[0];
      let distance = Math.abs(nearest - timestamp);
      for (let index = 1; index < candleTimes.length; index += 1) {
        const nextDistance = Math.abs(candleTimes[index] - timestamp);
        if (nextDistance >= distance) continue;
        nearest = candleTimes[index];
        distance = nextDistance;
      }
      return { ...anchor, time: nearest as UTCTimestamp };
    }),
  }));
}

function indiaTime(time: Time) {
  const timestamp = timeToTimestamp(time);
  return new Date(timestamp * 1_000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointToSegmentDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return pointDistance(point, start);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return pointDistance(point, { x: start.x + position * dx, y: start.y + position * dy });
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
  visibleBars = 22,
  indicators,
  chartAction,
  chartTheme = "light",
  orderTool,
  tradeMarkers = [],
  onOrderSide,
  onOrderToolChange,
  onOrderToolClose,
  onOrderToolExit,
  onDrawingComplete,
  onChartTap,
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
  indicators: ChartIndicators;
  chartAction?: ChartActionRequest;
  chartTheme?: "light" | "neon";
  orderTool?: ChartOrderTool;
  tradeMarkers?: ChartTradeMarker[];
  onOrderSide?: (side: "BUY" | "SELL") => void;
  onOrderToolChange?: (level: "target" | "stopLoss", value: number, committed: boolean) => void;
  onOrderToolClose?: () => void;
  onOrderToolExit?: () => void;
  onDrawingComplete?: () => void;
  onChartTap?: () => void;
  onPrice?: (value: number) => void;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  const chartHost = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema5Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Series = useRef<ISeriesApi<"Line"> | null>(null);
  const sma20Series = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200Series = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const supertrendSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const bollingerSeries = useRef<Array<ISeriesApi<"Line">>>([]);
  const pivotSeries = useRef<Partial<Record<PivotLevel, ISeriesApi<"Line">>>>({});
  const rsiSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistogramSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdPaneIndexRef = useRef(1);
  const drawingManager = useRef<DrawingManager | null>(null);
  const drawingRegistry = useRef<ToolRegistry | null>(null);
  const draftRef = useRef<DraftDrawing | null>(null);
  const editRef = useRef<DrawingEdit | null>(null);
  const activeToolRef = useRef(activeTool);
  const magnetRef = useRef(magnet);
  const lockedRef = useRef(lockedDrawings);
  const hiddenRef = useRef(hiddenDrawings);
  const [initialData] = useState<Candle[]>([]);
  const dataRef = useRef<Candle[]>(initialData);
  const storedDrawingsRef = useRef<SerializedDrawing[]>([]);
  const historyRef = useRef<SerializedDrawing[][]>([]);
  const redoRef = useRef<SerializedDrawing[][]>([]);
  const restoringRef = useRef(false);
  const previousClear = useRef(clearSignal);
  const previousUndo = useRef(undoSignal);
  const previousRedo = useRef(redoSignal);
  const visibleBarsRef = useRef(visibleBars);
  const indicatorsRef = useRef(indicators);
  const storageKeyRef = useRef(drawingStorageKey(instrument));
  const gridVisibleRef = useRef(true);
  const crosshairVisibleRef = useRef(true);
  const orderToolRef = useRef(orderTool);
  const tradeMarkersRef = useRef(tradeMarkers);
  const onChartTapRef = useRef(onChartTap);
  const onDrawingCompleteRef = useRef(onDrawingComplete);
  const tapGestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const riskDragRef = useRef<"target" | "stopLoss" | null>(null);
  const riskDragPriceRef = useRef(0);
  const [latestCandle, setLatestCandle] = useState<Candle | undefined>(() => initialData.at(-1));
  const [indicatorValues, setIndicatorValues] = useState(() => latestIndicatorValues(initialData));
  const [feedMode, setFeedMode] = useState<"loading" | "live" | "stale" | "error">("loading");
  const [placementHint, setPlacementHint] = useState("");
  const [riskCoordinates, setRiskCoordinates] = useState<{ entry: number | null; target: number | null; stopLoss: number | null } | null>(null);
  const [tradeMarkerCoordinates, setTradeMarkerCoordinates] = useState<Array<ChartTradeMarker & { x: number; y: number; direction: "up" | "down" }>>([]);

  useEffect(() => {
    onChartTapRef.current = onChartTap;
  }, [onChartTap]);

  useEffect(() => {
    onDrawingCompleteRef.current = onDrawingComplete;
  }, [onDrawingComplete]);

  function refreshRiskCoordinates() {
    const series = candleSeries.current;
    const tool = orderToolRef.current;
    if (!series || !tool?.enabled) {
      setRiskCoordinates(null);
      return;
    }
    const entry = series.priceToCoordinate(tool.entryPrice);
    const target = series.priceToCoordinate(tool.targetPrice);
    const stopLoss = series.priceToCoordinate(tool.stopLossPrice);
    if (entry === null || target === null || stopLoss === null) {
      setRiskCoordinates(null);
      return;
    }
    const chartHeight = chartHost.current?.clientHeight ?? 0;
    const legendSafeTop = 58;
    const axisSafeBottom = Math.max(legendSafeTop, chartHeight - 28);
    const visibleCoordinate = (coordinate: number) => coordinate >= legendSafeTop && coordinate <= axisSafeBottom
      ? coordinate
      : null;
    const nextCoordinates = {
      entry: visibleCoordinate(entry),
      target: visibleCoordinate(target),
      stopLoss: visibleCoordinate(stopLoss),
    };
    setRiskCoordinates((current) => {
      const coordinateMatches = (previous: number | null, next: number | null) => previous === null || next === null
        ? previous === next
        : Math.abs(previous - next) < .3;
      if (current && coordinateMatches(current.entry, nextCoordinates.entry) && coordinateMatches(current.target, nextCoordinates.target) && coordinateMatches(current.stopLoss, nextCoordinates.stopLoss)) return current;
      return nextCoordinates;
    });
  }

  function refreshTradeMarkerCoordinates() {
    const chart = chartApi.current;
    const series = candleSeries.current;
    const markers = tradeMarkersRef.current;
    const candles = dataRef.current;
    const host = chartHost.current;
    if (!chart || !series || !host || !markers.length || !candles.length) {
      setTradeMarkerCoordinates([]);
      return;
    }
    const chartHeight = host.clientHeight;
    const chartWidth = host.clientWidth;
    const topPadding = 18;
    const bottomPadding = Math.max(topPadding, chartHeight - 26);
    const next = markers.flatMap((marker) => {
      const markerTime = marker.time > 1_000_000_000_000 ? Math.floor(marker.time / 1_000) : Math.floor(marker.time);
      let nearest = candles[0];
      let nearestDistance = Math.abs(Number(nearest.time) - markerTime);
      for (const candle of candles) {
        const distance = Math.abs(Number(candle.time) - markerTime);
        if (distance < nearestDistance) {
          nearest = candle;
          nearestDistance = distance;
        }
      }
      const x = chart.timeScale().timeToCoordinate(Math.floor(Number(nearest.time)) as UTCTimestamp);
      const anchorPrice = marker.side === "BUY"
        ? Math.min(marker.price, nearest.low)
        : Math.max(marker.price, nearest.high);
      const yBase = series.priceToCoordinate(anchorPrice);
      if (x === null || yBase === null || x < -18 || x > chartWidth + 18) return [];
      const y = marker.side === "BUY" ? yBase + 18 : yBase - 18;
      if (y < topPadding || y > bottomPadding) return [];
      return [{ ...marker, x, y, direction: marker.side === "BUY" ? "up" as const : "down" as const }];
    });
    setTradeMarkerCoordinates((current) => {
      if (current.length !== next.length) return next;
      const same = current.every((item, index) => {
        const other = next[index];
        return item.id === other.id && Math.abs(item.x - other.x) < .4 && Math.abs(item.y - other.y) < .4;
      });
      return same ? current : next;
    });
  }

  function orderToolPnl(tool: ChartOrderTool, price: number) {
    const direction = tool.side === "BUY" ? 1 : -1;
    return (price - tool.entryPrice) * direction * tool.quantity;
  }

  function formatRiskPnl(value: number) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }

  function riskPriceFromPointer(event: ReactPointerEvent<HTMLDivElement>, level: "target" | "stopLoss") {
    const host = chartHost.current;
    const series = candleSeries.current;
    const tool = orderToolRef.current;
    if (!host || !series || !tool) return null;
    const bounds = host.getBoundingClientRect();
    const rawPrice = series.coordinateToPrice(Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)));
    if (rawPrice === null || !Number.isFinite(rawPrice)) return null;
    const tick = Math.max(.05, tool.entryPrice * .0001);
    if (tool.side === "BUY") {
      return level === "target" ? Math.max(tool.entryPrice + tick, rawPrice) : Math.max(tick, Math.min(tool.entryPrice - tick, rawPrice));
    }
    return level === "target" ? Math.max(tick, Math.min(tool.entryPrice - tick, rawPrice)) : Math.max(tool.entryPrice + tick, rawPrice);
  }

  function beginRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    riskDragRef.current = level;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    chartApi.current?.applyOptions({ handleScroll: false, handleScale: false });
    event.preventDefault();
    event.stopPropagation();
  }

  function moveRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    if (riskDragRef.current !== level) return;
    const price = riskPriceFromPointer(event, level);
    if (price === null) return;
    riskDragPriceRef.current = price;
    onOrderToolChange?.(level, price, false);
    event.preventDefault();
    event.stopPropagation();
  }

  function endRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    if (riskDragRef.current !== level) return;
    const price = riskPriceFromPointer(event, level) ?? riskDragPriceRef.current;
    riskDragRef.current = null;
    chartApi.current?.applyOptions({ handleScroll: activeToolRef.current === "cursor", handleScale: activeToolRef.current === "cursor" });
    if (price > 0) onOrderToolChange?.(level, price, true);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function applyVisibleRange(data = dataRef.current) {
    const chart = chartApi.current;
    if (!chart || !data.length) return;
    const count = data.length;
    const bars = Math.max(12, Math.min(visibleBarsRef.current, count));
    const tool = orderToolRef.current;
    const extraRightOffset = tool?.enabled ? Math.max(5, Math.min(10, bars * 0.18)) : Math.max(2, Math.min(4, bars * 0.08));
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-0.5, count - bars - 0.5),
      to: count - 1 + extraRightOffset,
    });
  }

  function fitStudyPanes(next = indicatorsRef.current) {
    const chart = chartApi.current;
    const host = chartHost.current;
    if (!chart || !host) return;
    window.requestAnimationFrame(() => {
      if (chartApi.current !== chart) return;
      const panes = chart.panes();
      const lowerPaneCount = Number(next.rsi) + Number(next.macd);
      const totalHeight = Math.max(280, host.clientHeight);
      if (!lowerPaneCount) {
        panes[0]?.setHeight(totalHeight);
        return;
      }
      const minimumLowerHeight = lowerPaneCount === 1 ? 88 : 72;
      const lowerHeight = Math.max(minimumLowerHeight, Math.min(118, Math.floor(totalHeight * (lowerPaneCount === 1 ? 0.25 : 0.19))));
      panes[0]?.setHeight(Math.max(150, totalHeight - lowerHeight * lowerPaneCount));
      if (next.rsi) panes[1]?.setHeight(lowerHeight);
      if (next.macd) panes[next.rsi ? 2 : 1]?.setHeight(lowerHeight);
    });
  }

  function syncIndicatorData(data = dataRef.current) {
    ema5Series.current?.setData(ema(data, 5).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    ema21Series.current?.setData(ema(data, 21).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    ema50Series.current?.setData(ema(data, 50).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    ema200Series.current?.setData(ema(data, 200).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    sma20Series.current?.setData(sma(data, 20).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    sma50Series.current?.setData(sma(data, 50).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    sma200Series.current?.setData(sma(data, 200).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    vwapSeries.current?.setData(vwap(data).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    supertrendSeries.current?.setData(supertrend(data).map((point) => ({ time: point.time as UTCTimestamp, value: point.value, color: point.direction === "up" ? "#00a67e" : "#f04458" })));
    const bands = bollingerBands(data);
    bollingerSeries.current[0]?.setData(bands.map((point) => ({ time: point.time as UTCTimestamp, value: point.upper })));
    bollingerSeries.current[1]?.setData(bands.map((point) => ({ time: point.time as UTCTimestamp, value: point.middle })));
    bollingerSeries.current[2]?.setData(bands.map((point) => ({ time: point.time as UTCTimestamp, value: point.lower })));
    const pivots = classicPivotPoints(data);
    for (const level of ["r3", "r2", "r1", "pivot", "s1", "s2", "s3"] as PivotLevel[]) {
      pivotSeries.current[level]?.setData(pivots.map((point) => ({ time: point.time as UTCTimestamp, value: point.levels![level] })));
    }
    rsiSeries.current?.setData(rsi(data, 14).map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    const macdValues = macd(data);
    macdSeries.current?.setData(macdValues.map((point) => ({ time: point.time as UTCTimestamp, value: point.macd })));
    macdSignalSeries.current?.setData(macdValues.map((point) => ({ time: point.time as UTCTimestamp, value: point.signal })));
    macdHistogramSeries.current?.setData(macdValues.map((point) => ({ time: point.time as UTCTimestamp, value: point.histogram, color: point.histogram >= 0 ? "#00a67e80" : "#f0445880" })));
    setIndicatorValues(latestIndicatorValues(data));
  }

  function syncIndicators(next: ChartIndicators) {
    const chart = chartApi.current;
    if (!chart) return;
    void import("lightweight-charts").then(({ HistogramSeries, LineSeries, LineStyle }) => {
      if (!chartApi.current || chartApi.current !== chart) return;
      if (next.ema5 && !ema5Series.current) {
        ema5Series.current = chart.addSeries(LineSeries, {
          color: "#0ea5e9",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          title: "EMA 5",
        });
      } else if (!next.ema5 && ema5Series.current) {
        chart.removeSeries(ema5Series.current);
        ema5Series.current = null;
      }
      if (next.ema21 && !ema21Series.current) {
        ema21Series.current = chart.addSeries(LineSeries, {
          color: "#ff8a00",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          title: "EMA 21",
        });
      } else if (!next.ema21 && ema21Series.current) {
        chart.removeSeries(ema21Series.current);
        ema21Series.current = null;
      }
      const overlayDefinitions = [
        ["ema50", ema50Series, ema(dataRef.current, 50), "#8b5cf6", "EMA 50"],
        ["ema200", ema200Series, ema(dataRef.current, 200), "#e11d48", "EMA 200"],
        ["sma20", sma20Series, sma(dataRef.current, 20), "#14b8a6", "SMA 20"],
        ["sma50", sma50Series, sma(dataRef.current, 50), "#64748b", "SMA 50"],
        ["sma200", sma200Series, sma(dataRef.current, 200), "#111827", "SMA 200"],
        ["vwap", vwapSeries, vwap(dataRef.current), "#d946ef", "VWAP"],
        ["supertrend", supertrendSeries, supertrend(dataRef.current), "#00a67e", "Supertrend 10 3"],
      ] as const;
      for (const [key, reference, points, color, title] of overlayDefinitions) {
        if (next[key] && !reference.current) {
          reference.current = chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title });
          reference.current.setData(points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
        } else if (!next[key] && reference.current) {
          chart.removeSeries(reference.current);
          reference.current = null;
        }
      }
      if (next.bollinger && !bollingerSeries.current.length) {
        bollingerSeries.current = [
          chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "BB Upper" }),
          chart.addSeries(LineSeries, { color: "#a5b4fc", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "BB 20" }),
          chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "BB Lower" }),
        ];
      } else if (!next.bollinger && bollingerSeries.current.length) {
        for (const series of bollingerSeries.current) chart.removeSeries(series);
        bollingerSeries.current = [];
      }
      if (next.pivots && !Object.keys(pivotSeries.current).length) {
        const colors: Record<PivotLevel, string> = { r3: "#dc2626", r2: "#ef4444", r1: "#fb7185", pivot: "#7c3aed", s1: "#34d399", s2: "#10b981", s3: "#047857" };
        for (const level of ["r3", "r2", "r1", "pivot", "s1", "s2", "s3"] as PivotLevel[]) {
          pivotSeries.current[level] = chart.addSeries(LineSeries, { color: colors[level], lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: level === "pivot" ? "P" : level.toUpperCase() });
        }
      } else if (!next.pivots && Object.keys(pivotSeries.current).length) {
        for (const series of Object.values(pivotSeries.current)) if (series) chart.removeSeries(series);
        pivotSeries.current = {};
      }
      if (next.rsi && !rsiSeries.current) {
        rsiSeries.current = chart.addSeries(LineSeries, {
          color: "#7c4dff",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          title: "RSI 14",
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        }, 1);
        rsiSeries.current.createPriceLine({ price: 70, color: "#f0445870", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        rsiSeries.current.createPriceLine({ price: 30, color: "#00a67e70", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        chart.panes()[1]?.setHeight(116);
      } else if (!next.rsi && rsiSeries.current) {
        chart.removeSeries(rsiSeries.current);
        rsiSeries.current = null;
      }
      const requestedMacdPane = next.rsi ? 2 : 1;
      if (next.macd && macdSeries.current && macdPaneIndexRef.current !== requestedMacdPane) {
        chart.removeSeries(macdSeries.current);
        if (macdSignalSeries.current) chart.removeSeries(macdSignalSeries.current);
        if (macdHistogramSeries.current) chart.removeSeries(macdHistogramSeries.current);
        macdSeries.current = null;
        macdSignalSeries.current = null;
        macdHistogramSeries.current = null;
      }
      if (next.macd && !macdSeries.current) {
        macdPaneIndexRef.current = requestedMacdPane;
        macdSeries.current = chart.addSeries(LineSeries, { color: "#2563eb", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "macd", title: "MACD" }, requestedMacdPane);
        macdSignalSeries.current = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceScaleId: "macd", title: "Signal" }, requestedMacdPane);
        macdHistogramSeries.current = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceScaleId: "macd", title: "Histogram" }, requestedMacdPane);
      } else if (!next.macd && macdSeries.current) {
        chart.removeSeries(macdSeries.current);
        if (macdSignalSeries.current) chart.removeSeries(macdSignalSeries.current);
        if (macdHistogramSeries.current) chart.removeSeries(macdHistogramSeries.current);
        macdSeries.current = null;
        macdSignalSeries.current = null;
        macdHistogramSeries.current = null;
      }
      syncIndicatorData();
      fitStudyPanes(next);
    });
  }

  function persistDrawings(pushHistory = false) {
    const manager = drawingManager.current;
    if (!manager || restoringRef.current) return;
    const snapshot = manager.exportDrawings();
    storedDrawingsRef.current = snapshot;
    window.localStorage.setItem(storageKeyRef.current, JSON.stringify(snapshot));
    if (pushHistory) {
      const previous = historyRef.current.at(-1);
      if (JSON.stringify(previous) !== JSON.stringify(snapshot)) {
        historyRef.current.push(snapshot);
        if (historyRef.current.length > 80) historyRef.current.shift();
        redoRef.current = [];
      }
    }
  }

  function restoreDrawings(snapshot: SerializedDrawing[], persist = true) {
    const manager = drawingManager.current;
    const registry = drawingRegistry.current;
    if (!manager || !registry) return;
    restoringRef.current = true;
    manager.clearAll();
    for (const item of snapshot) {
      const drawing = registry.createDrawing(item.type, item.id, item.anchors, item.style, item.options);
      if (drawing) {
        drawing.updateOptions({ ...item.options, visible: !hiddenRef.current, locked: lockedRef.current });
        manager.addDrawing(drawing);
      }
    }
    restoringRef.current = false;
    if (persist) {
      storedDrawingsRef.current = snapshot;
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(snapshot));
    }
  }

  function snapAnchor(rawTime: Time, rawPrice: number): Anchor {
    if (!magnetRef.current || !dataRef.current.length) return { time: rawTime, price: rawPrice };
    const numericTime = timeToTimestamp(rawTime);
    let nearest = dataRef.current[0];
    let distance = Math.abs(Number(nearest.time) - numericTime);
    for (const candle of dataRef.current) {
      const nextDistance = Math.abs(Number(candle.time) - numericTime);
      if (nextDistance < distance) {
        nearest = candle;
        distance = nextDistance;
      }
    }
    const prices = [nearest.open, nearest.high, nearest.low, nearest.close];
    const price = prices.reduce((best, value) => Math.abs(value - rawPrice) < Math.abs(best - rawPrice) ? value : best, prices[0]);
    return { time: Number(nearest.time) as UTCTimestamp, price };
  }

  function pointerAnchor(event: PointerEvent, useMagnet = true): Anchor | null {
    const host = chartHost.current;
    const chart = chartApi.current;
    const series = candleSeries.current;
    if (!host || !chart || !series) return null;
    const bounds = host.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const mainPaneHeight = chart.panes()[0]?.getHeight() ?? bounds.height;
    if (x < 0 || x > bounds.width || y < 0 || y > mainPaneHeight) return null;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return useMagnet ? snapAnchor(time, price) : { time, price };
  }

  function updateDraftPreview(anchor: Anchor) {
    const draft = draftRef.current;
    if (!draft) return;
    const next = [...draft.confirmed, anchor];
    while (next.length < draft.requiredAnchors) next.push(anchor);
    draft.drawing.setAnchors(next);
  }

  function finishDraft() {
    const draft = draftRef.current;
    if (!draft) return;
    draft.drawing.setAnchors([...draft.confirmed]);
    draft.drawing.setState("selected");
    drawingManager.current?.selectDrawing(draft.drawing.id);
    draftRef.current = null;
    setPlacementHint("");
    persistDrawings(true);
    activeToolRef.current = "cursor";
    drawingManager.current?.setActiveTool(null);
    chartApi.current?.applyOptions({ handleScroll: true, handleScale: true });
    chartHost.current?.classList.remove("is-drawing");
    onDrawingCompleteRef.current?.();
  }

  function cancelDraft() {
    const draft = draftRef.current;
    if (!draft) return;
    drawingManager.current?.removeDrawing(draft.drawing.id);
    draftRef.current = null;
    setPlacementHint("");
  }

  useEffect(() => {
    indicatorsRef.current = indicators;
    syncIndicators(indicators);
  }, [indicators]);

  useEffect(() => {
    visibleBarsRef.current = visibleBars;
    applyVisibleRange();
  }, [visibleBars]);

  useEffect(() => {
    orderToolRef.current = orderTool;
    candleSeries.current?.applyOptions({});
    applyVisibleRange();
    refreshRiskCoordinates();
    refreshTradeMarkerCoordinates();
    if (!orderTool?.enabled) return;
    const interval = window.setInterval(() => {
      refreshRiskCoordinates();
      refreshTradeMarkerCoordinates();
    }, 120);
    return () => window.clearInterval(interval);
  }, [orderTool?.enabled, orderTool?.entryPrice, orderTool?.quantity, orderTool?.side, orderTool?.stopLossPrice, orderTool?.targetPrice]);

  useEffect(() => {
    tradeMarkersRef.current = tradeMarkers;
    refreshTradeMarkerCoordinates();
  }, [tradeMarkers]);

  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    const neon = chartTheme === "neon";
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: neon ? "#061014" : "#ffffff" },
        textColor: neon ? "#8fb3bf" : "#65708a",
        attributionLogo: true,
        panes: { separatorColor: neon ? "#173541" : "#e3e6ee", separatorHoverColor: neon ? "#00f5b0" : "#d8d3ff", enableResize: true },
      },
      grid: {
        vertLines: { color: neon ? "#102a33" : "#edf0f6" },
        horzLines: { color: neon ? "#102a33" : "#edf0f6" },
      },
      rightPriceScale: { borderColor: neon ? "#1b3b48" : "#dfe3ec" },
      timeScale: { borderColor: neon ? "#1b3b48" : "#dfe3ec" },
      crosshair: {
        vertLine: { color: neon ? "#00f5b0" : "#8c96aa", labelBackgroundColor: neon ? "#083c38" : "#252b3d" },
        horzLine: { color: neon ? "#00f5b0" : "#8c96aa", labelBackgroundColor: neon ? "#083c38" : "#252b3d" },
      },
    });
  }, [chartTheme]);

  useEffect(() => {
    magnetRef.current = magnet;
    const chart = chartApi.current;
    if (!chart) return;
    void import("lightweight-charts").then(({ CrosshairMode }) => {
      chart.applyOptions({ crosshair: { mode: magnet ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal } });
    });
  }, [magnet]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    cancelDraft();
    const chart = chartApi.current;
    const manager = drawingManager.current;
    const drawingType = normalizeTool(activeTool);
    manager?.setActiveTool(drawingType);
    chart?.applyOptions({
      handleScroll: activeTool === "cursor",
      handleScale: activeTool === "cursor",
    });
    chartHost.current?.classList.toggle("is-drawing", activeTool !== "cursor");
    const definition = drawingType ? DRAWING_TOOL_CATALOG.find((tool) => tool.id === drawingType) : undefined;
    const hint = definition ? `Tap ${definition.anchors} ${definition.anchors === 1 ? "point" : "points"} · ${definition.label}` : drawingType ? "Tap on chart" : "";
    const hintTimer = window.setTimeout(() => setPlacementHint(hint), 0);
    return () => window.clearTimeout(hintTimer);
  }, [activeTool, toolSignal]);

  useEffect(() => {
    lockedRef.current = lockedDrawings;
    for (const drawing of drawingManager.current?.getAllDrawings() ?? []) drawing.updateOptions({ locked: lockedDrawings });
    persistDrawings();
  }, [lockedDrawings]);

  useEffect(() => {
    hiddenRef.current = hiddenDrawings;
    for (const drawing of drawingManager.current?.getAllDrawings() ?? []) drawing.updateOptions({ visible: !hiddenDrawings });
    persistDrawings();
  }, [hiddenDrawings]);

  useEffect(() => {
    const chart = chartApi.current;
    if (!chartAction || !chart) return;
    if (chartAction.type === "fit") chart.timeScale().fitContent();
    if (chartAction.type === "reset") {
      applyVisibleRange();
      chart.timeScale().scrollToRealTime();
    }
    if (chartAction.type === "live") chart.timeScale().scrollToRealTime();
    if (chartAction.type === "zoom-in" || chartAction.type === "zoom-out") {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (range) {
        const middle = (range.from + range.to) / 2;
        const half = ((range.to - range.from) / 2) * (chartAction.type === "zoom-in" ? 0.72 : 1.38);
        chart.timeScale().setVisibleLogicalRange({ from: middle - half, to: middle + half });
      }
    }
    if (chartAction.type === "screenshot") {
      const canvas = chart.takeScreenshot(true, true);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${instrument.symbol}-${timeframe}-chart.png`;
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    }
    if (chartAction.type === "toggle-grid") {
      gridVisibleRef.current = !gridVisibleRef.current;
      const color = gridVisibleRef.current ? "#edf0f6" : "rgba(0,0,0,0)";
      chart.applyOptions({ grid: { vertLines: { color }, horzLines: { color } } });
    }
    if (chartAction.type === "toggle-crosshair") {
      crosshairVisibleRef.current = !crosshairVisibleRef.current;
      chart.applyOptions({ crosshair: { vertLine: { visible: crosshairVisibleRef.current }, horzLine: { visible: crosshairVisibleRef.current } } });
    }
    if (chartAction.type.startsWith("scale-")) {
      void import("lightweight-charts").then(({ PriceScaleMode }) => {
        const modes = {
          "scale-normal": PriceScaleMode.Normal,
          "scale-log": PriceScaleMode.Logarithmic,
          "scale-percent": PriceScaleMode.Percentage,
          "scale-indexed": PriceScaleMode.IndexedTo100,
        } as const;
        const mode = modes[chartAction.type as keyof typeof modes];
        if (mode !== undefined) chart.priceScale("right").applyOptions({ mode });
      });
    }
  }, [chartAction, instrument.symbol, timeframe]);

  useEffect(() => {
    if (!chartHost.current) return;
    const host = chartHost.current;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let manager: DrawingManager | null = null;
    let resizeChart: (() => void) | null = null;
    let refreshOverlays: (() => void) | null = null;
    let resizeFrame = 0;

    void Promise.all([import("lightweight-charts"), import("lightweight-charts-drawing")]).then(([lwc, drawing]) => {
      if (cancelled) return;
      const neon = chartTheme === "neon";
      const chart = lwc.createChart(host, {
        autoSize: false,
        width: Math.max(1, Math.floor(host.clientWidth)),
        height: Math.max(1, Math.floor(host.clientHeight)),
        layout: {
          background: { type: lwc.ColorType.Solid, color: neon ? "#061014" : "#ffffff" },
          textColor: neon ? "#8fb3bf" : "#65708a",
          fontFamily: "Inter, system-ui, sans-serif",
          attributionLogo: true,
          panes: { separatorColor: neon ? "#173541" : "#e3e6ee", separatorHoverColor: neon ? "#00f5b0" : "#d8d3ff", enableResize: true },
        },
        grid: {
          vertLines: { color: neon ? "#102a33" : "#edf0f6", style: lwc.LineStyle.Dashed },
          horzLines: { color: neon ? "#102a33" : "#edf0f6", style: lwc.LineStyle.Dashed },
        },
        rightPriceScale: {
          visible: true,
          borderColor: neon ? "#1b3b48" : "#dfe3ec",
          scaleMargins: { top: 0.10, bottom: 0.10 },
          minimumWidth: 58,
          entireTextOnly: true,
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: neon ? "#1b3b48" : "#dfe3ec",
          timeVisible: true,
          secondsVisible: timeframe === "1m",
          rightOffset: 8,
          barSpacing: 7,
          minBarSpacing: 2,
          fixLeftEdge: false,
          lockVisibleTimeRangeOnResize: true,
        },
        crosshair: {
          mode: magnetRef.current ? lwc.CrosshairMode.MagnetOHLC : lwc.CrosshairMode.Normal,
          vertLine: { color: neon ? "#00f5b0" : "#8c96aa", width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: neon ? "#083c38" : "#252b3d" },
          horzLine: { color: neon ? "#00f5b0" : "#8c96aa", width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: neon ? "#083c38" : "#252b3d" },
        },
        handleScroll: true,
        handleScale: true,
        kineticScroll: { mouse: true, touch: true },
        localization: {
          locale: "en-IN",
          priceFormatter: (price: number) => price.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          timeFormatter: indiaTime,
        },
      });
      const series = chart.addSeries(lwc.CandlestickSeries, {
        upColor: "#00a67e",
        downColor: "#f04458",
        borderVisible: false,
        wickUpColor: "#00a67e",
        wickDownColor: "#f04458",
        priceLineVisible: true,
        priceLineColor: "#6657ee",
        priceLineWidth: 1,
        priceLineStyle: lwc.LineStyle.Dashed,
        lastValueVisible: true,
        // Keep the symbol in the OHLC legend; the right-axis marker should contain only the price.
        title: "",
        autoscaleInfoProvider: (baseImplementation: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const base = baseImplementation();
          const tool = orderToolRef.current;
          if (!base || !tool?.enabled) return base;
          const levels = [tool.entryPrice, tool.targetPrice, tool.stopLossPrice].filter((value) => Number.isFinite(value) && value > 0);
          if (!levels.length) return base;
          const minValue = Math.min(base.priceRange.minValue, ...levels);
          const maxValue = Math.max(base.priceRange.maxValue, ...levels);
          const padding = Math.max((maxValue - minValue) * 0.08, tool.entryPrice * 0.002, 0.05);
          return { ...base, priceRange: { minValue: Math.max(0, minValue - padding), maxValue: maxValue + padding } };
        },
      });
      chartApi.current = chart;
      candleSeries.current = series;
      series.setData(dataRef.current.map(toCandleData));

      manager = new drawing.DrawingManager();
      manager.attach(chart, series, host);
      drawingManager.current = manager;
      drawingRegistry.current = drawing.getToolRegistry();
      storageKeyRef.current = drawingStorageKey(instrument);
      const stored = readStoredDrawings(storageKeyRef.current, legacyDrawingStorageKey(instrument, timeframe));
      storedDrawingsRef.current = stored;
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(stored));
      restoreDrawings(projectDrawingsToCandles(stored, dataRef.current), false);
      historyRef.current = [stored];
      redoRef.current = [];

      manager.on("drawing:updated", () => persistDrawings(true));
      manager.on("drawing:removed", () => persistDrawings(true));
      manager.on("drawing:cleared", () => persistDrawings(true));

      const onPointerDown = (event: PointerEvent) => {
        const currentManager = drawingManager.current;
        const registry = drawingRegistry.current;
        const chartInstance = chartApi.current;
        if (!currentManager || !registry || !chartInstance) return;
        const selectedTool = normalizeTool(activeToolRef.current);
        const point = { x: event.clientX - host.getBoundingClientRect().left, y: event.clientY - host.getBoundingClientRect().top };

        if (!selectedTool) {
          tapGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          const drawings = [...currentManager.getAllDrawings()].reverse();
          const hit = drawings.find((drawingItem) => {
            if (!drawingItem.options.visible) return false;
            const viewport = drawingItem.getViewport();
            if (!viewport) return false;
            const controls = drawingItem.getControlPoints(viewport);
            if (controls.some((control) => pointDistance(point, control) <= 18)) return true;
            if (controls.some((control, index) => index > 0 && pointToSegmentDistance(point, controls[index - 1], control) <= 12)) return true;
            return drawingItem.testHit(point, viewport);
          }) ?? null;
          if (!hit) {
            currentManager.deselectAll();
            return;
          }
          tapGestureRef.current = null;
          currentManager.selectDrawing(hit.id);
          if (hit.options.locked) return;
          const start = pointerAnchor(event, false);
          if (!start) return;
          editRef.current = {
            drawing: hit,
            anchorIndex: (() => {
              const viewport = hit.getViewport();
              if (!viewport) return null;
              return hit.getControlPoints(viewport).find((control) => pointDistance(point, control) <= 18)?.index ?? null;
            })(),
            start,
            originalAnchors: hit.anchors.map((anchor) => ({ ...anchor })),
          };
          chartInstance.applyOptions({ handleScroll: false, handleScale: false });
          host.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        const anchor = pointerAnchor(event, true);
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        const continuous = CONTINUOUS_TOOLS.has(selectedTool);
        let draft = draftRef.current;
        if (!draft || draft.toolType !== selectedTool) {
          const definition = registry.get(selectedTool);
          const requiredAnchors = definition?.requiredAnchors ?? 2;
          const previewAnchors = Array.from({ length: Math.max(1, requiredAnchors) }, () => ({ ...anchor }));
          const created = registry.createDrawing(
            selectedTool,
            `${selectedTool}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            previewAnchors,
            toolStyle(selectedTool),
            { ...toolOptions(selectedTool), visible: !hiddenRef.current, locked: lockedRef.current },
          );
          if (!created) return;
          currentManager.addDrawing(created);
          created.setState("editing");
          draft = { toolType: selectedTool, requiredAnchors, confirmed: [anchor], drawing: created, continuous, pointerId: continuous ? event.pointerId : null };
          draftRef.current = draft;
          if (continuous) host.setPointerCapture?.(event.pointerId);
          if (requiredAnchors === 1) finishDraft();
        } else if (!continuous) {
          draft.confirmed.push(anchor);
          updateDraftPreview(anchor);
          if (draft.confirmed.length >= draft.requiredAnchors) finishDraft();
        }
        if (draftRef.current) {
          const placed = draftRef.current.confirmed.length;
          setPlacementHint(`${placed}/${draftRef.current.requiredAnchors} points · tap next anchor`);
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        const tap = tapGestureRef.current;
        if (tap?.pointerId === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap.moved = true;
        const edit = editRef.current;
        if (edit) {
          const current = pointerAnchor(event, false);
          if (!current) return;
          if (edit.anchorIndex !== null) {
            edit.drawing.updateAnchor(edit.anchorIndex, magnetRef.current ? snapAnchor(current.time, current.price) : current);
          } else {
            const startTime = typeof edit.start.time === "number" ? edit.start.time : 0;
            const currentTime = typeof current.time === "number" ? current.time : startTime;
            const timeDelta = currentTime - startTime;
            const priceDelta = current.price - edit.start.price;
            edit.drawing.setAnchors(edit.originalAnchors.map((anchor) => ({
              time: typeof anchor.time === "number" ? (anchor.time + timeDelta) as UTCTimestamp : anchor.time,
              price: anchor.price + priceDelta,
            })));
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const draft = draftRef.current;
        if (!draft) return;
        const anchor = pointerAnchor(event, true);
        if (!anchor) return;
        if (draft.continuous && draft.pointerId === event.pointerId) {
          const previous = draft.confirmed.at(-1);
          if (!previous || previous.time !== anchor.time || Math.abs(previous.price - anchor.price) > 0.0001) {
            draft.confirmed.push(anchor);
            draft.drawing.setAnchors([...draft.confirmed]);
          }
        } else {
          updateDraftPreview(anchor);
        }
        event.preventDefault();
        event.stopPropagation();
      };

      const onPointerUp = (event: PointerEvent) => {
        const tap = tapGestureRef.current;
        tapGestureRef.current = null;
        if (event.type === "pointerup" && tap?.pointerId === event.pointerId && !tap.moved && !editRef.current && !draftRef.current) onChartTapRef.current?.();
        if (editRef.current) {
          editRef.current.drawing.setState("selected");
          editRef.current = null;
          chart.applyOptions({ handleScroll: true, handleScale: true });
          persistDrawings(true);
          host.releasePointerCapture?.(event.pointerId);
          event.preventDefault();
          return;
        }
        const draft = draftRef.current;
        if (draft?.continuous && draft.pointerId === event.pointerId) {
          if (draft.confirmed.length < 2) draft.confirmed.push({ ...draft.confirmed[0] });
          finishDraft();
          host.releasePointerCapture?.(event.pointerId);
          event.preventDefault();
        }
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          if (draftRef.current) cancelDraft();
          else drawingManager.current?.deselectAll();
        }
        if ((event.key === "Delete" || event.key === "Backspace") && !draftRef.current) {
          const selected = drawingManager.current?.getSelectedDrawing();
          if (selected && !selected.options.locked) {
            drawingManager.current?.removeDrawing(selected.id);
            persistDrawings(true);
            event.preventDefault();
          }
        }
      };

      host.addEventListener("pointerdown", onPointerDown, true);
      host.addEventListener("pointermove", onPointerMove, true);
      host.addEventListener("pointerup", onPointerUp, true);
      host.addEventListener("pointercancel", onPointerUp, true);
      window.addEventListener("keydown", onKeyDown);
      Object.assign(host.dataset, {
        pointerListeners: "active",
      });
      (host as HTMLDivElement & { __papertradeCleanup?: () => void }).__papertradeCleanup = () => {
        host.removeEventListener("pointerdown", onPointerDown, true);
        host.removeEventListener("pointermove", onPointerMove, true);
        host.removeEventListener("pointerup", onPointerUp, true);
        host.removeEventListener("pointercancel", onPointerUp, true);
        window.removeEventListener("keydown", onKeyDown);
      };

      syncIndicators(indicatorsRef.current);
      applyVisibleRange();
      refreshOverlays = () => {
        refreshRiskCoordinates();
        refreshTradeMarkerCoordinates();
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlays);
      resizeChart = () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          if (!chartApi.current || chartApi.current !== chart) return;
          const width = Math.max(1, Math.floor(host.clientWidth));
          const height = Math.max(1, Math.floor(host.clientHeight));
          chart.resize(width, height, true);
          fitStudyPanes(indicatorsRef.current);
          applyVisibleRange();
          refreshOverlays?.();
        });
      };
      observer = new ResizeObserver(resizeChart);
      observer.observe(host);
      window.addEventListener("resize", resizeChart);
      window.visualViewport?.addEventListener("resize", resizeChart);
      resizeChart();
      window.setTimeout(resizeChart, 180);
      window.setTimeout(refreshOverlays, 190);
      activeToolRef.current = activeTool;
      manager.setActiveTool(normalizeTool(activeTool));
      chart.applyOptions({ handleScroll: activeTool === "cursor", handleScale: activeTool === "cursor" });
      host.classList.toggle("is-drawing", activeTool !== "cursor");
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      if (resizeChart) {
        window.removeEventListener("resize", resizeChart);
        window.visualViewport?.removeEventListener("resize", resizeChart);
      }
      if (refreshOverlays) chartApi.current?.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlays);
      (host as HTMLDivElement & { __papertradeCleanup?: () => void }).__papertradeCleanup?.();
      cancelDraft();
      editRef.current = null;
      manager?.detach();
      chartApi.current?.remove();
      chartApi.current = null;
      candleSeries.current = null;
      ema5Series.current = null;
      ema21Series.current = null;
      rsiSeries.current = null;
      drawingManager.current = null;
      drawingRegistry.current = null;
    };
  }, [chartTheme, instrument.instrumentKey, instrument.symbol, timeframe]);

  useEffect(() => {
    if (clearSignal === previousClear.current) return;
    previousClear.current = clearSignal;
    cancelDraft();
    drawingManager.current?.clearAll();
    persistDrawings(true);
  }, [clearSignal]);

  useEffect(() => {
    if (undoSignal === previousUndo.current) return;
    previousUndo.current = undoSignal;
    if (historyRef.current.length <= 1) return;
    const current = historyRef.current.pop();
    if (current) redoRef.current.push(current);
    restoreDrawings(historyRef.current.at(-1) ?? []);
  }, [undoSignal]);

  useEffect(() => {
    if (redoSignal === previousRedo.current) return;
    previousRedo.current = redoSignal;
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    historyRef.current.push(snapshot);
    restoreDrawings(snapshot);
  }, [redoSignal]);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer = 0;
    onFeedStatus({ mode: "loading", message: "Connecting to Upstox…" });

    async function loadUpstoxCandles() {
      try {
        const params = new URLSearchParams({ instrumentKey: instrument.instrumentKey, timeframe });
        const response = await fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as {
          ok?: boolean;
          candles?: Candle[];
          segments?: string[];
          fetchedAt?: string;
          error?: { code?: string; message?: string; retryAfterSeconds?: number };
        };
        if (!response.ok || !payload.ok || !payload.candles?.length) {
          const failure = new Error(payload.error?.message ?? "Upstox candles are unavailable.") as Error & { retryAfterSeconds?: number };
          failure.retryAfterSeconds = payload.error?.retryAfterSeconds ?? (payload.error?.code === "RATE_LIMITED" ? 30 : 15);
          throw failure;
        }
        dataRef.current = payload.candles;
        const latest = payload.candles.at(-1);
        setLatestCandle(latest);
        if (latest) onPrice?.(latest.close);
        candleSeries.current?.setData(payload.candles.map(toCandleData));
        restoreDrawings(projectDrawingsToCandles(storedDrawingsRef.current, payload.candles), false);
        syncIndicatorData(payload.candles);
        applyVisibleRange(payload.candles);
        const historicalOnlyTimeframe = timeframe === "1W" || timeframe === "1M" || timeframe === "1Y";
        const hasCurrentMarketData = historicalOnlyTimeframe || payload.segments?.includes("intraday");
        setFeedMode(hasCurrentMarketData ? "live" : "stale");
        onFeedStatus({
          mode: hasCurrentMarketData ? "live" : "stale",
          message: hasCurrentMarketData ? (payload.segments?.includes("intraday") ? "Upstox historical + intraday candles" : "Upstox historical candles") : "Upstox historical candles · live update paused",
          updatedAt: payload.fetchedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const retryAfterSeconds = Math.max(15, Math.min(120, Number((error as Error & { retryAfterSeconds?: number })?.retryAfterSeconds) || 30));
        const hasVerifiedCandles = dataRef.current.length > 0;
        setFeedMode(hasVerifiedCandles ? "stale" : "error");
        onFeedStatus({
          mode: hasVerifiedCandles ? "stale" : "error",
          message: `${error instanceof Error ? error.message : "Upstox candles are unavailable."} No simulation · retrying in ${retryAfterSeconds}s`,
        });
        retryTimer = window.setTimeout(() => void loadUpstoxCandles(), retryAfterSeconds * 1_000);
      }
    }

    void loadUpstoxCandles();
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [instrument.instrumentKey, onFeedStatus, onPrice, timeframe]);

  useEffect(() => {
    if ((feedMode !== "live" && feedMode !== "stale") || timeframe === "1W" || timeframe === "1M" || timeframe === "1Y") return;
    let controller: AbortController | null = null;
    async function refreshIntradayCandles() {
      controller?.abort();
      controller = new AbortController();
      try {
        const params = new URLSearchParams({ instrumentKey: instrument.instrumentKey, timeframe, scope: "intraday" });
        const response = await fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { ok?: boolean; candles?: Candle[]; fetchedAt?: string; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.candles?.length) throw new Error(payload.error?.message ?? "Upstox intraday candles are unavailable.");
        dataRef.current = mergeSeries(dataRef.current, payload.candles);
        candleSeries.current?.setData(dataRef.current.map(toCandleData));
        syncIndicatorData();
        const latest = dataRef.current.at(-1);
        if (latest) {
          setLatestCandle(latest);
          onPrice?.(latest.close);
        }
        setFeedMode("live");
        onFeedStatus({ mode: "live", message: "Upstox historical + intraday candles", updatedAt: payload.fetchedAt });
      } catch (error) {
        if (controller?.signal.aborted) return;
        setFeedMode(dataRef.current.length ? "stale" : "error");
        onFeedStatus({ mode: dataRef.current.length ? "stale" : "error", message: `${error instanceof Error ? error.message : "Upstox candle refresh failed."} Chart paused · no simulation` });
      }
    }
    const interval = window.setInterval(() => void refreshIntradayCandles(), 20_000);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [feedMode, instrument.instrumentKey, onFeedStatus, onPrice, timeframe]);

  return (
    <div className="chart-stack lightweight-stack">
      <div className="price-chart-wrap lightweight-chart-wrap">
        <div ref={chartHost} className="price-chart lightweight-chart" aria-label="Interactive TradingView Lightweight Charts candlestick chart" />
        <div className="chart-symbol-legend lightweight-symbol-legend">
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
        {Object.values(indicators).some(Boolean) && (
          <div className="indicator-legend lightweight-indicator-legend">
            {indicators.ema5 && <span><i className="ema-five" />EMA 5 <b>{indicatorValues.ema5.toFixed(2)}</b></span>}
            {indicators.ema21 && <span><i className="ema-twenty-one" />EMA 21 <b>{indicatorValues.ema21.toFixed(2)}</b></span>}
            {indicators.ema50 && <span><i style={{ background: "#8b5cf6" }} />EMA 50 <b>{indicatorValues.ema50.toFixed(2)}</b></span>}
            {indicators.ema200 && <span><i style={{ background: "#e11d48" }} />EMA 200 <b>{indicatorValues.ema200.toFixed(2)}</b></span>}
            {indicators.sma20 && <span><i style={{ background: "#14b8a6" }} />SMA 20 <b>{indicatorValues.sma20.toFixed(2)}</b></span>}
            {indicators.sma50 && <span><i style={{ background: "#64748b" }} />SMA 50 <b>{indicatorValues.sma50.toFixed(2)}</b></span>}
            {indicators.sma200 && <span><i style={{ background: "#111827" }} />SMA 200 <b>{indicatorValues.sma200.toFixed(2)}</b></span>}
            {indicators.vwap && <span><i style={{ background: "#d946ef" }} />VWAP <b>{indicatorValues.vwap.toFixed(2)}</b></span>}
            {indicators.supertrend && <span><i style={{ background: "#00a67e" }} />Supertrend</span>}
            {indicators.bollinger && <span><i style={{ background: "#6366f1" }} />Bollinger 20</span>}
            {indicators.pivots && <span><i style={{ background: "#7c3aed" }} />Classic Pivots</span>}
            {indicators.rsi && <span><i className="rsi-color" />RSI 14 <b>{indicatorValues.rsi.toFixed(2)}</b></span>}
            {indicators.macd && <span><i style={{ background: "#2563eb" }} />MACD 12 26 9</span>}
          </div>
        )}
        {placementHint && <div className="chart-placement-hint">{placementHint}</div>}
        {onOrderSide && (
          <div className="chart-quick-order-buttons" aria-label="Paper trade controls">
            <button className={`chart-sell-button ${orderTool?.enabled && orderTool.side === "SELL" ? "active" : ""}`} onClick={() => onOrderSide("SELL")}><span>Sell</span><b>{latestCandle?.close.toFixed(2) ?? "—"}</b></button>
            <button className={`chart-buy-button ${orderTool?.enabled && orderTool.side === "BUY" ? "active" : ""}`} onClick={() => onOrderSide("BUY")}><span>Buy</span><b>{latestCandle?.close.toFixed(2) ?? "—"}</b></button>
          </div>
        )}
        {tradeMarkerCoordinates.map((marker) => (
          <div
            key={marker.id}
            className={`chart-trade-marker ${marker.side.toLowerCase()} ${marker.role.toLowerCase()}`}
            style={{ left: marker.x, top: marker.y }}
            aria-label={`${marker.role === "ENTRY" ? "Entry" : "Exit"} ${marker.side}`}
          >
            <span>{marker.direction === "up" ? "↑" : "↓"}</span>
            <em>{marker.role === "ENTRY" ? "Entry" : "Exit"}</em>
          </div>
        ))}
        {orderTool?.enabled && riskCoordinates && (
          <div className={`chart-risk-tool ${orderTool.side.toLowerCase()}`} aria-label={`${orderTool.side === "BUY" ? "Long" : "Short"} target and stop-loss tool`}>
            {onOrderToolClose && <button className="risk-tool-close" onClick={onOrderToolClose} aria-label="Hide order tool">×</button>}
            {riskCoordinates.entry !== null && <div className="risk-line risk-entry-line" style={{ top: riskCoordinates.entry }}>
              <span title={`Quantity ${orderTool.quantity}`}>{orderTool.quantity}</span><b>₹{orderTool.entryPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</b>
            </div>}
            {riskCoordinates.target !== null && <div
              className="risk-line risk-target-line"
              style={{ top: riskCoordinates.target }}
              onPointerDown={(event) => beginRiskDrag("target", event)}
              onPointerMove={(event) => moveRiskDrag("target", event)}
              onPointerUp={(event) => endRiskDrag("target", event)}
              onPointerCancel={(event) => endRiskDrag("target", event)}
            >
              <span title={`Quantity ${orderTool.quantity}`}>{orderTool.quantity}</span><b>{formatRiskPnl(orderToolPnl(orderTool, orderTool.targetPrice))}</b>
            </div>}
            {riskCoordinates.stopLoss !== null && <div
              className="risk-line risk-stop-line"
              style={{ top: riskCoordinates.stopLoss }}
              onPointerDown={(event) => beginRiskDrag("stopLoss", event)}
              onPointerMove={(event) => moveRiskDrag("stopLoss", event)}
              onPointerUp={(event) => endRiskDrag("stopLoss", event)}
              onPointerCancel={(event) => endRiskDrag("stopLoss", event)}
            >
              <span title={`Quantity ${orderTool.quantity}`}>{orderTool.quantity}</span><b>{formatRiskPnl(orderToolPnl(orderTool, orderTool.stopLossPrice))}</b>
            </div>}
            <div className={`risk-reward-summary ${onOrderToolExit ? "has-exit" : ""}`}>
              <span>{orderTool.side === "BUY" ? "LONG" : "SHORT"} · Qty {orderTool.quantity}</span>
              <b>Risk {formatRiskPnl(orderToolPnl(orderTool, orderTool.stopLossPrice))}</b>
              <b>Reward {formatRiskPnl(orderToolPnl(orderTool, orderTool.targetPrice))}</b>
              {onOrderToolExit && <button type="button" className="risk-tool-exit" onClick={onOrderToolExit}>Close trade</button>}
            </div>
          </div>
        )}
        {typeof orderTool?.livePnl === "number" && Number.isFinite(orderTool.livePnl) && <div className={`chart-live-pnl ${orderTool.livePnl >= 0 ? "positive" : "negative"}`}>
          <span>Live P&amp;L</span><b>{formatRiskPnl(orderTool.livePnl)}</b>
        </div>}
      </div>
    </div>
  );
}
