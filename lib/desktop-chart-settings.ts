import type { DeepPartial, ChartOptions, CandlestickSeriesOptions, BarSeriesOptions, LineSeriesOptions, AreaSeriesOptions } from "lightweight-charts";

export type ChartScaleMode = "normal" | "log" | "percent" | "indexed";
export type ChartStrokeStyle = 0 | 1 | 2 | 3;
export type DesktopChartSettings = {
  upColor: string | null;
  downColor: string | null;
  wickUpColor: string | null;
  wickDownColor: string | null;
  borderUpColor: string | null;
  borderDownColor: string | null;
  lineColor: string | null;
  wickVisible: boolean;
  borderVisible: boolean;
  priceLineVisible: boolean;
  lastValueVisible: boolean;
  lineWidth: 1 | 2 | 3 | 4;
  scaleMode: ChartScaleMode;
  autoScale: boolean;
  invertScale: boolean;
  scaleMarginTop: number;
  scaleMarginBottom: number;
  timeVisible: boolean;
  secondsVisible: boolean;
  rightOffset: number;
  backgroundColor: string | null;
  textColor: string | null;
  gridColor: string | null;
  verticalGrid: boolean;
  horizontalGrid: boolean;
  gridStyle: ChartStrokeStyle;
  crosshairVisible: boolean;
  crosshairColor: string | null;
  crosshairStyle: ChartStrokeStyle;
};

export const DEFAULT_DESKTOP_CHART_SETTINGS: Readonly<DesktopChartSettings> = Object.freeze({
  upColor: null, downColor: null, wickUpColor: null, wickDownColor: null,
  borderUpColor: null, borderDownColor: null, lineColor: null,
  wickVisible: true, borderVisible: true, priceLineVisible: false, lastValueVisible: true, lineWidth: 2,
  scaleMode: "normal", autoScale: true, invertScale: false, scaleMarginTop: 10, scaleMarginBottom: 10,
  timeVisible: true, secondsVisible: false, rightOffset: 8,
  backgroundColor: null, textColor: null, gridColor: null, verticalGrid: true, horizontalGrid: true, gridStyle: 2,
  crosshairVisible: true, crosshairColor: null, crosshairStyle: 2,
});

export const DESKTOP_CHART_SETTINGS_KEY = "papertrade-desktop-chart-settings-v1";
export const DESKTOP_CHART_TEMPLATES_KEY = "papertrade-desktop-chart-templates-v1";
export const MAX_CHART_TEMPLATES = 12;
export type ChartAppearanceTemplate = { id: string; name: string; savedAt: number; settings: DesktopChartSettings };

const COLOR_KEYS = ["upColor", "downColor", "wickUpColor", "wickDownColor", "borderUpColor", "borderDownColor", "lineColor", "backgroundColor", "textColor", "gridColor", "crosshairColor"] as const;
const BOOLEAN_KEYS = ["wickVisible", "borderVisible", "priceLineVisible", "lastValueVisible", "autoScale", "invertScale", "timeVisible", "secondsVisible", "verticalGrid", "horizontalGrid", "crosshairVisible"] as const;
function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
export function normalizeDesktopChartSettings(value: unknown): DesktopChartSettings {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: DesktopChartSettings = { ...DEFAULT_DESKTOP_CHART_SETTINGS };
  for (const key of COLOR_KEYS) result[key] = typeof input[key] === "string" && /^#[0-9a-f]{6}$/i.test(input[key]) ? input[key].toLowerCase() : null;
  for (const key of BOOLEAN_KEYS) if (typeof input[key] === "boolean") result[key] = input[key];
  if (["normal", "log", "percent", "indexed"].includes(input.scaleMode as string)) result.scaleMode = input.scaleMode as ChartScaleMode;
  result.lineWidth = boundedNumber(input.lineWidth, 2, 1, 4) as DesktopChartSettings["lineWidth"];
  result.gridStyle = boundedNumber(input.gridStyle, 2, 0, 3) as ChartStrokeStyle;
  result.crosshairStyle = boundedNumber(input.crosshairStyle, 2, 0, 3) as ChartStrokeStyle;
  result.scaleMarginTop = boundedNumber(input.scaleMarginTop, 10, 0, 40);
  result.scaleMarginBottom = boundedNumber(input.scaleMarginBottom, 10, 0, 40);
  result.rightOffset = boundedNumber(input.rightOffset, 8, 0, 100);
  return result;
}

export function normalizeChartTemplates(value: unknown): ChartAppearanceTemplate[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !/^[\w-]{1,80}$/.test(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim()) return [];
    ids.add(entry.id);
    return [{ id: entry.id, name: entry.name.trim().slice(0, 48), savedAt: typeof entry.savedAt === "number" && Number.isFinite(entry.savedAt) ? Math.max(0, entry.savedAt) : 0, settings: normalizeDesktopChartSettings(entry.settings) }];
  }).slice(0, MAX_CHART_TEMPLATES);
}

export type DesktopSettingsPalette = { background: string; text: string; grid: string; border: string; crosshair: string; crosshairLabel: string; up: string; down: string; accent: string };
export function resolveDesktopChartColors(settings: DesktopChartSettings, palette: DesktopSettingsPalette, fallbackLineColor?: string) {
  const up = settings.upColor ?? palette.up, down = settings.downColor ?? palette.down;
  return {
    up, down, wickUp: settings.wickUpColor ?? up, wickDown: settings.wickDownColor ?? down,
    borderUp: settings.borderUpColor ?? up, borderDown: settings.borderDownColor ?? down,
    line: settings.lineColor ?? fallbackLineColor ?? palette.accent,
    background: settings.backgroundColor ?? palette.background, text: settings.textColor ?? palette.text,
    grid: settings.gridColor ?? palette.grid, crosshair: settings.crosshairColor ?? palette.crosshair,
  };
}

/** Apply only inside the desktop-web boundary. Calendar intervals never show intraday times. */
export function desktopChartOptions(settings: DesktopChartSettings, palette: DesktopSettingsPalette, calendarTimeframe = false): DeepPartial<ChartOptions> {
  const colors = resolveDesktopChartColors(settings, palette);
  return {
    layout: { background: { type: "solid", color: colors.background } as ChartOptions["layout"]["background"], textColor: colors.text },
    grid: { vertLines: { visible: settings.verticalGrid, color: colors.grid, style: settings.gridStyle }, horzLines: { visible: settings.horizontalGrid, color: colors.grid, style: settings.gridStyle } },
    rightPriceScale: {
      mode: { normal: 0, log: 1, percent: 2, indexed: 3 }[settings.scaleMode],
      autoScale: settings.autoScale, invertScale: settings.invertScale,
      scaleMargins: { top: settings.scaleMarginTop / 100, bottom: settings.scaleMarginBottom / 100 },
    },
    timeScale: { timeVisible: !calendarTimeframe && settings.timeVisible, secondsVisible: !calendarTimeframe && settings.timeVisible && settings.secondsVisible, rightOffset: settings.rightOffset },
    crosshair: {
      vertLine: { visible: settings.crosshairVisible, color: colors.crosshair, style: settings.crosshairStyle, labelBackgroundColor: palette.crosshairLabel },
      horzLine: { visible: settings.crosshairVisible, color: colors.crosshair, style: settings.crosshairStyle, labelBackgroundColor: palette.crosshairLabel },
    },
  };
}

/** Series-specific fields avoid applying candle properties to line/area series. */
export function desktopSeriesOptions(settings: DesktopChartSettings, palette: DesktopSettingsPalette, kind: "candlestick" | "bar" | "line" | "area" | "baseline" | "histogram", fallbackLineColor?: string) {
  const color = resolveDesktopChartColors(settings, palette, fallbackLineColor);
  const shared = { priceLineVisible: settings.priceLineVisible, lastValueVisible: settings.lastValueVisible, priceLineColor: color.line };
  if (kind === "candlestick") return { ...shared, upColor: color.up, downColor: color.down, borderUpColor: color.borderUp, borderDownColor: color.borderDown, wickUpColor: color.wickUp, wickDownColor: color.wickDown, borderVisible: settings.borderVisible, wickVisible: settings.wickVisible } satisfies DeepPartial<CandlestickSeriesOptions>;
  if (kind === "bar") return { ...shared, upColor: color.up, downColor: color.down } satisfies DeepPartial<BarSeriesOptions>;
  if (kind === "line") return { ...shared, color: color.line, lineWidth: settings.lineWidth } satisfies DeepPartial<LineSeriesOptions>;
  if (kind === "area") return { ...shared, lineColor: color.line, topColor: `${color.line}47`, bottomColor: `${color.line}0a`, lineWidth: settings.lineWidth } satisfies DeepPartial<AreaSeriesOptions>;
  if (kind === "baseline") return { ...shared, topLineColor: color.up, bottomLineColor: color.down, topFillColor1: `${color.up}47`, topFillColor2: `${color.up}0a`, bottomFillColor1: `${color.down}0a`, bottomFillColor2: `${color.down}47`, lineWidth: settings.lineWidth };
  return shared;
}
