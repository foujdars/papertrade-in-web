import { CHART_INTERVAL_SECONDS } from "./chart-history.ts";

export type StudyPoint = { time: number; value: number };
export type DrawingPresentation = { levels?:number[]; reverseDirection?:boolean; extendLines?:boolean; fibLabels?:'ratio'|'percent'|'none'; fibShowPrices?:boolean; regressionDeviation?:number; regressionShowStats?:boolean; visibilityMode?: 'all' | 'selected'; opacity?: number; textEnabled?: boolean; textColor?: string; textOpacity?: number; fontSize?: number; bold?: boolean; italic?: boolean; timeframes?: string[]; text?: string; textVertical?: 'above' | 'middle' | 'below'; textHorizontal?: 'left' | 'center' | 'right'; extendLeft?: boolean; extendRight?: boolean; color?: string; lineWidth?: number; lineDash?: number[]; direction?: 'left' | 'right'; userHidden?: boolean; showPriceLabel?: boolean; anchorTimeOffset?: number };
/** Preserve library options while validating persisted presentation settings. */
export function sanitizeDrawingPresentation<T extends DrawingPresentation>(value: T): T {
  const result = { ...value };
  const numeric = { opacity: [0,100], textOpacity: [0,100], fontSize: [10,32], lineWidth: [1,8] } as const;
  for (const key of Object.keys(numeric) as Array<keyof typeof numeric>) {
    const number = value[key];
    if (number === undefined) continue;
    if (typeof number !== 'number' || !Number.isFinite(number)) { delete result[key]; continue; }
    result[key] = Math.round(Math.max(numeric[key][0], Math.min(numeric[key][1], number)));
  }
  for (const key of ['textEnabled','bold','italic','extendLeft','extendRight','userHidden','showPriceLabel'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') delete result[key];
  }
  for (const key of ['color','textColor'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value[key]!))) delete result[key];
  }
  if (value.text !== undefined) { if (typeof value.text === 'string') result.text = value.text.slice(0,1000); else delete result.text; }
  if (value.timeframes !== undefined) result.timeframes = Array.isArray(value.timeframes) ? [...new Set(value.timeframes.filter((frame): frame is string => typeof frame === 'string' && Object.hasOwn(CHART_INTERVAL_SECONDS, frame)))] : [];
  if (value.lineDash !== undefined) { if (Array.isArray(value.lineDash) && value.lineDash.length <= 8 && value.lineDash.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)) result.lineDash = [...value.lineDash]; else delete result.lineDash; }
  if (value.visibilityMode !== undefined && !['all','selected'].includes(value.visibilityMode)) delete result.visibilityMode;
  if (value.direction !== undefined && !['left','right'].includes(value.direction)) delete result.direction;
  if (value.textHorizontal !== undefined && !['left','center','right'].includes(value.textHorizontal)) delete result.textHorizontal;
  if (value.textVertical !== undefined && !['above','middle','below'].includes(value.textVertical)) delete result.textVertical;
  if (value.anchorTimeOffset !== undefined && !Number.isFinite(value.anchorTimeOffset)) delete result.anchorTimeOffset;
  return result;
}
export function drawingVisibleOnTimeframe(options: DrawingPresentation = {}, timeframe?: string) {
  return !options.userHidden && (!timeframe || (options.visibilityMode === 'all' ? true : options.visibilityMode === 'selected' ? !!options.timeframes?.includes(timeframe) : !options.timeframes?.length || options.timeframes.includes(timeframe)));
}
export type StudyDrawing = {
  id: string;
  studyId: string;
  tool: string;
  a: StudyPoint;
  b: StudyPoint;
  presentation?: DrawingPresentation;
  locked?: boolean;
  hidden?: boolean;
};

export const STUDY_LINE_TOOLS = new Set(["trend-line", "ray", "extended-line", "horizontal-line", "horizontal-ray", "vertical-line", "arrow", "rectangle"]);

export function formatStudyValue(value: number) {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) return "";
  if (abs >= 100 || abs >= 10) return value.toFixed(2);
  if (abs >= 1) return value.toFixed(3);
  return value.toFixed(4);
}

export function locateStudyPane(chart: { panes: () => Array<{ getHeight: () => number }> }, bundles: Array<{ id: string; pane: number; series: Array<{ coordinateToPrice: (y: number) => number | null }> }>, y: number) {
  let top = 0;
  const panes = chart.panes();
  let paneIndex = -1;
  for (let index = 0; index < panes.length; index += 1) {
    const height = panes[index].getHeight();
    if (y >= top && y < top + height) { paneIndex = index; break; }
    top += height;
  }
  if (paneIndex <= 0) return null;
  const bundle = bundles.find((item) => item.pane === paneIndex && item.series[0]);
  if (!bundle) return null;
  const value = bundle.series[0].coordinateToPrice(y - top);
  if (value == null || !Number.isFinite(value)) return null;
  return { studyId: bundle.id, value, y };
}

export function studyLinePoints(tool: string, x1: number, y1: number, x2: number, y2: number, width: number, paneTop: number, paneHeight: number, options: DrawingPresentation = {}) {
  if (tool === "horizontal-line") return { x1: 0, y1, x2: width, y2: y1 };
  if (tool === "horizontal-ray") return { x1, y1, x2: options.direction === "left" ? 0 : width, y2: y1 };
  if (tool === "vertical-line") return { x1, y1: paneTop, x2: x1, y2: paneTop + paneHeight };
  if (tool === "rectangle") return null;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const yAt = (x: number) => Math.abs(dx) < 0.001 ? y1 : y1 + dy * ((x - x1) / dx);
  if (tool === "extended-line") return { x1: 0, y1: yAt(0), x2: width, y2: yAt(width) };
  if (tool === "trend-line" && (options.extendLeft || options.extendRight)) {
    const left = Math.min(x1, x2), right = Math.max(x1, x2);
    const start = options.extendLeft ? 0 : left, end = options.extendRight ? width : right;
    return { x1: start, y1: yAt(start), x2: end, y2: yAt(end) };
  }
  if (tool === "ray") {
    const endX = dx >= 0 ? width : 0;
    return { x1, y1, x2: endX, y2: yAt(endX) };
  }
  return { x1, y1, x2, y2 };
}

export function drawingTextPosition(a: {x:number;y:number}, b: {x:number;y:number}, options: DrawingPresentation = {}) {
  const align = options.textHorizontal ?? 'center';
  const x = align === 'left' ? Math.min(a.x,b.x) + 4 : align === 'right' ? Math.max(a.x,b.x) - 4 : (a.x+b.x)/2;
  const vertical = options.textVertical ?? 'above';
  const y = vertical === 'above' ? Math.min(a.y,b.y)-7 : vertical === 'below' ? Math.max(a.y,b.y)+15 : (a.y+b.y)/2+4;
  return { x, y, align, anchor: align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle' } as const;
}

/** Align labels to the visible part of a horizontal line, including older ray anchors. */
export function drawingLineTextPosition(tool: string, a: {x:number;y:number}, b: {x:number;y:number}, width: number, options: DrawingPresentation = {}) {
  if (tool === 'horizontal-line') return drawingTextPosition({x:0,y:a.y}, {x:width,y:a.y}, options);
  if (tool === 'horizontal-ray') return drawingTextPosition({x:Math.max(0,Math.min(width,a.x)),y:a.y}, {x:options.direction === 'left' ? 0 : width,y:a.y}, options);
  return drawingTextPosition(a,b,options);
}

/** Ray labels remain while the ray intersects the plot; vertical labels follow their candle. */
export function drawingTextVisible(tool: string, a: { x: number; y: number }, label: { x: number; y: number }, width: number, height: number, options: DrawingPresentation = {}) {
  if (tool === "vertical-line" && (a.x < 0 || a.x > width)) return false;
  if (tool === "horizontal-ray" && (options.direction === "left" ? a.x < 0 : a.x > width)) return false;
  return label.x >= 0 && label.x <= width && label.y >= 0 && label.y <= height;
}
