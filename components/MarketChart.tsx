"use client";
import { CandleLoader } from "./CandleLoader";
import { Check, Trash2, Settings2, EyeOff, X } from "lucide-react";
import { SmcLearner } from "./SmcLearner";
import { stampChartOverlay } from "@/lib/chart-overlay-export";
import { useTransientBack } from "./useTransientBack";
import { stackTradeMarkers, positionPnl, compactPnl } from "@/lib/trade-marker-layout";
import { createChartDrawingRegistry } from "@/lib/chart-drawing-tools";
import { createProfileDataClient } from "@/lib/profile-data-client";
import { profilePeriod } from "@/lib/profile-range";
import { drawingLogicalAtTime, drawingTimeAtLogical } from "@/lib/drawing-coordinates";
import { EXTRA_DRAWING_TOOLS } from "@/lib/drawing-extras";
import { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { STUDIES, studyDefaults, studyTitle } from "@/lib/indicator-catalog";
import { useIndicatorSettings, restoreHiddenStudies } from "@/lib/indicator-settings";
import { IndicatorSettings } from "./IndicatorSettings";
import { ChartLineColorSettings } from "./ChartLineColorSettings";
import { useComparisonCandles } from "@/lib/indicator-comparison-feed";
import { useChartPreference } from "@/lib/chart-view-preferences";
import { isProfileStyle, prepareStyleCandles, styleBaselinePrice, styleSeriesKind, toStyleSeriesPoint, type ChartStyleId } from "@/lib/chart-style";
import { compareColor, compareQuote, formatCompareDelta, formatComparePrice } from "@/lib/chart-compare";
import { ChartProfileOverlay } from "@/lib/chart-profile-overlay";
import { candleBucket, candlesEqual, nearestCandleIndex, trailingCandleUpdate, type ChartHistoryRequest } from "@/lib/chart-history";
import { comparisonRequest } from "@/lib/chart-compare";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Logical,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { ColorType, MismatchDirection } from "lightweight-charts";
import type {
  Anchor,
  DrawingManager,
  DrawingStyle,
  IDrawing,
  SerializedDrawing,
} from "lightweight-charts-drawing";
import type { Candle, Instrument } from "@/lib/market";
import { openUpstoxLiveFeed } from "@/lib/upstox-live-feed";
import { ChartAlertLevels } from "@/components/ChartAlertLevels";
import type { PriceTask } from "@/lib/price-actions";
import { formatCandleChange, selectCandleLegend } from "@/lib/candle-legend";
import { applyCandleTick, reconcileLiveCandles, validCandleTick, liveCandleBucket, LIVE_INTERVALS as LIVE_TIMEFRAME_SECONDS, type CandleTick } from "@/lib/live-candles";

export const DRAWING_TOOL_CATALOG = [
  ...EXTRA_DRAWING_TOOLS,
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
  { id: "volume-profile", label: "Fixed-range Volume Profile", category: "Measurement", anchors: 2 },
  { id: "anchored-volume-profile", label: "Anchored Volume Profile", category: "Measurement", anchors: 1 },
  { id: "session-volume-profile", label: "Session Volume Profile", category: "Measurement", anchors: 1 },
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
  [key: string]: boolean;
  smc: boolean;
  ema5: boolean;
  ema21: boolean;
  ema30: boolean;
  ema50: boolean;
  ema100: boolean;
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
  smc: false,
  ema5: false,
  ema21: false,
  ema30: false,
  ema50: false,
  ema100: false,
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
  currency?: "INR" | "USD";
  tickSize?: number;
  referencePrice?: number;
  positionKey?: string;
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
  startX: number;
  pointerId: number;
  originalPixels: (number | null)[];
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
  labelFont: "13px Inter, sans-serif",
};

function toolStyle(tool: DrawingToolId): Partial<DrawingStyle> {
  if (tool === "volume-profile") return { ...DEFAULT_DRAWING_STYLE, fillColor: "rgba(102,87,238,.28)" };
  if (tool === "long-position") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#00a67e", fillColor: "rgba(0, 166, 126, .12)" };
  if (tool === "short-position") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#f04458", fillColor: "rgba(240, 68, 88, .12)" };
  if (tool === "highlighter") return { ...DEFAULT_DRAWING_STYLE, lineColor: "#f5b800", fillColor: "rgba(245, 184, 0, .22)" };
  return DEFAULT_DRAWING_STYLE;
}

function toolOptions(tool: DrawingToolId) {
  if (tool === "trend-line") return { visible: true, locked: false, extendRight: true };
  if (tool === "rectangle") return { visible: true, locked: false, filled: true };
  if (tool === "parallel-channel") return { visible: true, locked: false, filled: true, showMiddleLine: true, extendLines: true };
  if (tool === "fib-retracement") return { visible: true, locked: false, levels: [0, .5, .618, .705, .786, 1, 1.618, 2.618], showPrices: false, showPercentages: false, extendLines: false, reverseDirection: true };
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

const IST_OFFSET_SECONDS = 19_800;
const CALENDAR_TIMEFRAMES = new Set(["1D", "1W", "1M", "1Y"]);
function usesIntradayAxisShift(timeframe: string) {
  return !CALENDAR_TIMEFRAMES.has(timeframe);
}

function chartTimeFromEpoch(epochSeconds: number, timeframe: string): UTCTimestamp {
  return Math.floor(epochSeconds + (usesIntradayAxisShift(timeframe) ? IST_OFFSET_SECONDS : 0)) as UTCTimestamp;
}

function chartTimeZone(timeframe: string) {
  return usesIntradayAxisShift(timeframe) ? "UTC" : "Asia/Kolkata";
}

function toCandleData(candle: Candle, timeframe: string): CandlestickData<Time> {
  return {
    time: chartTimeFromEpoch(Number(candle.time), timeframe),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function styleSeriesData(candles: Candle[], style: ChartStyleId, timeframe: string) {
  const source = prepareStyleCandles(candles, style);
  return source.map((candle, index) => toStyleSeriesPoint(candle, source, index, style, chartTimeFromEpoch(Number(candle.time), timeframe)));
}

function styleLineData(candles: Candle[], timeframe: string) {
  return candles.filter((candle) => Number.isFinite(candle.close)).map((candle) => ({
    time: chartTimeFromEpoch(Number(candle.time), timeframe),
    value: candle.close,
  }));
}

function timeToTimestamp(time: Time) {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Math.floor(new Date(time).getTime() / 1_000);
  return Date.UTC(time.year, time.month - 1, time.day) / 1_000;
}

function projectDrawingsToCandles(snapshot: SerializedDrawing[], candles: Candle[], timeframe: string) {
  if (!candles.length) return snapshot;
  const candleTimes = candles.map((candle) => chartTimeFromEpoch(Number(candle.time), timeframe));
  return snapshot.map((item) => ({
    ...item,
    anchors: item.anchors.map((anchor) => {
      const timestamp = timeToTimestamp(anchor.time);
      if(timestamp<Number(candleTimes[0])||timestamp>Number(candleTimes.at(-1)))return anchor;
      let nearest = candleTimes[0];
      let distance = Math.abs(nearest - timestamp);
      for (let index = 1; index < candleTimes.length; index += 1) {
        const nextDistance = Math.abs(candleTimes[index] - timestamp);
        if (nextDistance >= distance) continue;
        nearest = candleTimes[index];
        distance = nextDistance;
      }
      return { ...anchor, time: nearest };
    }),
  }));
}

function chartDisplayTime(time: Time, timeframe: string) {
  const timestamp = timeToTimestamp(time);
  return new Date(timestamp * 1_000).toLocaleString("en-IN", {
    timeZone: chartTimeZone(timeframe),
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function chartTickTime(time: Time, timeframe: string) {
  const timestamp = timeToTimestamp(time);
  const date = new Date(timestamp * 1_000);
  if (usesIntradayAxisShift(timeframe)) {
    return date.toLocaleTimeString("en-IN", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
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

function chartInteractionOptions(enabled: boolean, preservePageScroll: boolean) {
  return {
    handleScroll: enabled
      ? preservePageScroll
        ? {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          }
        : true
      : false,
    handleScale: enabled
      ? {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: true,
          axisDoubleClickReset: true,
        }
      : { mouseWheel: false, pinch: true, axisPressedMouseMove: false, axisDoubleClickReset: false },
  };
}

export function MarketChart({
  instrument,
  timeframe,
  activeTool,
  toolSignal = 0,
  magnet,
  hiddenDrawings,
  candlesOnly = false,
  lockedDrawings = false,
  clearSignal = 0,
  undoSignal = 0,
  redoSignal = 0,
  visibleBars = 22,
  indicators: suppliedIndicators,
  indicatorHost,
  chartAction,
  chartTheme = "light",
  orderTool: suppliedOrderTool,
  tradeMarkers = [],
  focusTradeMarkers = false,
  preservePageScroll = false,
  replayCandles,
  externalCandles,
  historyRequest,
  priceIncrement,
  exchangeLabel = 'NSE',
  replaySelecting = false,
  replayStartTime = null,
  onReplaySelect,
  onReplayPreview,
  onReplayPlay,
  replayPrompt = false,
  onOrderSide,
  onPriceAction,
  priceTasks = [],
  onOrderToolChange,
  onOrderToolClose,
  onOrderToolExit,
  onDrawingComplete,
  onRemoveIndicator,
  onChartTap,
  onPrice,
  liveTick,
  onFeedStatus,
}: {
  instrument: Instrument;
  timeframe: string;
  activeTool: DrawingTool;
  toolSignal?: number;
  magnet: boolean;
  hiddenDrawings: boolean;
  candlesOnly?: boolean;
  lockedDrawings?: boolean;
  clearSignal?: number;
  undoSignal?: number;
  redoSignal?: number;
  visibleBars?: number;
  indicators: ChartIndicators;
  indicatorHost?: HTMLElement | null;
  chartAction?: ChartActionRequest;
  chartTheme?: "light" | "neon";
  orderTool?: ChartOrderTool;
  tradeMarkers?: ChartTradeMarker[];
  focusTradeMarkers?: boolean;
  preservePageScroll?: boolean;
  replayCandles?: Candle[];
  externalCandles?: Candle[];
  historyRequest?: ChartHistoryRequest;
  priceIncrement?: number;
  exchangeLabel?: string;
  replaySelecting?: boolean;
  replayStartTime?: number | null;
  onReplaySelect?: (time: number) => void;
  onReplayPreview?: (time: number) => void;
  onReplayPlay?: () => void;
  replayPrompt?: boolean;
  onOrderSide?: (side: "BUY" | "SELL") => void;
  onPriceAction?: (price: number, mode: "alert" | "order") => void;
  priceTasks?: PriceTask[];
  onOrderToolChange?: (level: "target" | "stopLoss", value: number, committed: boolean) => void;
  onOrderToolClose?: () => void;
  onOrderToolExit?: () => void;
  onDrawingComplete?: () => void;
  onRemoveIndicator?: (id: string) => void;
  onChartTap?: () => void;
  onPrice?: (value: number, timestampMs: number) => void;
  liveTick?: CandleTick;
  onFeedStatus: (status: FeedStatus) => void;
}) {
  // Hiding studies never changes which studies the user has selected.
  const indicators = useMemo(() => candlesOnly
    ? Object.fromEntries(Object.keys(suppliedIndicators).map(key => [key, false])) as ChartIndicators
    : suppliedIndicators, [candlesOnly, suppliedIndicators]);
  const { settings: studySettings, setStudy } = useIndicatorSettings();
  const [chartStyle] = useChartPreference("chartStyle");
  const [primaryLineColor, setPrimaryLineColor] = useChartPreference("primaryLineColor");
  const [comparedSymbols, setComparedSymbols] = useChartPreference("comparedSymbols");
  const [compareMode] = useChartPreference("compareMode");
  const chartStyleRef = useRef(chartStyle);
  chartStyleRef.current = chartStyle;
  const studySettingsRef = useRef(studySettings); studySettingsRef.current = studySettings;
  const [editingStudy, setEditingStudy] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [selectedStudy, setSelectedStudy] = useState<string | null>(null);
  const lastStudyTap = useRef<{time:number;x:number;y:number}|null>(null);
  const activateStudyRef = useRef((id:string,x:number,y:number) => {});
  activateStudyRef.current = (id,x,y) => {
    setSelectedStudy(id);
  };
  useTransientBack(selectedStudy !== null, () => {setSelectedStudy(null);lastStudyTap.current=null;});
  useEffect(() => {setSelectedStudy(null);lastStudyTap.current=null;}, [instrument.instrumentKey,timeframe,candlesOnly]);
  useEffect(() => { setEditingLine(null); }, [instrument.instrumentKey]);
  useEffect(() => {if(selectedStudy&&!indicators[selectedStudy])setSelectedStudy(null);}, [indicators,selectedStudy]);
  const [studySummaries, setStudySummaries] = useState<Array<{id:string;pane:number;top:number;message?:string;value?:number}>>([]);
  const isReplay = replayCandles !== undefined;
  const externalFeed = externalCandles !== undefined || instrument.instrumentKey.startsWith("DELTA|");
  const historyRequestRef = useRef(historyRequest); historyRequestRef.current = historyRequest;
  const [historyMessage, setHistoryMessage] = useState("");
  const dateArrowRef = useRef<Candle | null>(null);
  const [dateArrow, setDateArrow] = useState<{ x: number; y: number; size: number } | null>(null);
  const [markerSize, setMarkerSize] = useState(14);
  const [compareLabels, setCompareLabels] = useState<Array<{ key: string; y: number; text: string; color: string; side: "left" | "right" }>>([]);
  const [comparePaneTops, setComparePaneTops] = useState<Record<string,number>>({});
  const [volumeOverlay, setVolumeOverlay] = useState<{ y: number; headingTop: number; value: number; color: string } | null>(null);
  const overlayFrameRef = useRef(0);
  const historyWasActiveRef = useRef(false);
  const overlayCompared = useMemo(
    () => (isReplay ? [] : comparedSymbols.filter((item) => item.instrumentKey !== instrument.instrumentKey)),
    [comparedSymbols, instrument.instrumentKey, isReplay],
  );
  const overlayComparedRef = useRef(overlayCompared); overlayComparedRef.current = overlayCompared;
  const compareModeRef = useRef(compareMode); compareModeRef.current = compareMode;
  const compareForcedPercentRef = useRef(false);
  const comparisonData=useComparisonCandles(isReplay?[]:[
    ...STUDIES.filter(s=>s.comparison&&indicators[s.id]&&!studySettings[s.id]?.hidden).map(s=>studySettings[s.id]?.comparisonKey).filter((key):key is string=>!!key),
    ...overlayCompared.map((item) => item.instrumentKey),
  ],timeframe, historyRequest);
  const comparisonRef=useRef(comparisonData);comparisonRef.current=comparisonData;
  const [priceCursor, setPriceCursor] = useState<{ price: number; y: number } | null>(null);
  const [priceMenu, setPriceMenu] = useState<number | null>(null);
  useTransientBack(priceMenu !== null, () => setPriceMenu(null));
  const replayRef = useRef({ selecting: replaySelecting, start: replayStartTime, onSelect: onReplaySelect, onPreview: onReplayPreview });
  const replayDrag = useRef<{ id: number; x: number; moved: boolean; original: number | null } | null>(null);
  const [replayMarkerX, setReplayMarkerX] = useState<number | null>(null);
  const chartHost = useRef<HTMLDivElement>(null);
  const drawingCrosshairRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<SeriesType> | null>(null);
  const hlcSeries = useRef<{ high: ISeriesApi<"Line">; low: ISeriesApi<"Line"> } | null>(null);
  const compareSeries = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const profileOverlay = useRef<ChartProfileOverlay | null>(null);
  const [chartGeneration, setChartGeneration] = useState(0);
  const studyRenderer = useRef<ChartStudyRenderer | null>(null);
  const drawingManager = useRef<DrawingManager | null>(null);
  const drawingRegistry = useRef<ReturnType<typeof createChartDrawingRegistry> | null>(null);
  const draftRef = useRef<DraftDrawing | null>(null);
  const editRef = useRef<DrawingEdit | null>(null);
  const activeToolRef = useRef(activeTool);
  const magnetRef = useRef(magnet);
  const lockedRef = useRef(lockedDrawings);
  const hiddenRef = useRef(hiddenDrawings);
  const candlesOnlyRef = useRef(candlesOnly);
  candlesOnlyRef.current = candlesOnly;
  const [initialData] = useState<Candle[]>(() => replayCandles ?? []);
  const dataRef = useRef<Candle[]>(initialData);
  const storedDrawingsRef = useRef<SerializedDrawing[]>([]);
  const replayDrawingsRef = useRef<{ scope: string; snapshot: SerializedDrawing[] } | null>(null);
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
  const [expandedEntry, setExpandedEntry] = useState("");
  const [draftRisk, setDraftRisk] = useState<{ key: string; level: "target" | "stopLoss"; price: number } | null>(null);
  const entryKey = `${instrument.instrumentKey}:${suppliedOrderTool?.enabled}:${suppliedOrderTool?.side}:${suppliedOrderTool?.entryPrice}:${suppliedOrderTool?.positionKey ?? ""}`;
  const orderTool = suppliedOrderTool && draftRisk?.key === entryKey
    ? { ...suppliedOrderTool, [draftRisk.level === "target" ? "targetPrice" : "stopLossPrice"]: draftRisk.price }
    : suppliedOrderTool;
  const branchesOpen = expandedEntry === entryKey;
  const orderToolRef = useRef(orderTool);
  const globalPriceFormatRef = useRef({ type: "price" as const, precision: 2, minMove: .01 });
  const externalTick = priceIncrement && priceIncrement > 0 ? priceIncrement : .01;
  globalPriceFormatRef.current = { type: "price", precision: Math.max(2, externalTick.toFixed(10).replace(/0+$/, "").split(".")[1]?.length ?? 0), minMove: externalTick };
  const riskPointerStartRef = useRef(0);
  const riskGestureKeyRef = useRef("");
  const tradeMarkersRef = useRef(tradeMarkers);
  const focusTradeMarkersRef = useRef(focusTradeMarkers);
  const tradeMarkerKeyRef = useRef("");
  const viewportInteractedRef = useRef(false);
  const onChartTapRef = useRef(onChartTap);
  const onDrawingCompleteRef = useRef(onDrawingComplete);
  const onPriceRef = useRef(onPrice);
  const onFeedStatusRef = useRef(onFeedStatus);
  const liveStreamConnectedRef = useRef(false);
  const liveIndicatorTimerRef = useRef(0);
  const lastLiveTickRef = useRef<CandleTick | null>(null);
  const smcRefreshRef = useRef<(() => void) | null>(null);
  const tapGestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const riskDragRef = useRef<"target" | "stopLoss" | null>(null);
  const riskDragPriceRef = useRef(0);
  const riskDragPriceRangeRef = useRef<{ from: number; to: number } | null>(null);
  const orderToolEnabledRef = useRef(false);
  const [latestCandle, setLatestCandle] = useState<Candle | undefined>(() => initialData.at(-1));
  const [hoveredCandle, setHoveredCandle] = useState<{ scope: string; time: number | null } | null>(null);
  const legendScope = `${instrument.instrumentKey}|${timeframe}|${chartStyle}`;
  const legendSource = prepareStyleCandles(dataRef.current, chartStyle);
  const legend = selectCandleLegend(legendSource, hoveredCandle?.scope === legendScope ? hoveredCandle.time : null);
  const [feedMode, setFeedMode] = useState<"loading" | "live" | "stale" | "error">("loading");
  const [placementHint, setPlacementHint] = useState("");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const drawingGestureRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean; anchor: Anchor | null; origin: { x: number; y: number } | null } | null>(null);
  const drawingAimRef = useRef<Anchor | null>(null);
  const lastCrosshairAnchorRef = useRef<Anchor | null>(null);
  const confirmDrawingPointRef = useRef<(() => void) | null>(null);
  const [riskCoordinates, setRiskCoordinates] = useState<{ entry: number | null; target: number | null; stopLoss: number | null } | null>(null);
  const [tradeMarkerCoordinates, setTradeMarkerCoordinates] = useState<Array<ChartTradeMarker & { x: number; y: number; direction: "up" | "down" }>>([]);

  useEffect(() => {
    onChartTapRef.current = onChartTap;
  }, [onChartTap]);

  useEffect(() => {
    onDrawingCompleteRef.current = onDrawingComplete;
  }, [onDrawingComplete]);

  useEffect(() => {
    onPriceRef.current = onPrice;
  }, [onPrice]);

  function acceptLiveTick(tick: CandleTick, publish: boolean) {
    if (isReplay || historyRequestRef.current || !validCandleTick(tick, instrument.instrumentKey, lastLiveTickRef.current)) return;
    lastLiveTickRef.current = tick;
    let next: Candle[];
    if (externalFeed) {
      const previous = dataRef.current.at(-1);
      if (!previous) return;
      const time = candleBucket(tick.timestampMs / 1000, timeframe);
      if (time < previous.time) return;
      next = time === previous.time
        ? [...dataRef.current.slice(0, -1), { ...previous, close: tick.price, high: Math.max(previous.high, tick.price), low: Math.min(previous.low, tick.price) }]
        : [...dataRef.current, { time, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 }];
    } else next = applyCandleTick(dataRef.current, tick, timeframe);
    if (next === dataRef.current) return;
    dataRef.current = next;
    paintLastBar(next);
    setLatestCandle(next.at(-1));
    if (publish) onPriceRef.current?.(tick.price, tick.timestampMs);
    if (!liveIndicatorTimerRef.current) {
      liveIndicatorTimerRef.current = window.setTimeout(() => {
        liveIndicatorTimerRef.current = 0;
        syncIndicatorData();
      }, 400);
    }
    scheduleOverlayRefresh();
  }

  useEffect(() => { lastLiveTickRef.current = null; }, [instrument.instrumentKey, timeframe, isReplay]);
  useEffect(() => {
    if (liveTick) acceptLiveTick(liveTick, false);
  }, [liveTick?.instrumentKey, liveTick?.price, liveTick?.timestampMs, timeframe, isReplay]);

  useEffect(() => {
    onFeedStatusRef.current = onFeedStatus;
  }, [onFeedStatus]);

  function refreshRiskCoordinates() {
    const series = candleSeries.current;
    const tool = orderToolRef.current;
    if (!series || !tool?.enabled) {
      setRiskCoordinates(null);
      return;
    }
    const entry = series.priceToCoordinate(tool.entryPrice);
    const target = tool.targetPrice > 0 ? series.priceToCoordinate(tool.targetPrice) : null;
    const stopLoss = tool.stopLossPrice > 0 ? series.priceToCoordinate(tool.stopLossPrice) : null;
    if (entry === null) {
      setRiskCoordinates(null);
      return;
    }
    const chartHeight = chartHost.current?.clientHeight ?? 0;
    const legendSafeTop = 58;
    const axisSafeBottom = Math.max(legendSafeTop, chartHeight - 28);
    const visibleCoordinate = (coordinate: number | null) => coordinate !== null && coordinate >= legendSafeTop && coordinate <= axisSafeBottom
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
    const { height: chartHeight, width: chartWidth } = chart.paneSize(0);
    const positions = markers.flatMap((marker) => {
      const markerTime = marker.time > 1_000_000_000_000 ? Math.floor(marker.time / 1_000) : Math.floor(marker.time);
      let nearest = candles[0];
      for (const candle of candles) {
        if (Number(candle.time) > markerTime) break;
        nearest = candle;
      }
      const x = chart.timeScale().timeToCoordinate(chartTimeFromEpoch(Number(nearest.time), timeframe));
      // Keep execution arrows attached to the candle extremum as the chart moves.
      const anchorPrice = marker.side === "BUY" ? nearest.low : nearest.high;
      const yBase = series.priceToCoordinate(anchorPrice);
      if (x === null || yBase === null || x < 0 || x > chartWidth) return [];
      const y = yBase;
      if (y < 0 || y > chartHeight) return [];
      return [{ ...marker, candleTime: Number(nearest.time), x, y, direction: marker.side === "BUY" ? "up" as const : "down" as const }];
    });
    const spacing = chart.timeScale().options().barSpacing;
    const size = Math.max(9, Math.min(16, Math.round(spacing * 1.15)));
    const next = stackTradeMarkers(positions, chartHeight, chartWidth, size);
    setTradeMarkerCoordinates((current) => {
      if (current.length !== next.length) return next;
      const same = current.every((item, index) => {
        const other = next[index];
        return item.id === other.id && Math.abs(item.x - other.x) < .4 && Math.abs(item.y - other.y) < .4;
      });
      return same ? current : next;
    });
  }

  function scheduleOverlayRefresh() {
    if (typeof window === "undefined" || overlayFrameRef.current) return;
    overlayFrameRef.current = window.requestAnimationFrame(() => {
      overlayFrameRef.current = 0;
      const arrow = dateArrowRef.current;
      const barSpacing = chartApi.current?.timeScale().options().barSpacing ?? 8;
      const symbolSize = Math.max(9, Math.min(16, Math.round(barSpacing * 1.15)));
      setMarkerSize((current) => current === symbolSize ? current : symbolSize);
      const arrowX = arrow ? chartApi.current?.timeScale().timeToCoordinate(chartTimeFromEpoch(arrow.time, timeframe)) : null;
      const arrowY = arrow ? candleSeries.current?.priceToCoordinate(arrow.high) : null;
      setDateArrow(arrowX != null && arrowY != null ? { x: arrowX, y: arrowY, size: symbolSize } : null);
      const hostRect = chartHost.current?.getBoundingClientRect();
      const volume = studyRenderer.current?.volumeLabel();
      const pricePaneHeight = chartApi.current?.panes()[0]?.getHeight() ?? 0;
      const nextVolume = volume?.y != null && pricePaneHeight > 0 && volume.y >= 0 && volume.y <= pricePaneHeight
        ? { y: volume.y, headingTop: pricePaneHeight * .79, value: volume.value, color: volume.color } : null;
      setVolumeOverlay((current) => JSON.stringify(current) === JSON.stringify(nextVolume) ? current : nextVolume);
      // Axis tags carry percent and pane values. A second price axis is not used.
      setCompareLabels((current) => current.length ? [] : current);
      const paneTops = hostRect && compareModeRef.current === "pane" ? Object.fromEntries(overlayComparedRef.current.flatMap((item) => {
        const paneRect = compareSeries.current.get(item.instrumentKey)?.getPane().getHTMLElement()?.getBoundingClientRect();
        return paneRect ? [[item.instrumentKey,paneRect.top-hostRect.top]] : [];
      })) : {};
      setComparePaneTops((current) => JSON.stringify(current) === JSON.stringify(paneTops) ? current : paneTops);
      refreshDrawingCrosshair();
      smcRefreshRef.current?.();
      const start = replayRef.current.start;
      const x = start === null ? null : chartApi.current?.timeScale().timeToCoordinate(chartTimeFromEpoch(start, timeframe)) ?? null;
      setReplayMarkerX(x);
      refreshRiskCoordinates();
      refreshTradeMarkerCoordinates();
    });
  }

  function hitTestLine(clientX: number, clientY: number, tolerance: number) {
    const chart = chartApi.current;
    if (!chart) return null;
    const scale = chart.timeScale();
    const candidates: Array<[string, ISeriesApi<"Line">]> = [...compareSeries.current.entries()];
    if (styleSeriesKind(chartStyleRef.current) === "line" && candleSeries.current?.seriesType() === "Line") {
      candidates.push(["primary", candleSeries.current as ISeriesApi<"Line">]);
    }
    let closest = tolerance, match: string | null = null;
    for (const [key, series] of candidates) {
      const rect = series.getPane().getHTMLElement()?.getBoundingClientRect();
      if (!rect) continue;
      const x = clientX - rect.left, y = clientY - rect.top;
      if (x < 0 || x > scale.width() || y < 0 || y > rect.height) continue;
      const logical = scale.coordinateToLogical(x);
      if (logical === null) continue;
      const left = series.dataByIndex(Math.floor(logical), MismatchDirection.NearestLeft);
      const right = series.dataByIndex(Math.ceil(logical), MismatchDirection.NearestRight);
      if (!left || !right || !("value" in left) || !("value" in right)) continue;
      const ax = scale.timeToCoordinate(left.time), bx = scale.timeToCoordinate(right.time);
      const ay = series.priceToCoordinate(left.value), by = series.priceToCoordinate(right.value);
      if (ax === null || bx === null || ay === null || by === null) continue;
      const dx = bx - ax, dy = by - ay;
      const ratio = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(x - ax - ratio * dx, y - ay - ratio * dy);
      if (distance < closest) { closest = distance; match = key; }
    }
    return match;
  }

  useEffect(() => {
    replayRef.current = { selecting: replaySelecting, start: replayStartTime, onSelect: onReplaySelect, onPreview: onReplayPreview };
    scheduleOverlayRefresh();
  }, [replaySelecting, replayStartTime, onReplaySelect, onReplayPreview]);

  function orderToolPnl(tool: ChartOrderTool, price: number) {
    return positionPnl(tool.side, tool.quantity, tool.entryPrice, price);
  }

  function formatRiskPnl(value: number) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const usd = orderTool?.currency === "USD";
    return `${sign}${usd ? "$" : "₹"}${Math.abs(value).toLocaleString(usd ? "en-US" : "en-IN", { maximumFractionDigits: 2 })}`;
  }

  function compactRiskPnl(value: number) {
    return orderTool?.currency === "USD" ? formatRiskPnl(value) : compactPnl(value);
  }

  function riskPriceFromPointer(event: ReactPointerEvent<HTMLDivElement>, level: "target" | "stopLoss") {
    const host = chartHost.current;
    const series = candleSeries.current;
    const tool = orderToolRef.current;
    if (!host || !series || !tool) return null;
    const bounds = host.getBoundingClientRect();
    const rawPrice = series.coordinateToPrice(Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)));
    if (rawPrice === null || !Number.isFinite(rawPrice)) return null;
    if (tool.tickSize) {
      // Global stops may lock in profit: validate against the current trigger, not entry.
      const reference = tool.referencePrice ?? tool.entryPrice;
      const above = tool.side === "BUY" ? level === "target" : level === "stopLoss";
      const boundary = above ? (Math.floor(reference / tool.tickSize) + 1) * tool.tickSize : (Math.ceil(reference / tool.tickSize) - 1) * tool.tickSize;
      const rounded = Math.round(rawPrice / tool.tickSize) * tool.tickSize;
      return Number(Math.max(tool.tickSize, above ? Math.max(boundary, rounded) : Math.min(boundary, rounded)).toFixed(10));
    }
    const tick = Math.max(.05, tool.entryPrice * .0001);
    if (tool.side === "BUY") {
      return level === "target" ? Math.max(tool.entryPrice + tick, rawPrice) : Math.max(tick, Math.min(tool.entryPrice - tick, rawPrice));
    }
    return level === "target" ? Math.max(tick, Math.min(tool.entryPrice - tick, rawPrice)) : Math.max(tool.entryPrice + tick, rawPrice);
  }

  function beginRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    riskDragRef.current = level;
    riskGestureKeyRef.current = entryKey;
    riskDragPriceRef.current = 0;
    riskPointerStartRef.current = event.clientY;
    const priceScale = chartApi.current?.priceScale("right");
    riskDragPriceRangeRef.current = priceScale?.getVisibleRange() ?? null;
    priceScale?.setAutoScale(false);
    if (riskDragPriceRangeRef.current) priceScale?.setVisibleRange(riskDragPriceRangeRef.current);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    chartApi.current?.applyOptions({ handleScroll: false, handleScale: false });
    event.nativeEvent.stopImmediatePropagation?.();
    event.preventDefault();
    event.stopPropagation();
  }

  function moveRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    if (riskDragRef.current !== level) return;
    if (Math.abs(event.clientY - riskPointerStartRef.current) < 4 && !riskDragPriceRef.current) return;
    const price = riskPriceFromPointer(event, level);
    if (price === null) return;
    riskDragPriceRef.current = price;
    setDraftRisk({ key: entryKey, level, price });
    const frozenRange = riskDragPriceRangeRef.current;
    if (frozenRange) {
      const priceScale = chartApi.current?.priceScale("right");
      priceScale?.setAutoScale(false);
      priceScale?.setVisibleRange(frozenRange);
    }
    event.nativeEvent.stopImmediatePropagation?.();
    event.preventDefault();
    event.stopPropagation();
  }

  function endRiskDrag(level: "target" | "stopLoss", event: ReactPointerEvent<HTMLDivElement>) {
    if (riskDragRef.current !== level) return;
    const price = riskDragPriceRef.current;
    riskDragRef.current = null;
    chartApi.current?.applyOptions(chartInteractionOptions(activeToolRef.current === "cursor", preservePageScroll));
    setDraftRisk(null);
    if (event.type !== "pointercancel" && price > 0 && riskGestureKeyRef.current === entryKey) onOrderToolChange?.(level, price, true);
    const frozenRange = riskDragPriceRangeRef.current;
    if (frozenRange) {
      const priceScale = chartApi.current?.priceScale("right");
      priceScale?.setAutoScale(false);
      priceScale?.setVisibleRange(frozenRange);
    }
    // Freeze the scale only for the gesture. The user regains normal chart
    // scaling as soon as the handle is released.
    riskDragPriceRangeRef.current = null;
    chartApi.current?.priceScale("right").setAutoScale(true);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    event.nativeEvent.stopImmediatePropagation?.();
    event.preventDefault();
    event.stopPropagation();
  }

  function applyVisibleRange(data = dataRef.current) {
    const chart = chartApi.current;
    if (!chart || !data.length) return;
    const count = data.length;
    if (focusTradeMarkersRef.current && tradeMarkersRef.current.length) {
      const markerIndexes = tradeMarkersRef.current
        .map((marker) => {
          const markerTime = marker.time > 1_000_000_000_000 ? Math.floor(marker.time / 1_000) : Math.floor(marker.time);
          let nearestIndex = 0;
          let nearestDistance = Math.abs(Number(data[0].time) - markerTime);
          data.forEach((candle, index) => {
            const distance = Math.abs(Number(candle.time) - markerTime);
            if (distance < nearestDistance) {
              nearestIndex = index;
              nearestDistance = distance;
            }
          });
          return nearestIndex;
        })
        .filter((index) => Number.isFinite(index));
      if (markerIndexes.length) {
        const leftMost = Math.min(...markerIndexes);
        const rightMost = Math.max(...markerIndexes);
        const padding = Math.max(8, Math.min(18, Math.round(visibleBarsRef.current * 0.22)));
        const from = Math.max(-0.5, leftMost - padding - 0.5);
        const toBase = Math.min(count - 1, rightMost + padding);
        const rightOffset = Math.max(4, Math.min(10, (toBase - from + 1) * 0.08));
        chart.timeScale().setVisibleLogicalRange({ from, to: toBase + rightOffset });
        scheduleOverlayRefresh();
        return;
      }
    }
    const bars = Math.max(12, Math.min(visibleBarsRef.current, count));
    const tool = orderToolRef.current;
    const extraRightOffset = tool?.enabled ? Math.max(5, Math.min(10, bars * 0.18)) : Math.max(2, Math.min(4, bars * 0.08));
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(-0.5, count - bars - 0.5),
      to: count - 1 + extraRightOffset,
    });
  }

  function applyInitialVisibleRange(data = dataRef.current) {
    if (viewportInteractedRef.current) return;
    applyVisibleRange(data);
  }

  function refreshStudyHeaders() {
    const chart = chartApi.current;
    if (!chart) return;
    const panes = chart.panes(), tops = [0];
    for (let i = 1; i < panes.length; i++) tops[i] = tops[i-1] + panes[i-1].getHeight();
    const next = (studyRenderer.current?.summaries() ?? []).map(s => ({ ...s, top: tops[s.pane] ?? 0 }));
    setStudySummaries(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
  }
  function fitStudyPanes() {
    const chart = chartApi.current;
    window.requestAnimationFrame(() => { if (chart && chartApi.current === chart) {
      const height = Math.max(280, chartHost.current?.clientHeight ?? 280);
      studyRenderer.current?.fit(height);
      if (compareModeRef.current === "pane" && compareSeries.current.size) {
        const comparePanes = [...new Set([...compareSeries.current.values()].map((series) => series.getPane()))];
        const others = chart.panes().filter((item) => item !== chart.panes()[0] && !comparePanes.includes(item)).reduce((sum, item) => sum + item.getHeight(), 0);
        const compareTotal = Math.max(0, Math.min(Math.floor(height * Math.min(.62,.38+(comparePanes.length-1)*.12)),height-others-150));
        const compareHeight = Math.max(80,Math.floor(compareTotal/comparePanes.length));
        for (const pane of comparePanes) pane.setHeight(compareHeight);
        chart.panes()[0]?.setHeight(Math.max(150,height-others-compareHeight*comparePanes.length));
      }
      window.requestAnimationFrame(()=>{if(chartApi.current===chart){refreshStudyHeaders();scheduleOverlayRefresh();}});
    } });
  }
  function syncIndicatorData(data = dataRef.current) {
    const chart = chartApi.current;
    if (!chart) return;
    if (!studyRenderer.current) studyRenderer.current = new ChartStudyRenderer(chart, epoch => chartTimeFromEpoch(epoch, timeframe));
    const old = studyRenderer.current.signature;
    studyRenderer.current.comparisons=comparisonRef.current;
    studyRenderer.current.sync(indicatorsRef.current, studySettingsRef.current, timeframe, data);
    if (compareModeRef.current === "pane" && compareSeries.current.size) {
      const comparePane = Math.max(1, ...studyRenderer.current.bundles.map((bundle) => bundle.pane + 1));
      overlayComparedRef.current.forEach((item,index) => compareSeries.current.get(item.instrumentKey)?.moveToPane(comparePane+index));
    }
    if (old !== studyRenderer.current.signature) fitStudyPanes();
    refreshStudyHeaders();
  }
  function syncIndicators(next: ChartIndicators) {
    indicatorsRef.current = next;
    syncIndicatorData();
  }

  function paintPriceSeries(candles = dataRef.current) {
    const series = candleSeries.current;
    if (!series) return;
    const style = chartStyleRef.current;
    const points = styleSeriesData(candles, style, timeframe);
    series.setData(points as never);
    const source = prepareStyleCandles(candles, style);
    if (hlcSeries.current && style === "hlc-area") {
      hlcSeries.current.high.setData(source.map((candle) => ({ time: chartTimeFromEpoch(Number(candle.time), timeframe), value: candle.high })));
      hlcSeries.current.low.setData(source.map((candle) => ({ time: chartTimeFromEpoch(Number(candle.time), timeframe), value: candle.low })));
    }
    profileOverlay.current?.update(style, candles, timeframe);
  }

  function paintLastBar(candles = dataRef.current) {
    const series = candleSeries.current;
    const last = candles.at(-1);
    if (!series || !last) return;
    const style = chartStyleRef.current;
    const source = prepareStyleCandles(candles, style);
    const point = source.at(-1);
    if (!point) return;
    series.update(toStyleSeriesPoint(point, source, source.length - 1, style, chartTimeFromEpoch(Number(point.time), timeframe)) as never);
    if (hlcSeries.current && style === "hlc-area") {
      hlcSeries.current.high.update({ time: chartTimeFromEpoch(Number(point.time), timeframe), value: point.high });
      hlcSeries.current.low.update({ time: chartTimeFromEpoch(Number(point.time), timeframe), value: point.low });
    }
    profileOverlay.current?.update(style, candles, timeframe);
  }

  function persistDrawings(pushHistory = false) {
    const manager = drawingManager.current;
    if (!manager || restoringRef.current) return;
    const snapshot = manager.exportDrawings();
    storedDrawingsRef.current = snapshot;
    if (isReplay) replayDrawingsRef.current = { scope: storageKeyRef.current, snapshot };
    if (!isReplay) window.localStorage.setItem(storageKeyRef.current, JSON.stringify(snapshot));
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
      const drawing = registry.createDrawing(item.type, item.id, item.anchors, { ...item.style, labelFont: "13px Inter, sans-serif" }, item.options);
      if (drawing) {
        drawing.updateOptions({ ...item.options, visible: !hiddenRef.current, locked: lockedRef.current });
        manager.addDrawing(drawing);
      }
    }
    restoringRef.current = false;
    if (persist) {
      storedDrawingsRef.current = snapshot;
      if (isReplay) replayDrawingsRef.current = { scope: storageKeyRef.current, snapshot };
      if (!isReplay) window.localStorage.setItem(storageKeyRef.current, JSON.stringify(snapshot));
    }
  }

  function snapAnchor(rawTime: Time, rawPrice: number): Anchor {
    if (!magnetRef.current || !dataRef.current.length) return { time: rawTime, price: rawPrice };
    const numericTime = timeToTimestamp(rawTime);
    let nearest = dataRef.current[0];
    let distance = Math.abs(Number(chartTimeFromEpoch(Number(nearest.time), timeframe)) - numericTime);
    for (const candle of dataRef.current) {
      const nextDistance = Math.abs(Number(chartTimeFromEpoch(Number(candle.time), timeframe)) - numericTime);
      if (nextDistance < distance) {
        nearest = candle;
        distance = nextDistance;
      }
    }
    const prices = [nearest.open, nearest.high, nearest.low, nearest.close];
    const price = prices.reduce((best, value) => Math.abs(value - rawPrice) < Math.abs(best - rawPrice) ? value : best, prices[0]);
    const rawY = candleSeries.current?.priceToCoordinate(rawPrice), snapY = candleSeries.current?.priceToCoordinate(price);
    if (rawY == null || snapY == null || Math.abs(rawY - snapY) > 12) return { time: rawTime, price: rawPrice };
    return { time: chartTimeFromEpoch(Number(nearest.time), timeframe), price };
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
    if (x < 0 || x > chart.timeScale().width() || y < 0 || y > mainPaneHeight) return null;
    const time = drawingTimeAtCoordinate(x);
    const price = series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return useMagnet ? snapAnchor(time, price) : { time, price };
  }

  function drawingTimeAtCoordinate(x: number): Time | null {
    const scale = chartApi.current?.timeScale();
    if (!scale) return null;
    const time = scale.coordinateToTime(x);
    if (time !== null) return time;
    const logical = scale.coordinateToLogical(x), bars = dataRef.current;
    if (logical === null || !bars.length) return null;
    const epoch=drawingTimeAtLogical(Number(logical),bars.map(c=>Number(c.time)));
    return epoch===null?null:chartTimeFromEpoch(epoch,timeframe);
  }

  function refreshDrawingCrosshair() {
    const element=drawingCrosshairRef.current,chart=chartApi.current,series=candleSeries.current,anchor=drawingAimRef.current;
    if(!element)return;
    const tool=normalizeTool(activeToolRef.current);
    if(!chart||!series||!anchor||!tool||hiddenRef.current||CONTINUOUS_TOOLS.has(tool)){element.hidden=true;return;}
    const logical=drawingLogicalAtTime(Number(anchor.time),dataRef.current.map(c=>Number(chartTimeFromEpoch(Number(c.time),timeframe))));
    const x=chart.timeScale().timeToCoordinate(anchor.time)??(logical===null?null:chart.timeScale().logicalToCoordinate(logical as Logical));
    const y=series.priceToCoordinate(anchor.price),height=chart.panes()[0]?.getHeight()??0,width=chart.timeScale().width();
    element.hidden=x===null||y===null||x<0||x>width||y<0||y>height;
    if(element.hidden)return;
    element.style.width=`${width}px`;element.style.height=`${height}px`;
    element.style.setProperty("--aim-x",`${x}px`);element.style.setProperty("--aim-y",`${y}px`);
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
    drawingManager.current?.setActiveTool("pointer-controlled");
    drawingAimRef.current = null;
    refreshDrawingCrosshair();
    chartApi.current?.clearCrosshairPosition();
    chartApi.current?.applyOptions(chartInteractionOptions(true, preservePageScroll));
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
  }, [indicators, studySettings, comparisonData]);

  useEffect(() => {
    visibleBarsRef.current = visibleBars;
    applyVisibleRange();
  }, [visibleBars]);

  useEffect(() => {
    focusTradeMarkersRef.current = focusTradeMarkers;
    applyInitialVisibleRange();
    scheduleOverlayRefresh();
  }, [focusTradeMarkers]);

  useEffect(() => {
    orderToolRef.current = orderTool;
    candleSeries.current?.applyOptions({});
    const priceScale = chartApi.current?.priceScale("right");
    const enabled = Boolean(orderTool?.enabled);
    const wasEnabled = orderToolEnabledRef.current;
    orderToolEnabledRef.current = enabled;
    const frozenRange = riskDragPriceRangeRef.current;
    priceScale?.applyOptions({
      autoScale: frozenRange ? false : undefined,
      scaleMargins: enabled
        ? { top: 0.24, bottom: 0.15 }
        : { top: 0.10, bottom: 0.10 },
    });
    if (!enabled) {
      riskDragPriceRangeRef.current = null;
      // The unused entry price follows LTP. It must not reset a user's manual
      // price scale on every tick when there is no open position.
      if (wasEnabled && !viewportInteractedRef.current) {
        priceScale?.setAutoScale(true);
        applyInitialVisibleRange();
      }
    } else if (frozenRange) {
      priceScale?.setAutoScale(false);
      priceScale?.setVisibleRange(frozenRange);
    } else if (!wasEnabled && !viewportInteractedRef.current) {
      priceScale?.setAutoScale(true);
      applyInitialVisibleRange();
    }
    scheduleOverlayRefresh();
    if (!enabled) return;
    const interval = window.setInterval(() => {
      refreshRiskCoordinates();
      refreshTradeMarkerCoordinates();
    }, 120);
    return () => window.clearInterval(interval);
  }, [orderTool?.enabled, orderTool?.entryPrice, orderTool?.quantity, orderTool?.side, orderTool?.stopLossPrice, orderTool?.targetPrice, orderTool?.referencePrice, orderTool?.tickSize]);

  const tradeMarkerKey = tradeMarkers
    .map((marker) => `${marker.id}:${marker.time}:${marker.side}:${marker.price}`)
    .join("|");

  useEffect(() => {
    tradeMarkersRef.current = tradeMarkers;
    if (tradeMarkerKeyRef.current !== tradeMarkerKey) {
      tradeMarkerKeyRef.current = tradeMarkerKey;
      applyInitialVisibleRange();
    }
    scheduleOverlayRefresh();
  }, [tradeMarkerKey, tradeMarkers]);

  useEffect(() => {
    const chart = chartApi.current;
    if (!chart) return;
    const neon = chartTheme === "neon";
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: neon ? "#0c142b" : "#ffffff" },
        textColor: neon ? "#a4adc7" : "#65708a",
        attributionLogo: true,
        panes: { separatorColor: neon ? "#2c3859" : "#e3e6ee", separatorHoverColor: neon ? "#bf9aff" : "#d8d3ff", enableResize: true },
      },
      grid: {
        vertLines: { color: neon ? "#19233c" : "#edf0f6" },
        horzLines: { color: neon ? "#19233c" : "#edf0f6" },
      },
      rightPriceScale: { borderColor: neon ? "#2c3859" : "#dfe3ec" },
      timeScale: { borderColor: neon ? "#2c3859" : "#dfe3ec" },
      crosshair: {
        vertLine: { color: neon ? "#bf9aff" : "#8c96aa", labelBackgroundColor: neon ? "#342353" : "#252b3d" },
        horzLine: { color: neon ? "#bf9aff" : "#8c96aa", labelBackgroundColor: neon ? "#342353" : "#252b3d" },
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
    setSelectedStudy(null);
    lastStudyTap.current = null;
    cancelDraft();
    const chart = chartApi.current;
    const manager = drawingManager.current;
    const drawingType = normalizeTool(activeTool);
    // Pointer input owns selection as well as placement; disable the library's competing mouse click selector.
    manager?.setActiveTool("pointer-controlled");
    chart?.applyOptions(chartInteractionOptions(activeTool === "cursor", preservePageScroll));
    chartHost.current?.classList.toggle("is-drawing", activeTool !== "cursor");
    const definition = drawingType ? DRAWING_TOOL_CATALOG.find((tool) => tool.id === drawingType) : undefined;
    const pointTool = drawingType && !CONTINUOUS_TOOLS.has(drawingType);
    const centerTime = chart ? drawingTimeAtCoordinate(chart.timeScale().width() / 2) : null;
    const centerPrice = chart ? candleSeries.current?.coordinateToPrice((chart.panes()[0]?.getHeight() ?? 0) / 2) : null;
    drawingAimRef.current = pointTool ? lastCrosshairAnchorRef.current ?? (centerTime !== null && centerPrice != null ? { time: centerTime, price: centerPrice } : null) : null;
    if (drawingAimRef.current && candleSeries.current) chart?.setCrosshairPosition(drawingAimRef.current.price, drawingAimRef.current.time, candleSeries.current);
    chart?.applyOptions({crosshair:{vertLine:{visible:!pointTool},horzLine:{visible:!pointTool}}});
    refreshDrawingCrosshair();
    const hint = definition ? `${definition.label} · drag crosshair, tap anywhere to confirm` : drawingType ? "Drag crosshair · tap anywhere to confirm" : "";
    const hintTimer = window.setTimeout(() => setPlacementHint(hint), 0);
    return () => window.clearTimeout(hintTimer);
  }, [activeTool, preservePageScroll, toolSignal]);

  useEffect(() => {
    lockedRef.current = lockedDrawings;
    for (const drawing of drawingManager.current?.getAllDrawings() ?? []) drawing.updateOptions({ locked: lockedDrawings });
    persistDrawings();
  }, [lockedDrawings]);

  useEffect(() => {
    hiddenRef.current = hiddenDrawings;
    for (const drawing of drawingManager.current?.getAllDrawings() ?? []) drawing.updateOptions({ visible: !hiddenDrawings });
    refreshDrawingCrosshair();
    persistDrawings();
  }, [hiddenDrawings]);

  useEffect(() => {
    const chart = chartApi.current;
    if (!chartAction || !chart) return;
    if (chartAction.type === "fit") {
      viewportInteractedRef.current = false;
      chart.priceScale("right").setAutoScale(true);
      chart.timeScale().fitContent();
    }
    if (chartAction.type === "reset") {
      viewportInteractedRef.current = false;
      chart.priceScale("right").setAutoScale(true);
      applyVisibleRange();
      chart.timeScale().scrollToRealTime();
    }
    if (chartAction.type === "live") {
      viewportInteractedRef.current = false;
      chart.priceScale("right").setAutoScale(true);
      chart.timeScale().scrollToRealTime();
    }
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
      void stampChartOverlay(canvas, chartHost.current).catch(() => undefined).then(() => canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${instrument.symbol}-${timeframe}-chart.png`;
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png"));
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
    viewportInteractedRef.current = false;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let manager: DrawingManager | null = null;
    let resizeChart: (() => void) | null = null;
    let refreshOverlays: (() => void) | null = null;
    let crosshairMove: ((event: MouseEventParams<Time>) => void) | null = null;
    let replayClick: ((event: MouseEventParams<Time>) => void) | null = null;
    let resizeFrame = 0;
    let profileClient: ReturnType<typeof createProfileDataClient> | undefined;
    let profileRefresh: ReturnType<typeof setInterval> | undefined;

    void Promise.all([import("lightweight-charts"), import("lightweight-charts-drawing")]).then(([lwc, drawing]) => {
      if (cancelled) return;
      const neon = chartTheme === "neon";
      const chart = lwc.createChart(host, {
        autoSize: false,
        width: Math.max(1, Math.floor(host.clientWidth)),
        height: Math.max(1, Math.floor(host.clientHeight)),
        layout: {
          background: { type: lwc.ColorType.Solid, color: neon ? "#0c142b" : "#ffffff" },
          textColor: neon ? "#a4adc7" : "#65708a",
          fontFamily: "Inter, system-ui, sans-serif",
          attributionLogo: true,
          panes: { separatorColor: neon ? "#2c3859" : "#e3e6ee", separatorHoverColor: neon ? "#bf9aff" : "#d8d3ff", enableResize: true },
        },
        grid: {
          vertLines: { color: neon ? "#19233c" : "#edf0f6", style: lwc.LineStyle.Dashed },
          horzLines: { color: neon ? "#19233c" : "#edf0f6", style: lwc.LineStyle.Dashed },
        },
        rightPriceScale: {
          visible: true,
          borderColor: neon ? "#2c3859" : "#dfe3ec",
          scaleMargins: orderToolRef.current?.enabled
            ? { top: 0.24, bottom: 0.15 }
            : { top: 0.10, bottom: 0.10 },
          minimumWidth: 58,
          entireTextOnly: true,
        },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: neon ? "#2c3859" : "#dfe3ec",
          timeVisible: true,
          secondsVisible: timeframe === "1m",
          tickMarkFormatter: (time: Time) => chartTickTime(time, timeframe),
          rightOffset: 8,
          barSpacing: 7,
          minBarSpacing: 2,
          fixLeftEdge: false,
          fixRightEdge: false,
          rightBarStaysOnScroll: false,
          // Follow new bars only at the live edge; Lightweight Charts preserves
          // a viewport that the user has scrolled into history.
          shiftVisibleRangeOnNewBar: true,
          lockVisibleTimeRangeOnResize: true,
        },
        crosshair: {
          mode: magnetRef.current ? lwc.CrosshairMode.MagnetOHLC : lwc.CrosshairMode.Normal,
          vertLine: { color: neon ? "#bf9aff" : "#8c96aa", width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: neon ? "#342353" : "#252b3d" },
          horzLine: { color: neon ? "#bf9aff" : "#8c96aa", width: 1, style: lwc.LineStyle.Dashed, labelBackgroundColor: neon ? "#342353" : "#252b3d" },
        },
        ...chartInteractionOptions(activeTool === "cursor", preservePageScroll),
        kineticScroll: { mouse: true, touch: true },
        localization: {
          locale: instrument.instrumentKey?.startsWith("DELTA|") || instrument.instrumentKey?.startsWith("TVC|") ? "en-US" : "en-IN",
          priceFormatter: (price: number) => price.toLocaleString(instrument.instrumentKey?.startsWith("DELTA|") || instrument.instrumentKey?.startsWith("TVC|") ? "en-US" : "en-IN", { minimumFractionDigits: 0, maximumFractionDigits: externalFeed ? globalPriceFormatRef.current.precision : 2 }),
          timeFormatter: (time: Time) => chartDisplayTime(time, timeframe),
        },
      });
      const style = chartStyleRef.current;
      const kind = styleSeriesKind(style);
      const shared = {
        ...(externalFeed ? { priceFormat: globalPriceFormatRef.current } : {}),
        priceLineVisible: true,
        priceLineColor: "#6657ee",
        priceLineWidth: 1 as const,
        priceLineStyle: lwc.LineStyle.Dashed,
        lastValueVisible: true,
        title: "",
        autoscaleInfoProvider: (baseImplementation: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
          const base = baseImplementation();
          const tool = orderToolRef.current;
          if (!base || !tool?.enabled || candlesOnlyRef.current) return base;
          const levels = [tool.entryPrice, tool.targetPrice, tool.stopLossPrice].filter((value) => Number.isFinite(value) && value > 0);
          if (!levels.length) return base;
          const minValue = Math.min(base.priceRange.minValue, ...levels);
          const maxValue = Math.max(base.priceRange.maxValue, ...levels);
          const padding = Math.max((maxValue - minValue) * 0.08, tool.entryPrice * 0.002, tool.tickSize ?? 0.05);
          return { ...base, priceRange: { minValue: Math.max(0, minValue - padding), maxValue: maxValue + padding } };
        },
      };
      const series = kind === "bar"
        ? chart.addSeries(lwc.BarSeries, { ...shared, upColor: "#00a67e", downColor: "#f04458", thinBars: style === "high-low" })
        : kind === "line"
          ? chart.addSeries(lwc.LineSeries, { ...shared, color: primaryLineColor, lineWidth: 2, lineType: style === "step-line" ? lwc.LineType.WithSteps : lwc.LineType.Simple, pointMarkersVisible: style === "line-markers", pointMarkersRadius: 3 })
          : kind === "area"
            ? chart.addSeries(lwc.AreaSeries, { ...shared, lineColor: primaryLineColor, topColor: `${primaryLineColor}47`, bottomColor: `${primaryLineColor}0a`, lineWidth: 2 })
            : kind === "baseline"
              ? chart.addSeries(lwc.BaselineSeries, { ...shared, baseValue: { type: "price", price: styleBaselinePrice(dataRef.current) }, topLineColor: "#00a67e", topFillColor1: "rgba(0,166,126,0.28)", topFillColor2: "rgba(0,166,126,0.04)", bottomLineColor: "#f04458", bottomFillColor1: "rgba(240,68,88,0.28)", bottomFillColor2: "rgba(240,68,88,0.04)" })
              : kind === "histogram"
                ? chart.addSeries(lwc.HistogramSeries, { ...shared, color: "#2962FF" })
                : chart.addSeries(lwc.CandlestickSeries, {
                  ...shared,
                  upColor: style === "hollow-candles" ? "rgba(0,166,126,0)" : "#00a67e",
                  downColor: "#f04458",
                  borderVisible: style === "hollow-candles",
                  borderUpColor: "#00a67e",
                  borderDownColor: "#f04458",
                  wickUpColor: "#00a67e",
                  wickDownColor: "#f04458",
                });
      chartApi.current = chart;
      candleSeries.current = series;
      if (style === "hlc-area") {
        hlcSeries.current = {
          high: chart.addSeries(lwc.LineSeries, { color: "rgba(0,166,126,.72)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
          low: chart.addSeries(lwc.LineSeries, { color: "rgba(240,68,88,.72)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }),
        };
      } else hlcSeries.current = null;
      if (isProfileStyle(style)) {
        const overlay = new ChartProfileOverlay();
        series.attachPrimitive(overlay);
        profileOverlay.current = overlay;
      } else profileOverlay.current = null;
      paintPriceSeries();
      setChartGeneration((value) => value + 1);

      crosshairMove = (event) => {
        // Keep the visible crosshair when entering a drawing tool. Confirmation taps must never replace it.
        if (!normalizeTool(activeToolRef.current) && event.point && event.time !== undefined && event.point.y <= (chart.panes()[0]?.getHeight() ?? 0)) {
          const price = series.coordinateToPrice(event.point.y);
          if (price !== null) { lastCrosshairAnchorRef.current = { time: event.time, price }; setPriceCursor({ price: Math.round(price * 100) / 100, y: event.point.y }); }
        }
        // Series data works in price and indicator panes, and for touch crosshairs.
        // Never feed a hovered historical price back into execution or live quotes.
        const bar = event.point ? event.seriesData.get(series) : undefined;
        const stamp = bar && "time" in bar ? bar.time : event.time;
        const time = typeof stamp === "number"
          ? stamp - (usesIntradayAxisShift(timeframe) ? IST_OFFSET_SECONDS : 0)
          : null;
        setHoveredCandle((previous) => previous?.scope === legendScope && previous.time === time
          ? previous : { scope: legendScope, time });
      };
      chart.subscribeCrosshairMove(crosshairMove);
      replayClick = (event) => {
        if (!replayRef.current.selecting || event.time === undefined) return;
        const time = timeToTimestamp(event.time) - (usesIntradayAxisShift(timeframe) ? IST_OFFSET_SECONDS : 0);
        replayRef.current.onPreview?.(time);
      };
      if (isReplay) chart.subscribeClick(replayClick);

      manager = new drawing.DrawingManager();
      manager.attach(chart, series, host);
      drawingManager.current = manager;
      manager.setActiveTool("pointer-controlled");
      const refreshProfiles = () => {
        for (const item of manager?.getAllDrawings() ?? []) if (item.type.endsWith("volume-profile")) item.updateOptions({});
      };
      profileClient = createProfileDataClient(instrument.instrumentKey, refreshProfiles);
      profileRefresh = setInterval(refreshProfiles, 60000);
      drawingRegistry.current = createChartDrawingRegistry(drawing,
        () => dataRef.current.map(c => ({ ...c, time: Number(chartTimeFromEpoch(Number(c.time), timeframe)) })),
        () => ({ width: chart.timeScale().width(), height: chart.panes()[0]?.getHeight() ?? host.clientHeight, dark: neon }),
        (from, to, mode, id) => {
          const shift = usesIntradayAxisShift(timeframe) ? IST_OFFSET_SECONDS : 0;
          const interval = LIVE_TIMEFRAME_SECONDS[timeframe] ?? ({ "1D":86400, "1W":604800, "1M":2678400, "1Y":31622400 }[timeframe] ?? 86400);
          const period = profilePeriod(from-shift, to-shift, mode, dataRef.current.map(c => Number(c.time)), interval, timeframe);
          if (isReplay || externalFeed) return { candles: dataRef.current.filter(c => Number(c.time)>=period.from && Number(c.time)<=period.to).map(c=>({...c,time:Number(c.time)})), label: `${timeframe} ${externalFeed?'Delta':'replay'} volume · estimated distribution` };
          // Profiles are independent of the quote feed: no profile candle can change a fill price.
          return profileClient!.read(period.from, Math.min(period.to, Math.floor(Date.now()/60000)*60), id);
        });
      const drawingScope = drawingStorageKey(instrument);
      const stored = isReplay ? (replayDrawingsRef.current?.scope === drawingScope ? replayDrawingsRef.current.snapshot : []) : readStoredDrawings(drawingScope, legacyDrawingStorageKey(instrument, timeframe));
      storageKeyRef.current = drawingScope;
      storedDrawingsRef.current = stored;
      if (!isReplay) window.localStorage.setItem(storageKeyRef.current, JSON.stringify(stored));
      restoreDrawings(projectDrawingsToCandles(stored, dataRef.current, timeframe), false);
      historyRef.current = [stored];
      redoRef.current = [];

      manager.on("drawing:updated", () => persistDrawings(true));
      manager.on("drawing:removed", () => persistDrawings(true));
      manager.on("drawing:cleared", () => persistDrawings(true));
      const syncSelectedDrawing = () => setSelectedDrawingId(manager?.getSelectedDrawing()?.id ?? null);
      manager.on("drawing:selected", syncSelectedDrawing);
      manager.on("drawing:deselected", syncSelectedDrawing);
      manager.on("drawing:removed", syncSelectedDrawing);
      manager.on("drawing:cleared", syncSelectedDrawing);

      const pointers = new Set<number>();
      let pinching = false;
      const aim = (event: PointerEvent) => {
        const gesture = drawingGestureRef.current;
        const origin = gesture?.origin;
        // Remote drags act like a trackpad, preserving the aim-to-finger offset.
        const x = origin && gesture ? Math.max(0, Math.min(chart.timeScale().width(), origin.x + event.clientX - gesture.x)) : null;
        const y = origin && gesture ? Math.max(0, Math.min(chart.panes()[0].getHeight(), origin.y + event.clientY - gesture.y)) : null;
        const time = x === null ? null : drawingTimeAtCoordinate(x);
        const price = y === null ? null : series.coordinateToPrice(y);
        const anchor = time !== null && price !== null ? snapAnchor(time, price) : pointerAnchor(event, true);
        if (!anchor) return;
        drawingAimRef.current = anchor;
        lastCrosshairAnchorRef.current = anchor;
        chart.setCrosshairPosition(anchor.price, anchor.time, series);
        refreshDrawingCrosshair();
        updateDraftPreview(anchor);
      };
      const commitOrEdit = (event: PointerEvent, aimedAnchor?: Anchor) => {
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
            return [[0,0],[-8,0],[8,0],[0,-8],[0,8]].some(([dx,dy]) => drawingItem.testHit({x:point.x+dx,y:point.y+dy}, viewport));
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
            pointerId: event.pointerId,
            startX: event.clientX,
            originalPixels: hit.anchors.map(anchor => hit.getViewport()?.timeScale.timeToCoordinate(anchor.time) ?? null),
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

        const anchor = aimedAnchor ?? pointerAnchor(event, true);
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
          setPlacementHint(`${placed}/${draftRef.current.requiredAnchors} points · move crosshair, tap anywhere to confirm`);
        }
      };

      confirmDrawingPointRef.current = () => {
        if (drawingAimRef.current && normalizeTool(activeToolRef.current)) commitOrEdit(new PointerEvent("pointerup"), drawingAimRef.current);
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        if (hiddenRef.current && normalizeTool(activeToolRef.current)) return;
        pointers.add(event.pointerId);
        if (pointers.size > 1) {
          setSelectedStudy(null);lastStudyTap.current=null;
          viewportInteractedRef.current = true;
          pinching = true;
          drawingGestureRef.current = null;
          if (editRef.current) { editRef.current.drawing.setAnchors(editRef.current.originalAnchors); editRef.current = null; }
          chart.applyOptions(chartInteractionOptions(true, preservePageScroll));
          return;
        }
        const tool = normalizeTool(activeToolRef.current);
        if (!tool || CONTINUOUS_TOOLS.has(tool)) { commitOrEdit(event); return; }
        // Snapshot the existing crosshair BEFORE touching the screen. A tap is confirmation only.
        const anchor = drawingAimRef.current ? { ...drawingAimRef.current } : null;
        const logical = anchor ? drawingLogicalAtTime(Number(anchor.time), dataRef.current.map(c => Number(chartTimeFromEpoch(Number(c.time), timeframe)))) : null;
        const aimX = anchor ? chart.timeScale().timeToCoordinate(anchor.time) ?? (logical === null ? null : chart.timeScale().logicalToCoordinate(logical as Logical)) : null;
        const aimY = anchor ? series.priceToCoordinate(anchor.price) : null;
        drawingGestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, anchor, origin: aimX === null || aimY === null ? null : { x: aimX, y: aimY } };
        host.setPointerCapture?.(event.pointerId);
        event.preventDefault(); event.stopPropagation();
      };

      const onPointerMove = (event: PointerEvent) => {
        scheduleOverlayRefresh();
        if (pinching) return;
        const gesture = drawingGestureRef.current;
        if (gesture?.pointerId === event.pointerId && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>6) gesture.moved = true;
        const tap = tapGestureRef.current;
        if (tap?.pointerId === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) {
          tap.moved = true;
          setSelectedStudy(null);lastStudyTap.current=null;
          viewportInteractedRef.current = true;
        }
        const edit = editRef.current;
        if (edit && edit.pointerId === event.pointerId) {
          const current = pointerAnchor(event, false);
          if (!current) return;
          if (edit.anchorIndex !== null) {
            const original = edit.originalAnchors[edit.anchorIndex];
            const originalX = edit.originalPixels[edit.anchorIndex];
            const next = { time: originalX === null ? original.time : drawingTimeAtCoordinate(originalX + event.clientX - edit.startX) ?? original.time, price: original.price + current.price - edit.start.price };
            edit.drawing.updateAnchor(edit.anchorIndex, magnetRef.current ? snapAnchor(next.time, next.price) : next);
          } else {
            const priceDelta = current.price - edit.start.price;
            const dx = event.clientX - edit.startX;
            edit.drawing.setAnchors(edit.originalAnchors.map((anchor,index) => ({
              time: edit.originalPixels[index] !== null ? drawingTimeAtCoordinate(edit.originalPixels[index]! + dx) ?? anchor.time : anchor.time,
              price: anchor.price + priceDelta,
            })));
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const tool = normalizeTool(activeToolRef.current);
        if (tool && !CONTINUOUS_TOOLS.has(tool)) {
          if (gesture?.pointerId === event.pointerId && gesture.moved) aim(event);
          event.preventDefault(); event.stopPropagation(); return;
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
        scheduleOverlayRefresh();
        pointers.delete(event.pointerId);
        if (pinching) {
          if (!pointers.size) { pinching = false; chart.applyOptions(chartInteractionOptions(activeToolRef.current === "cursor", preservePageScroll)); }
          return;
        }
        const gesture = drawingGestureRef.current;
        drawingGestureRef.current = null;
        if (event.type === "pointercancel") {
          lastStudyTap.current=null;
          if (draftRef.current) cancelDraft();
          if (editRef.current) { editRef.current.drawing.setAnchors(editRef.current.originalAnchors); editRef.current = null; }
          chart.applyOptions(chartInteractionOptions(activeToolRef.current === "cursor", preservePageScroll));
          return;
        }
        if (gesture?.pointerId === event.pointerId) {
          if (!gesture.moved && gesture.anchor) commitOrEdit(event, gesture.anchor);
          if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const tap = tapGestureRef.current;
        tapGestureRef.current = null;
        if (event.type === "pointerup" && tap?.pointerId === event.pointerId && !tap.moved && !editRef.current && !draftRef.current) {
          const inPlot=chart.panes().some(p=>{const r=p.getHTMLElement()?.getBoundingClientRect();return r&&event.clientX>=r.left&&event.clientX<=r.left+chart.timeScale().width()&&event.clientY>=r.top&&event.clientY<r.bottom;});
          if(inPlot&&!replayRef.current.selecting&&!riskDragRef.current&&!normalizeTool(activeToolRef.current)){
            const previous=lastStudyTap.current,now=performance.now();
            const doubleTap=previous&&now-previous.time<400&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<24;
            if(doubleTap){
              const line = hitTestLine(event.clientX, event.clientY, event.pointerType === "touch" ? 14 : 10);
              lastStudyTap.current=null;setSelectedStudy(null);
              if (line) setEditingLine(line);
              else restoreHiddenStudies(indicatorsRef.current);
            }else{
              lastStudyTap.current={time:now,x:event.clientX,y:event.clientY};
              const study=studyRenderer.current?.hitTest(event.clientX,event.clientY,event.pointerType==='touch'?12:8);
              if(study)activateStudyRef.current(study,event.clientX,event.clientY);
              else {setSelectedStudy(null);onChartTapRef.current?.();}
            }
          }else lastStudyTap.current=null;
        }
        if (editRef.current) {
          editRef.current.drawing.setState("selected");
          editRef.current = null;
          chart.applyOptions(chartInteractionOptions(true, preservePageScroll));
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
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
        // A replay or coach overlay must never edit drawings on the live chart behind it.
        if (!isReplay && document.querySelector(".bar-replay")) return;
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
      // Stop browser page magnification inside the canvas; the chart still receives the pinch.
      const containChartTouch = (event: TouchEvent) => {
        if (event.touches.length > 1 || normalizeTool(activeToolRef.current) || editRef.current) event.preventDefault();
        const tool = normalizeTool(activeToolRef.current);
        if (event.touches.length === 1 && tool && !CONTINUOUS_TOOLS.has(tool) && !pinching) event.stopPropagation();
      };
      // Native mouse hover must not move the crosshair to the confirmation-click location either.
      const containDrawingMouse = (event: MouseEvent) => {
        const tool = normalizeTool(activeToolRef.current);
        if (tool && !CONTINUOUS_TOOLS.has(tool)) { event.preventDefault(); event.stopPropagation(); }
      };
      host.addEventListener("mousemove", containDrawingMouse, true);
      host.addEventListener("mousedown", containDrawingMouse, true);
      host.addEventListener("mouseup", containDrawingMouse, true);
      host.addEventListener("touchstart", containChartTouch, { passive: false, capture: true });
      host.addEventListener("touchmove", containChartTouch, { passive: false, capture: true });
      const releaseOutsidePointer = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        if (pinching && !pointers.size) { pinching = false; chart.applyOptions(chartInteractionOptions(activeToolRef.current === "cursor", preservePageScroll)); }
      };
      window.addEventListener("pointerup", releaseOutsidePointer);
      window.addEventListener("pointercancel", releaseOutsidePointer);
      const onWheel = () => {
        viewportInteractedRef.current = true;
        scheduleOverlayRefresh();
      };

      host.addEventListener("wheel", onWheel, { passive: true });
      window.addEventListener("keydown", onKeyDown);
      Object.assign(host.dataset, {
        pointerListeners: "active",
      });
      (host as HTMLDivElement & { __papertradeCleanup?: () => void }).__papertradeCleanup = () => {
        host.removeEventListener("pointerdown", onPointerDown, true);
        host.removeEventListener("pointermove", onPointerMove, true);
        host.removeEventListener("pointerup", onPointerUp, true);
        host.removeEventListener("pointercancel", onPointerUp, true);
        host.removeEventListener("touchstart", containChartTouch, true);
        host.removeEventListener("touchmove", containChartTouch, true);
        host.removeEventListener("mousemove", containDrawingMouse, true);
        host.removeEventListener("mousedown", containDrawingMouse, true);
        host.removeEventListener("mouseup", containDrawingMouse, true);
        window.removeEventListener("pointerup", releaseOutsidePointer);
        window.removeEventListener("pointercancel", releaseOutsidePointer);
        confirmDrawingPointRef.current = null;
        host.removeEventListener("wheel", onWheel);
        window.removeEventListener("keydown", onKeyDown);
      };

      syncIndicators(indicatorsRef.current);
      applyVisibleRange();
      refreshOverlays = () => {
        scheduleOverlayRefresh();
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(refreshOverlays);
      resizeChart = () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
          if (!chartApi.current || chartApi.current !== chart) return;
          const width = Math.max(1, Math.floor(host.clientWidth));
          const height = Math.max(1, Math.floor(host.clientHeight));
          chart.resize(width, height, true);
          fitStudyPanes();
          scheduleOverlayRefresh();
        });
      };
      observer = new ResizeObserver(resizeChart);
      observer.observe(host);
      window.addEventListener("resize", resizeChart);
      window.visualViewport?.addEventListener("resize", resizeChart);
      resizeChart();
      window.setTimeout(resizeChart, 180);
      window.setTimeout(scheduleOverlayRefresh, 40);
      window.setTimeout(scheduleOverlayRefresh, 190);
      window.setTimeout(scheduleOverlayRefresh, 360);
      activeToolRef.current = activeTool;
      manager.setActiveTool("pointer-controlled");
      chart.applyOptions(chartInteractionOptions(activeTool === "cursor", preservePageScroll));
      host.classList.toggle("is-drawing", activeTool !== "cursor");
    });

    return () => {
      cancelled = true;
      profileClient?.dispose();
      clearInterval(profileRefresh);
      observer?.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      if (resizeChart) {
        window.removeEventListener("resize", resizeChart);
        window.visualViewport?.removeEventListener("resize", resizeChart);
      }
      if (refreshOverlays) chartApi.current?.timeScale().unsubscribeVisibleLogicalRangeChange(refreshOverlays);
      if (crosshairMove) chartApi.current?.unsubscribeCrosshairMove(crosshairMove);
      if (replayClick) chartApi.current?.unsubscribeClick(replayClick);
      (host as HTMLDivElement & { __papertradeCleanup?: () => void }).__papertradeCleanup?.();
      cancelDraft();
      editRef.current = null;
      manager?.detach();
      chartApi.current?.remove();
      window.cancelAnimationFrame(overlayFrameRef.current);
      overlayFrameRef.current = 0;
      chartApi.current = null;
      riskDragRef.current = null;
      riskDragPriceRangeRef.current = null;
      orderToolEnabledRef.current = false;
      candleSeries.current = null;
      hlcSeries.current = null;
      compareSeries.current.clear();
      compareForcedPercentRef.current = false;
      profileOverlay.current = null;
      studyRenderer.current = null;
      drawingManager.current = null;
      drawingRegistry.current = null;
    };
  }, [chartTheme, instrument.instrumentKey, instrument.symbol, preservePageScroll, timeframe, chartStyle]);

  useEffect(() => {
    const series = candleSeries.current;
    if (!series || !chartGeneration) return;
    if (series.seriesType() === "Line") series.applyOptions({ color: primaryLineColor });
    else if (series.seriesType() === "Area") series.applyOptions({ lineColor: primaryLineColor, topColor: `${primaryLineColor}47`, bottomColor: `${primaryLineColor}0a` });
  }, [primaryLineColor, chartGeneration]);

  useEffect(() => {
    const chart = chartApi.current;
    if (!chart || !chartGeneration) return;
    let cancelled = false;
    const keys = overlayCompared.map((item) => item.instrumentKey);
    void import("lightweight-charts").then(({ LineSeries, LineStyle, PriceScaleMode }) => {
      if (cancelled || chartApi.current !== chart) return;
      const keep = new Set(keys);
      for (const [key, series] of compareSeries.current) {
        if (keep.has(key)) continue;
        try { chart.removeSeries(series); } catch { /* already gone with a rebuilt chart */ }
        compareSeries.current.delete(key);
      }
      const mode = compareMode;
      const comparePane = Math.max(1, ...((studyRenderer.current?.bundles ?? []).map((bundle) => bundle.pane + 1)));
      overlayCompared.forEach((item, index) => {
        const candles = comparisonData[item.instrumentKey] ?? [];
        const targetPane = mode === "pane" ? comparePane + index : 0;
        // Any id other than left/right is an overlay scale: it autoscales in this pane and draws no axis.
        const priceScaleId = mode === "price" ? `compare-${index}` : "right";
        const showAxisTag = mode !== "price";
        let series = compareSeries.current.get(item.instrumentKey);
        if (!series) {
          series = chart.addSeries(LineSeries, {
            color: item.color ?? compareColor(index),
            lineWidth: 2,
            priceScaleId,
            priceLineVisible: false,
            lastValueVisible: showAxisTag,
            baseLineVisible: false,
            title: "",
            crosshairMarkerVisible: true,
          }, targetPane);
          compareSeries.current.set(item.instrumentKey, series);
        } else {
          series.moveToPane(targetPane);
          series.applyOptions({ color: item.color ?? compareColor(index), priceScaleId, title: "", lastValueVisible: showAxisTag, priceLineVisible: false, baseLineVisible: false });
        }
        if (mode === "price") {
          try { chart.priceScale(priceScaleId, targetPane).applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } }); } catch { /* overlay scale is created with the series */ }
        }
        series.setData(styleLineData(candles, timeframe));
      });
      const right = chart.priceScale("right", 0);
      if (keys.length && mode === "percent") {
        right.applyOptions({ mode: PriceScaleMode.Percentage });
        compareForcedPercentRef.current = true;
        candleSeries.current?.applyOptions({ baseLineVisible: true, baseLineStyle: LineStyle.SparseDotted, baseLineColor: chartTheme === "neon" ? "#5c6b86" : "#b7bdc9", baseLineWidth: 1 });
      } else if (compareForcedPercentRef.current) {
        if (right.options().mode === PriceScaleMode.Percentage) right.applyOptions({ mode: PriceScaleMode.Normal });
        compareForcedPercentRef.current = false;
        candleSeries.current?.applyOptions({ baseLineStyle: LineStyle.Solid });
      }
      chart.priceScale("left", 0).applyOptions({ visible: false });
      if (keys.length && mode === "pane") overlayCompared.forEach((_,index)=>chart.priceScale("right", comparePane+index).applyOptions({ mode: PriceScaleMode.Normal, autoScale: true }));
      fitStudyPanes();
      scheduleOverlayRefresh();
    });
    return () => { cancelled = true; };
  }, [chartGeneration, comparisonData, overlayCompared, compareMode, timeframe]);

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
    if (replayCandles === undefined) return;
    dataRef.current = replayCandles;
    paintPriceSeries(replayCandles);
    setLatestCandle(replayCandles.at(-1));
    syncIndicatorData(replayCandles);
    // No quote callbacks, live subscriptions or portfolio execution in replay.
    if (!replaySelecting) { applyVisibleRange(); chartApi.current?.timeScale().scrollToRealTime(); }
    scheduleOverlayRefresh();
  }, [replayCandles, replaySelecting, timeframe]);

  useEffect(() => {
    if (historyRequest) { historyWasActiveRef.current = true; return; }
    if (historyWasActiveRef.current) {
      historyWasActiveRef.current = false;
      viewportInteractedRef.current = false;
      dataRef.current = [];
      lastLiveTickRef.current = null;
      chartApi.current?.timeScale().applyOptions({ minBarSpacing: 2 });
    }
  }, [historyRequest]);

  useEffect(() => {
    if (externalCandles === undefined || historyRequest) return;
    const { precision } = globalPriceFormatRef.current;
    candleSeries.current?.applyOptions({ priceFormat: globalPriceFormatRef.current });
    chartApi.current?.applyOptions({ localization: { priceFormatter: (price: number) => price.toLocaleString("en-US", { maximumFractionDigits: precision }) } });
    const initial = dataRef.current.length === 0;
    const previous = dataRef.current;
    if (previous.length === externalCandles.length && previous.every((c, i) => candlesEqual(c, externalCandles[i]))) return;
    dataRef.current = externalCandles;
    if (trailingCandleUpdate(previous, externalCandles)) {
      // Refresh the former last bar as well when a new candle has opened.
      if (externalCandles.length > previous.length) paintLastBar(externalCandles.slice(0, -1));
      paintLastBar(externalCandles);
    } else paintPriceSeries(externalCandles);
    setLatestCandle(externalCandles.at(-1));
    syncIndicatorData(externalCandles);
    if(initial&&externalCandles.length)applyInitialVisibleRange(externalCandles);
    setFeedMode(externalCandles.length?'live':'loading');
    scheduleOverlayRefresh();
  }, [externalCandles,timeframe,priceIncrement,historyRequest]);

  useEffect(() => {
    dateArrowRef.current = null;
    setDateArrow(null);
    setHistoryMessage("");
    if (!historyRequest || isReplay) return;
    const controller = new AbortController();
    let arrowTimer = 0, readyTimer = 0;
    setHistoryMessage("Loading history…");
    async function load() {
      try {
        const params = new URLSearchParams();
        if (historyRequest?.years) params.set("years", String(historyRequest.years));
        if (historyRequest?.date) params.set("date", historyRequest.date);
        const response = await fetch(`${comparisonRequest(instrument.instrumentKey, timeframe)}&${params}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok || !body.candles?.length) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || "No history is available for this date.");
        if (controller.signal.aborted) return;
        const candles: Candle[] = body.candles;
        const display = () => {
          if (controller.signal.aborted) return;
          const chart = chartApi.current;
          if (!chart || !candleSeries.current) { readyTimer = window.setTimeout(display, 50); return; }
          dataRef.current = candles;
          paintPriceSeries(candles);
          syncIndicatorData(candles);
          setLatestCandle(candles.at(-1));
          setFeedMode("live");
          chart.priceScale("right").applyOptions({ autoScale: true });
          if (historyRequest?.date) {
            const index = nearestCandleIndex(candles, Date.parse(historyRequest.date) / 1000, timeframe, externalFeed ? 0 : IST_OFFSET_SECONDS);
            chart.timeScale().setVisibleLogicalRange({ from: index - 18, to: index + 18 });
            dateArrowRef.current = candles[index];
            setHistoryMessage(`Candle: ${new Date(candles[index].time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", ...(!CALENDAR_TIMEFRAMES.has(timeframe) ? { timeStyle: "short" } : {}) })} · IST`);
            arrowTimer = window.setTimeout(() => { dateArrowRef.current = null; setDateArrow(null); }, 8000);
          } else {
            chart.timeScale().applyOptions({ minBarSpacing: 0.01 });
            chart.timeScale().fitContent();
            setHistoryMessage(`Available history from ${new Date(candles[0].time * 1000).toLocaleDateString("en-IN")}`);
          }
          scheduleOverlayRefresh();
        };
        display();
      } catch (error) {
        if (!controller.signal.aborted) setHistoryMessage(error instanceof Error ? error.message : "History unavailable. Try another date.");
      }
    }
    void load();
    return () => { controller.abort(); window.clearTimeout(arrowTimer); window.clearTimeout(readyTimer); };
  }, [historyRequest, instrument.instrumentKey, timeframe, chartTheme, chartStyle, isReplay]);

  useEffect(() => {
    if (isReplay || externalFeed || historyRequest) return;
    const controller = new AbortController();
    let retryTimer = 0;
    onFeedStatusRef.current({ mode: "loading", message: "Connecting to Upstox…" });

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
        if (controller.signal.aborted) return;
        dataRef.current = reconcileLiveCandles(dataRef.current, payload.candles, lastLiveTickRef.current, timeframe);
        const latest = dataRef.current.at(-1);
        setLatestCandle(latest);
        paintPriceSeries();
        restoreDrawings(projectDrawingsToCandles(storedDrawingsRef.current, payload.candles, timeframe), false);
        syncIndicatorData();
        applyInitialVisibleRange(payload.candles);
        scheduleOverlayRefresh();
        const historicalOnlyTimeframe = timeframe === "1W" || timeframe === "1M" || timeframe === "1Y";
        const hasCurrentMarketData = historicalOnlyTimeframe || payload.segments?.includes("intraday");
        setFeedMode(hasCurrentMarketData ? "live" : "stale");
        onFeedStatusRef.current({
          mode: hasCurrentMarketData ? "live" : "stale",
          message: hasCurrentMarketData ? (payload.segments?.includes("intraday") ? "Upstox historical + intraday candles" : "Upstox historical candles") : "Upstox historical candles · live update paused",
          updatedAt: payload.fetchedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const retryAfterSeconds = Math.max(15, Math.min(120, Number((error as Error & { retryAfterSeconds?: number })?.retryAfterSeconds) || 30));
        const hasVerifiedCandles = dataRef.current.length > 0;
        setFeedMode(hasVerifiedCandles ? "stale" : "error");
        onFeedStatusRef.current({
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
  }, [instrument.instrumentKey, timeframe, isReplay, historyRequest]);

  useEffect(() => {
    if (isReplay || externalFeed || historyRequest || !LIVE_TIMEFRAME_SECONDS[timeframe]) return;
    const controller = new AbortController();
    let stopped = false;
    let reconnectTimer = 0;
    let closeSocket: (() => void) | undefined;
    let retryAttempt = 0;
    let connecting = false;

    const scheduleReconnect = (retryAfterSeconds?: number) => {
      if (stopped || controller.signal.aborted) return;
      window.clearTimeout(reconnectTimer);
      liveStreamConnectedRef.current = false;
      retryAttempt += 1;
      const delaySeconds = retryAfterSeconds
        ? Math.max(5, Math.min(120, retryAfterSeconds))
        : Math.min(60, 3 * 2 ** Math.min(retryAttempt - 1, 4));
      setFeedMode(dataRef.current.length ? "stale" : "loading");
      onFeedStatusRef.current({
        mode: dataRef.current.length ? "stale" : "loading",
        message: `Upstox live stream reconnecting in ${delaySeconds}s`,
      });
      reconnectTimer = window.setTimeout(() => void connect(), delaySeconds * 1_000);
    };

    async function connect() {
      if (stopped || controller.signal.aborted || connecting) return;
      connecting = true;
      try {
        closeSocket?.();
        closeSocket = await openUpstoxLiveFeed({
          instrumentKey: instrument.instrumentKey,
          signal: controller.signal,
          onTick: (tick) => acceptLiveTick(tick, true),
          onDisconnect: () => scheduleReconnect(),
        });
        if (stopped) {
          closeSocket();
          return;
        }
        retryAttempt = 0;
        liveStreamConnectedRef.current = true;
        setFeedMode("live");
        onFeedStatusRef.current({
          mode: "live",
          message: "Upstox live tick stream",
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const retryAfterSeconds = Number((error as Error & { retryAfterSeconds?: number })?.retryAfterSeconds) || undefined;
        scheduleReconnect(retryAfterSeconds);
      } finally {
        connecting = false;
      }
    }

    const resume = () => {
      if (document.hidden) return;
      window.clearTimeout(reconnectTimer);
      void connect();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    void connect();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      liveStreamConnectedRef.current = false;
      controller.abort();
      closeSocket?.();
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(liveIndicatorTimerRef.current);
      liveIndicatorTimerRef.current = 0;
    };
  }, [instrument.instrumentKey, timeframe, isReplay, historyRequest]);

  useEffect(() => {
    // Reconciliation has its own lifetime. Stream status changes must not keep
    // restarting its timer and postponing recovery indefinitely.
    if (isReplay || externalFeed || historyRequest || !LIVE_TIMEFRAME_SECONDS[timeframe]) return;
    let controller: AbortController | null = null;
    async function refreshIntradayCandles() {
      if (controller || !dataRef.current.length || historyRequestRef.current || document.hidden) return;
      const requestController = new AbortController();
      controller = requestController;
      const deadline = window.setTimeout(() => requestController.abort(), 15000);
      try {
        const params = new URLSearchParams({ instrumentKey: instrument.instrumentKey, timeframe, scope: "intraday" });
        const response = await fetch(`/api/upstox/candles?${params}`, { cache: "no-store", signal: requestController.signal });
        const payload = await response.json() as { ok?: boolean; candles?: Candle[]; fetchedAt?: string; error?: { message?: string } };
        if (!response.ok || !payload.ok || !payload.candles?.length) throw new Error(payload.error?.message ?? "Upstox intraday candles are unavailable.");
        if (requestController.signal.aborted || historyRequestRef.current) return;
        dataRef.current = reconcileLiveCandles(dataRef.current, payload.candles, lastLiveTickRef.current, timeframe);
        paintPriceSeries();
        syncIndicatorData();
        scheduleOverlayRefresh();
        const latest = dataRef.current.at(-1);
        if (latest) {
          setLatestCandle(latest);
        }
        setFeedMode("live");
        onFeedStatusRef.current({
          mode: "live",
          message: liveStreamConnectedRef.current ? "Upstox live tick stream" : "Upstox historical + intraday candles",
          updatedAt: payload.fetchedAt,
        });
      } catch (error) {
        if (requestController.signal.aborted) return;
        if (liveStreamConnectedRef.current) return;
        setFeedMode(dataRef.current.length ? "stale" : "error");
        onFeedStatusRef.current({ mode: dataRef.current.length ? "stale" : "error", message: `${error instanceof Error ? error.message : "Upstox candle refresh failed."} Chart paused · no simulation` });
      } finally {
        window.clearTimeout(deadline);
        if (controller === requestController) controller = null;
      }
    }
    const interval = window.setInterval(() => void refreshIntradayCandles(), 20_000);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [instrument.instrumentKey, timeframe, isReplay, historyRequest]);

  useEffect(() => {
    if (isReplay || externalFeed || historyRequest || !LIVE_TIMEFRAME_SECONDS[timeframe]) return;
    let disposed = false;
    let request: AbortController | null = null;
    let retryAt = 0;
    async function recoverQuote() {
      const now = Date.now();
      const weekday = new Date(now + IST_OFFSET_SECONDS * 1000).getUTCDay();
      if (disposed || document.hidden || request || now < retryAt || weekday === 0 || weekday === 6 || liveCandleBucket(now, timeframe) === null) return;
      // A quiet/broken socket cannot prevent the selected symbol from updating.
      // Preserve the exchange trade timestamp: a poll is not a new trade.
      if (lastLiveTickRef.current && now - lastLiveTickRef.current.timestampMs < 10000) return;
      request = new AbortController();
      const current = request;
      const deadline = window.setTimeout(() => current.abort(), 12000);
      try {
        const response = await fetch(`/api/upstox/quotes?keys=${encodeURIComponent(instrument.instrumentKey)}`, { cache: "no-store", signal: current.signal });
        const payload = await response.json() as {
          ok?: boolean;
          quotes?: Record<string, { lastPrice: number; lastTradeAt: string }>;
          error?: { retryAfterSeconds?: number };
        };
        if (disposed || current.signal.aborted) return;
        if (!response.ok || !payload.ok) {
          retryAt = now + Math.max(10, Number(payload.error?.retryAfterSeconds) || 10) * 1000;
          return;
        }
        const quote = payload.quotes?.[instrument.instrumentKey];
        if (quote) acceptLiveTick({ instrumentKey: instrument.instrumentKey, price: quote.lastPrice, timestampMs: Date.parse(quote.lastTradeAt) }, true);
      } catch { retryAt = Date.now() + 10000; }
      finally { window.clearTimeout(deadline); request = null; }
    }
    void recoverQuote();
    const timer = window.setInterval(() => void recoverQuote(), 5000);
    const resume = () => { if (!document.hidden) void recoverQuote(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { disposed = true; request?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [instrument.instrumentKey, timeframe, isReplay, historyRequest]);

  const activeStudies = STUDIES.filter(s => s.id !== "smc" && indicators[s.id]);
  const indicatorLegend = activeStudies.length ? <div className={indicatorHost !== undefined ? "chart-indicator-strip" : "indicator-legend lightweight-indicator-legend"}>
    {activeStudies.map(s => { const c = studySettings[s.id] ?? studyDefaults(s.id); const latest = studySummaries.find(v => v.id === s.id); return <button key={s.id} className="indicator-strip-control" style={{opacity:c.hidden ? .5 : 1}} onClick={e => activateStudyRef.current(s.id,e.clientX,e.clientY)} aria-label={'Indicator actions for '+s.name} title="Tap for indicator actions"><i style={{background:c.colors[0]}}/>{studyTitle(s.id,c)}<b>{latest?.value?.toFixed(2) ?? "—"}</b></button>; })}
  </div> : null;
  return (
    <div className="chart-stack lightweight-stack">
      <div className="price-chart-wrap lightweight-chart-wrap">
        <div ref={chartHost} className="price-chart lightweight-chart" aria-label="Interactive TradingView Lightweight Charts candlestick chart" />
        {dateArrow && <div className="chart-date-arrow" style={{ left: dateArrow.x, top: Math.max(20, dateArrow.y - dateArrow.size - 3), fontSize: dateArrow.size }} aria-label="Selected date candle">↓</div>}
        {historyMessage && <div className="chart-history-message" role="status">{historyMessage}</div>}
        {compareLabels.map((label) => <div key={label.key} className={`compare-axis-label ${label.side}`} style={{ top: label.y, color: label.color }} aria-label={`${label.text} comparison value`}>{label.text}</div>)}
        {volumeOverlay && <><button type="button" className="volume-overlay-heading" style={{top:volumeOverlay.headingTop}} onClick={e=>activateStudyRef.current('volume',e.clientX,e.clientY)}>{studyTitle('volume',studySettings.volume??studyDefaults('volume'))}</button><div className="volume-axis-label" style={{top:volumeOverlay.y,backgroundColor:volumeOverlay.color}}>{new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(volumeOverlay.value)}</div></>}
        {compareMode === "pane" && overlayCompared.map((item,index)=>comparePaneTops[item.instrumentKey] === undefined ? null : <div key={item.instrumentKey} className="compare-pane-heading" style={{top:comparePaneTops[item.instrumentKey]+5}}><span style={{color:item.color??compareColor(index)}}><button type="button" onClick={()=>setEditingLine(item.instrumentKey)} aria-label={`Change ${item.symbol} line color`}><i style={{background:item.color??compareColor(index)}}/>{item.symbol}</button><button type="button" onClick={()=>setComparedSymbols((current)=>current.filter((row)=>row.instrumentKey!==item.instrumentKey))} aria-label={`Remove ${item.symbol} from compare`}><X size={12}/></button></span></div>)}
        {studySummaries.filter(s=>s.pane>0).map(s=>{const c=studySettings[s.id]??studyDefaults(s.id);return <div className="study-pane-heading" key={s.id} style={{top:s.top+3}}><button className="study-pane-title" onClick={e=>activateStudyRef.current(s.id,e.clientX,e.clientY)} title="Tap for indicator actions">{studyTitle(s.id,c)}</button><button aria-label={'Hide '+studyTitle(s.id,c)} onClick={()=>setStudy(s.id,{...c,hidden:true})}><EyeOff size={13}/></button><button aria-label={'Settings for '+studyTitle(s.id,c)} onClick={()=>setEditingStudy(s.id)}><Settings2 size={13}/></button>{onRemoveIndicator&&<button aria-label={'Remove '+studyTitle(s.id,c)} onClick={()=>onRemoveIndicator(s.id)}><X size={13}/></button>}{s.message&&<small title={s.message}>{s.message}</small>}</div>;})}
        {selectedStudy&&<div className="study-quick-actions" role="group" aria-label="Indicator actions">
          <strong>{studyTitle(selectedStudy,studySettings[selectedStudy]??studyDefaults(selectedStudy))}</strong>
          <button aria-label="Indicator settings" onClick={()=>{setEditingStudy(selectedStudy);setSelectedStudy(null);lastStudyTap.current=null;}}><Settings2 size={15}/></button>
          {onRemoveIndicator&&<button onClick={()=>{onRemoveIndicator(selectedStudy);setSelectedStudy(null);lastStudyTap.current=null;}}><Trash2 size={14}/>Remove indicator</button>}
          <button aria-label="Close indicator actions" onClick={()=>{setSelectedStudy(null);lastStudyTap.current=null;}}><X size={15}/></button>
        </div>}
        {editingStudy&&<IndicatorSettings key={editingStudy} id={editingStudy} onClose={()=>setEditingStudy(null)}/>}
        {editingLine && <ChartLineColorSettings key={editingLine} name={editingLine === "primary" ? instrument.symbol : overlayCompared.find((item) => item.instrumentKey === editingLine)?.symbol ?? "Compared symbol"} color={editingLine === "primary" ? primaryLineColor : overlayCompared.find((item) => item.instrumentKey === editingLine)?.color ?? compareColor(Math.max(0, overlayCompared.findIndex((item) => item.instrumentKey === editingLine)))} onChange={(color) => {
          if (editingLine === "primary") setPrimaryLineColor(color);
          else setComparedSymbols((current) => current.map((item) => item.instrumentKey === editingLine ? { ...item, color } : item));
        }} onClose={() => setEditingLine(null)} />}
        {!candlesOnly && !isReplay && priceTasks.length > 0 && <ChartAlertLevels chart={chartApi.current} series={candleSeries.current} tasks={priceTasks} instrumentKey={instrument.instrumentKey} dark={chartTheme === "neon"} />}
        {indicators.smc && <SmcLearner key={`${instrument.instrumentKey}:${timeframe}`} candles={dataRef.current} chart={chartApi.current} series={candleSeries.current} timeframe={timeframe} replay={isReplay} dark={chartTheme === "neon"} refreshRef={smcRefreshRef} triggerHost={indicatorHost} />}
        {!candlesOnly && !isReplay && onPriceAction && activeTool === "cursor" && priceCursor && <button className="chart-price-plus" style={{ top: Math.max(24, priceCursor.y - 17) }} aria-label={`Price actions at ${priceCursor.price}`} onPointerDown={e => e.stopPropagation()} onClick={() => setPriceMenu(priceCursor.price)}><span aria-hidden="true">+</span></button>}
        {priceMenu !== null && <div className="price-action-backdrop" onClick={() => setPriceMenu(null)}><section className="price-action-sheet" role="dialog" aria-modal="true" aria-label="Chart price actions" onClick={e => e.stopPropagation()}>
          <header><b>{instrument.symbol} · ₹{priceMenu.toFixed(2)}</b><button aria-label="Close price menu" onClick={() => setPriceMenu(null)}>×</button></header>
          <button onClick={() => { onPriceAction?.(priceMenu, "alert"); setPriceMenu(null); }}>Add price alert at ₹{priceMenu.toFixed(2)}</button>
          <button onClick={() => { onPriceAction?.(priceMenu, "order"); setPriceMenu(null); }}>Add paper order at ₹{priceMenu.toFixed(2)}</button>
          <button onClick={() => {
            const anchor = lastCrosshairAnchorRef.current;
            if (anchor && drawingRegistry.current && drawingManager.current) {
              const line = drawingRegistry.current.createDrawing("horizontal-line", crypto.randomUUID(), [{ ...anchor, price: priceMenu }], toolStyle("horizontal-line"), toolOptions("horizontal-line"));
              if (line) { drawingManager.current.addDrawing(line); persistDrawings(true); }
            }
            setPriceMenu(null);
          }}>Draw horizontal line at ₹{priceMenu.toFixed(2)}</button>
        </section></div>}
        {!isReplay && feedMode === "loading" && !latestCandle && <div className="chart-candle-loading"><CandleLoader label="Loading chart candles" /></div>}
        {isReplay && replayMarkerX !== null && <>
          {replaySelecting && <div className="replay-future-shade" style={{ left: replayMarkerX }} />}
          <button type="button" className="replay-start-marker replay-drag-marker" style={{ left: replayMarkerX }} aria-label="Drag to a starting candle; Enter to select" onPointerDown={event => {
            if (!replaySelecting) return;
            event.stopPropagation(); event.preventDefault();
            replayDrag.current = { id: event.pointerId, x: event.clientX, moved: false, original: replayStartTime };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={event => {
            const drag = replayDrag.current;
            if (!drag || drag.id !== event.pointerId) return;
            event.stopPropagation();
            if (Math.abs(event.clientX - drag.x) > 4) drag.moved = true;
            if (!drag.moved) return;
            const rect = chartHost.current?.getBoundingClientRect();
            const logical = rect ? chartApi.current?.timeScale().coordinateToLogical(event.clientX - rect.left) : null;
            if (logical == null) return;
            const index = Math.max(0, Math.min(dataRef.current.length - 2, Math.round(logical)));
            const candle = dataRef.current[index];
            if (candle) onReplayPreview?.(candle.time);
          }} onPointerUp={event => {
            const drag = replayDrag.current; replayDrag.current = null;
            if (!drag) return;
            event.stopPropagation();
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (!drag.moved && replayStartTime !== null) onReplaySelect?.(replayStartTime);
          }} onPointerCancel={event => {
            const original = replayDrag.current?.original; replayDrag.current = null;
            if (original != null) onReplayPreview?.(original);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }} onClick={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (replayStartTime !== null) onReplaySelect?.(replayStartTime); }
            if (replaySelecting && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
              event.preventDefault(); const index = dataRef.current.findIndex(candle => candle.time === replayStartTime);
              const candle = dataRef.current[Math.max(0, Math.min(dataRef.current.length - 2, index + (event.key === "ArrowLeft" ? -1 : 1)))];
              if (candle) onReplayPreview?.(candle.time);
            }
          }}><span>↔</span></button>
          {replayPrompt && <div className="replay-start-popover" style={{ left: `clamp(90px, ${replayMarkerX}px, calc(100% - 90px))` }}>
            <small>{replayStartTime !== null ? new Date(replayStartTime * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} IST</small>
            <button type="button" onClick={onReplayPlay}>▶ Replay from here</button>
          </div>}
        </>}
        <div className="chart-symbol-legend lightweight-symbol-legend">
          <b>{instrument.name.toUpperCase()} · {timeframe} · {exchangeLabel}</b>
          {legend && (
            <span className="candle-ohlc" aria-label={`Candle OHLC and change from previous ${timeframe} candle close`}>
              <span className="candle-stat">O <i>{legend.candle.open.toFixed(2)}</i></span>
              <span className="candle-stat">H <i>{legend.candle.high.toFixed(2)}</i></span>
              <span className="candle-stat">L <i>{legend.candle.low.toFixed(2)}</i></span>
              <span className="candle-stat">C <i className={legend.candle.close >= legend.candle.open ? "positive" : "negative"}>{legend.candle.close.toFixed(2)}</i></span>
              <i className={`candle-change ${legend.changePercent === null || legend.changePercent === 0 ? "neutral" : legend.changePercent > 0 ? "positive" : "negative"}`}
                aria-label={legend.changePercent === null ? "Previous candle close unavailable" : `${formatCandleChange(legend.changePercent)} from previous ${timeframe} candle close`}>
                {formatCandleChange(legend.changePercent)}
              </i>
            </span>
          )}
          {overlayCompared.length > 0 && compareMode !== "pane" && (
            <div className={`compare-legend-row${compareMode === "percent" ? " is-percent" : ""}`} aria-label="Compared symbols">
              {compareMode === "percent" && (
                <span className="compare-legend-chip is-percent" style={{ color: primaryLineColor }}>
                  <button type="button" className="compare-color-trigger" style={{ background: primaryLineColor }} aria-label={`Change ${instrument.symbol} line color`} onClick={() => setEditingLine("primary")} />
                  <b>{instrument.name}</b>
                </span>
              )}
              {overlayCompared.map((item, index) => {
                const quote = compareMode === "price" ? compareQuote(comparisonData[item.instrumentKey] ?? []) : null;
                const tone = !quote || quote.percent === 0 ? "neutral" : quote.percent > 0 ? "positive" : "negative";
                return (
                  <span key={item.instrumentKey} className={`compare-legend-chip${compareMode === "percent" ? " is-percent" : " is-quote"}`} style={{ color: item.color ?? compareColor(index) }}>
                    <button type="button" className="compare-color-trigger" style={{ background: item.color ?? compareColor(index) }} aria-label={`Change ${item.symbol} line color`} onClick={() => setEditingLine(item.instrumentKey)} />
                    <b>{compareMode === "percent" ? item.name : item.symbol}</b>
                    {compareMode === "price" && (quote ? <><strong>{formatComparePrice(quote.price)}</strong><em className={tone}>{formatCompareDelta(quote.delta)} ({formatCandleChange(quote.percent)})</em></> : <em>—</em>)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {indicatorHost !== undefined ? indicatorHost && createPortal(indicatorLegend, indicatorHost) : indicatorLegend}
        <div ref={drawingCrosshairRef} className="drawing-crosshair" hidden aria-hidden="true"><i /><b /><span /></div>
        {!hiddenDrawings && selectedDrawingId && !placementHint && <div className="chart-selected-drawing" role="toolbar" aria-label="Selected drawing actions">
          <button type="button" aria-label="Delete selected drawing" title="Delete drawing" onClick={() => { const selected = drawingManager.current?.getSelectedDrawing(); if (selected && !selected.options.locked) { drawingManager.current?.removeDrawing(selected.id); persistDrawings(true); } }}><Trash2 size={19}/></button>
          <button type="button" aria-label="Finish editing drawing" title="Done" onClick={() => drawingManager.current?.deselectAll()}><Check size={21}/></button>
        </div>}
        {!candlesOnly && onOrderSide && (
          <div className="chart-quick-order-buttons" aria-label="Paper trade controls">
            <button className={`chart-sell-button ${orderTool?.enabled && orderTool.side === "SELL" ? "active" : ""}`} onClick={() => onOrderSide("SELL")}><span>Sell</span><b>{latestCandle?.close.toFixed(2) ?? "—"}</b></button>
            <button className={`chart-buy-button ${orderTool?.enabled && orderTool.side === "BUY" ? "active" : ""}`} onClick={() => onOrderSide("BUY")}><span>Buy</span><b>{latestCandle?.close.toFixed(2) ?? "—"}</b></button>
          </div>
        )}
        {!candlesOnly && tradeMarkerCoordinates.map((marker) => (
          <div
            key={marker.id}
            className={`chart-trade-marker stacked-marker ${marker.side.toLowerCase()} ${marker.role.toLowerCase()} ${marker.direction}`}
            style={{ left: marker.x, top: marker.y }}
            aria-label={`${marker.role === "ENTRY" ? "Entry" : "Exit"} ${marker.side}`}
          >
            <svg width={markerSize} height={markerSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={marker.direction === "up" ? "M12 21V3M5 10L12 3L19 10" : "M12 3V21M5 14L12 21L19 14"} />
            </svg>
          </div>
        ))}
        {!candlesOnly && orderTool?.enabled && riskCoordinates && (
          <div className={`chart-risk-tool chart-bracket-tool ${orderTool.side.toLowerCase()}`} aria-label="Position target and stop-loss controls">
            {riskCoordinates.entry !== null && <div className="risk-line risk-entry-line" style={{ top: riskCoordinates.entry }}>
              <button type="button" className="bracket-entry-chip" aria-expanded={branchesOpen} aria-label="Set take profit and stop loss for this position" onClick={() => setExpandedEntry(branchesOpen ? "" : entryKey)}>
                <span>{orderTool.quantity}</span><span aria-hidden="true">|</span><span>{compactRiskPnl(orderTool.livePnl ?? orderToolPnl(orderTool, latestCandle?.close ?? orderTool.entryPrice))}</span>
              </button>
            </div>}
            {(["target", "stopLoss"] as const).map((level) => {
              const price = level === "target" ? orderTool.targetPrice : orderTool.stopLossPrice;
              const coordinate = draftRisk?.key === entryKey && draftRisk.level === level
                ? candleSeries.current?.priceToCoordinate(price) ?? riskCoordinates[level]
                : riskCoordinates[level];
              const unset = !(price > 0);
              if (unset && !branchesOpen) return null;
              const direction = (orderTool.side === "BUY" ? -1 : 1) * (level === "target" ? 1 : -1);
              const top = coordinate ?? (unset && riskCoordinates.entry !== null ? Math.max(64, Math.min((chartHost.current?.clientHeight ?? 400) - 52, riskCoordinates.entry + direction * 48)) : null);
              if (top === null) return null;
              return <div key={level} className={`risk-line ${level === "target" ? "risk-target-line" : "risk-stop-line"} ${unset ? "bracket-unset" : ""}`} style={{ top }}
                onPointerDown={(event) => beginRiskDrag(level, event)}
                onPointerMove={(event) => moveRiskDrag(level, event)}
                onPointerUp={(event) => endRiskDrag(level, event)}
                onPointerCancel={(event) => endRiskDrag(level, event)}>
                <div className="bracket-level-chip" role="slider" tabIndex={0} aria-label={`Drag ${level === "target" ? "take profit" : "stop loss"} price`} aria-valuenow={unset ? undefined : price} aria-valuetext={unset ? "Not set. Drag to choose a price." : `${orderTool.currency ?? "INR"} ${Number(price.toFixed(10))}`}
                  onKeyDown={(event) => {
                    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                    event.preventDefault();
                    const tool = suppliedOrderTool;
                    if (!tool) return;
                    const step = tool.tickSize ?? Math.max(.05, Math.round(tool.entryPrice * .001 * 100) / 100);
                    const raw = (price || tool.referencePrice || tool.entryPrice) + (event.key === "ArrowUp" ? step : -step);
                    const next = tool.tickSize ? Number((Math.round(raw / step) * step).toFixed(10)) : Math.round(raw * 100) / 100;
                    if (next > 0) onOrderToolChange?.(level, next, true);
                  }}>
                  <span>{orderTool.currency === "USD" ? level === "target" ? "TP" : "SL" : orderTool.quantity}</span><span aria-hidden="true">|</span><span>{unset ? "—" : compactRiskPnl(orderToolPnl(orderTool, price))}</span>
                </div>
              </div>;
            })}
            {branchesOpen && <div className="bracket-help"><span>Drag TP / SL to place protection</span></div>}
            {onOrderToolExit && <button type="button" className="bracket-close-trade" aria-label="Close trade" title="Close trade" onClick={onOrderToolExit}><span aria-hidden="true">×</span></button>}
          </div>
        )}
        {!candlesOnly && typeof orderTool?.livePnl === "number" && Number.isFinite(orderTool.livePnl) && <div className={`chart-live-pnl ${orderTool.livePnl >= 0 ? "positive" : "negative"}`}>
          <span>Live P&amp;L</span><b>{formatRiskPnl(orderTool.livePnl)}</b>
        </div>}
      </div>
    </div>
  );
}
