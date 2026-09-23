import type { Candle } from "./market";

export const CHART_STYLE_GROUPS = [
  { id: "ohlc", styles: ["bars", "candles", "hollow-candles", "volume-candles"] },
  { id: "line", styles: ["line", "line-markers", "step-line"] },
  { id: "area", styles: ["area", "hlc-area", "baseline"] },
  { id: "columns", styles: ["columns", "high-low"] },
  { id: "heikin", styles: ["heikin-ashi"] },
] as const;

export const CHART_STYLES = [
  { id: "bars", label: "Bars", group: "ohlc" },
  { id: "candles", label: "Candles", group: "ohlc" },
  { id: "hollow-candles", label: "Hollow candles", group: "ohlc" },
  { id: "volume-candles", label: "Volume candles", group: "ohlc" },
  { id: "line", label: "Line", group: "line" },
  { id: "line-markers", label: "Line with markers", group: "line" },
  { id: "step-line", label: "Step line", group: "line" },
  { id: "area", label: "Area", group: "area" },
  { id: "hlc-area", label: "HLC area", group: "area" },
  { id: "baseline", label: "Baseline", group: "area" },
  { id: "columns", label: "Columns", group: "columns" },
  { id: "high-low", label: "High-low", group: "columns" },
  { id: "volume-footprint", label: "Volume footprint", group: "profile" },
  { id: "tpo", label: "Time price opportunity", group: "profile" },
  { id: "session-volume-profile", label: "Session volume profile", group: "profile" },
  { id: "heikin-ashi", label: "Heikin Ashi", group: "heikin" },
] as const;

export type ChartStyleId = (typeof CHART_STYLES)[number]["id"];
export const DEFAULT_CHART_STYLE: ChartStyleId = "candles";
const STYLE_IDS = new Set<string>(CHART_STYLES.map((style) => style.id));

export function isChartStyle(value: unknown): value is ChartStyleId {
  return typeof value === "string" && STYLE_IDS.has(value) && !["volume-footprint", "tpo", "session-volume-profile"].includes(value);
}

export function chartStyleLabel(id: ChartStyleId) {
  return CHART_STYLES.find((style) => style.id === id)?.label ?? "Candles";
}

export type StyleSeriesKind = "candlestick" | "bar" | "line" | "area" | "baseline" | "histogram";

export function styleSeriesKind(style: ChartStyleId): StyleSeriesKind {
  if (style === "bars" || style === "high-low") return "bar";
  if (style === "line" || style === "line-markers" || style === "step-line") return "line";
  if (style === "area" || style === "hlc-area") return "area";
  if (style === "baseline") return "baseline";
  if (style === "columns") return "histogram";
  return "candlestick";
}

export function isProfileStyle(style: ChartStyleId) {
  return style === "volume-footprint" || style === "tpo" || style === "session-volume-profile";
}

export function styleUsesOhlc(style: ChartStyleId) {
  const kind = styleSeriesKind(style);
  return kind === "candlestick" || kind === "bar";
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const result: Candle[] = [];
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
    const previous = result[index - 1];
    const haOpen = previous
      ? (previous.open + previous.close) / 2
      : (candle.open + candle.close) / 2;
    result.push({
      time: candle.time,
      open: haOpen,
      close: haClose,
      high: Math.max(candle.high, haOpen, haClose),
      low: Math.min(candle.low, haOpen, haClose),
      volume: candle.volume,
    });
  }
  return result;
}

export function prepareStyleCandles(candles: Candle[], style: ChartStyleId) {
  return style === "heikin-ashi" ? heikinAshi(candles) : candles;
}

function meanVolume(candles: Candle[]) {
  const volumes = candles.map((candle) => candle.volume).filter((volume) => Number.isFinite(volume) && volume > 0);
  if (!volumes.length) return 1;
  return volumes.reduce((sum, volume) => sum + volume, 0) / volumes.length;
}

function mixHex(hex: string, strength: number) {
  const value = Math.max(0.28, Math.min(1, strength));
  const raw = hex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const blend = (channel: number) => Math.round(channel * value + 255 * (1 - value));
  return `#${[blend(r), blend(g), blend(b)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function volumeCandleColor(candle: Candle, candles: Candle[]) {
  const up = candle.close >= candle.open;
  const average = meanVolume(candles);
  const strength = average > 0 ? candle.volume / (average * 1.8) : 1;
  return mixHex(up ? "#00a67e" : "#f04458", strength);
}

export type StyleSeriesPoint = {
  time: unknown;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
  color?: string;
  borderColor?: string;
  wickColor?: string;
};

export function toStyleSeriesPoint(
  candle: Candle,
  source: Candle[],
  index: number,
  style: ChartStyleId,
  time: unknown,
): StyleSeriesPoint {
  const kind = styleSeriesKind(style);
  if (kind === "candlestick" || kind === "bar") {
    const highLow = style === "high-low";
    const point: StyleSeriesPoint = {
      time,
      open: highLow ? candle.low : candle.open,
      high: candle.high,
      low: candle.low,
      close: highLow ? candle.high : candle.close,
    };
    if (style === "volume-candles") {
      const color = volumeCandleColor(candle, source);
      point.color = color;
      point.borderColor = color;
      point.wickColor = color;
    } else if (highLow) {
      point.color = candle.close >= candle.open ? "#00a67e" : "#f04458";
    }
    return point;
  }
  if (kind === "histogram") {
    const previous = index > 0 ? source[index - 1] : candle;
    return {
      time,
      value: candle.close,
      color: candle.close >= previous.close ? "#00a67e" : "#f04458",
    };
  }
  return { time, value: candle.close };
}

export function styleBaselinePrice(candles: Candle[]) {
  const first = candles.find((candle) => Number.isFinite(candle.close) && candle.close > 0);
  return first?.close ?? 0;
}
