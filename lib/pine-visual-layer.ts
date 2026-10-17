import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, Logical, SeriesAttachedParameter, Time } from 'lightweight-charts';
import type { Candle } from './market';

/** Serializable host contract. Coordinates are candle indices unless xloc is bar_time (seconds or milliseconds). */
export type PineVisualPoint = { x: number; y: number; xloc?: string };
export type PineVisualLine = { id?: string; x1: number; y1: number; x2: number; y2: number; xloc?: string; extend?: string; color?: string; width?: number; style?: string };
export type PineVisualBox = { left: number; top: number; right: number; bottom: number; xloc?: string; extend?: string; bgcolor?: string; border_color?: string; border_width?: number; border_style?: string; text?: string; text_color?: string; text_size?: string | number };
export type PineVisualLabel = PineVisualPoint & { text?: string; color?: string; textcolor?: string; size?: string | number; style?: string; yloc?: string };
export type PineVisualShape = PineVisualPoint & { style?: string; location?: string; color?: string; text?: string; textcolor?: string; size?: string | number; char?: string };
export type PineVisualFill = { a: (number | null)[]; b: (number | null)[]; colors: string[]; offset?: number };
export type PineVisualCell = { text?: string; bgcolor?: string; text_color?: string; text_size?: string | number; text_halign?: string; width?: number; height?: number; _merged?: boolean; _merge_parent?: [number, number] | null };
export type PineVisualTable = { position?: string; columns: number; rows: number; bgcolor?: string; border_color?: string; border_width?: number; frame_color?: string; frame_width?: number; cells: (PineVisualCell | null)[][]; merges?: { startCol: number; startRow: number; endCol: number; endRow: number }[] };
export type PineVisualPolyline = { points: PineVisualPoint[]; curved?: boolean; closed?: boolean; color?: string; fill?: string; width?: number; style?: string };
export type PineVisualOHLC = { x: number; open: number; high: number; low: number; close: number; candle: boolean; color: string; wickcolor?: string; bordercolor?: string };
export type PineVisualData = { fills?: PineVisualFill[]; backgrounds?: { x: number; color: string }[]; lines?: PineVisualLine[]; boxes?: PineVisualBox[]; labels?: PineVisualLabel[]; shapes?: PineVisualShape[]; tables?: PineVisualTable[]; linefills?: { a: PineVisualLine; b: PineVisualLine; color: string }[]; polylines?: PineVisualPolyline[]; ohlc?: PineVisualOHLC[] };
export const PINE_VISUAL_LIMITS = { objects: 1000, fills: 64, tables: 9, tableCells: 400, text: 512 } as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const color = (v: unknown, fallback = 'transparent') => typeof v === 'string' && /^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|[a-z]{1,24})$/i.test(v) ? v : fallback;
const text = (v: unknown) => String(v ?? '').slice(0, PINE_VISUAL_LIMITS.text);
const size = (v?: string | number) => typeof v === 'number' ? clamp(v, 8, 48) : ({ tiny: 9, small: 11, normal: 13, large: 17, huge: 23 }[String(v).replace('size.', '')] ?? 12);
const dash = (style?: string) => style?.includes('dotted') ? [2, 3] : style?.includes('dashed') ? [6, 4] : [];
export type PineRawVisual = { key: string; title?: string; options: Record<string, unknown>; data: { time: number; value: unknown; options?: Record<string, unknown> }[] };
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const xloc = (v: unknown) => v === 'bt' || String(v).includes('bar_time') ? 'bar_time' : 'bar_index';
const extend = (v: unknown) => ({ b: 'both', l: 'left', r: 'right' }[String(v)] ?? String(v ?? 'none'));
const location = (v: unknown) => ({ ab: 'abovebar', bl: 'belowbar', pr: 'price' }[String(v)] ?? String(v ?? 'price').toLowerCase());
const hidden = (o: Record<string, unknown>) => o.display === false || o.display === 0 || o.display === 'none' || o.display === 'display.none';
export function extractPineBarColors(raw: readonly PineRawVisual[] = []): Map<number, string> {
  const colors = new Map<number, string>();
  for (const plot of raw.slice(0, 256)) if (plot.options.style === 'barcolor' && !hidden(plot.options)) for (const d of plot.data.slice(-20000)) {
    const ink = color(d.options?.color ?? plot.options.color); if (finite(d.time) && ink !== 'transparent') colors.set(d.time / 1000, ink);
  }
  return colors;
}
export function pineVisualWarnings(raw: readonly PineRawVisual[] = []): string[] {
  const supported = new Set(['', 'line', 'style_line', 'style_linebr', 'style_stepline', 'style_stepline_diamond', 'style_steplinebr', 'histogram', 'style_histogram', 'columns', 'style_columns', 'circles', 'style_circles', 'cross', 'style_cross', 'area', 'style_area', 'style_areabr', 'hline', 'fill', 'background', 'barcolor', 'shape', 'char', 'drawing_line', 'drawing_box', 'label', 'table', 'linefill', 'drawing_polyline', 'bar', 'candle']);
  const warnings = raw.filter(p => !supported.has(String(p.options.style ?? ''))).map(p => `Visual style ${String(p.options.style)} is not rendered by the chart host.`);
  if (raw.some(p => p.options.style === 'fill' && (p.options.top_color !== undefined || p.options.bottom_color !== undefined))) warnings.push('Gradient fill interpolation is not rendered; the chart uses the fill color when provided.');
  if (raw.some(p => p.options.style === 'fill' && p.options.fillgaps === true)) warnings.push('Fill gaps remain visible; bridging unavailable source values is not rendered.');
  return [...new Set(warnings)];
}

/** Translate actual PineTS 0.11.1 serialized output. No evaluation or DOM insertion. */
export function normalizePineVisuals(raw: readonly PineRawVisual[] = [], candles: Candle[] = []): PineVisualData {
  const result: Required<PineVisualData> = { fills: [], backgrounds: [], lines: [], boxes: [], labels: [], shapes: [], tables: [], linefills: [], polylines: [], ohlc: [] };
  const times = new Map(candles.map((c, i) => [c.time, i]));
  const index = (t: number) => times.get(t / 1000) ?? times.get(t);
  const plots = new Map(raw.flatMap(p => [[p.key, p], [p.title ?? p.key, p]] as [string, PineRawVisual][]));
  const series = (p?: PineRawVisual) => {
    const values: (number | null)[] = Array(candles.length).fill(null);
    for (const d of p?.data ?? []) { const i = index(d.time); if (i !== undefined && finite(d.value)) values[i] = d.value; }
    return values;
  };
  for (const plot of raw.slice(0, 256)) {
    if (hidden(plot.options)) continue;
    const style = String(plot.options.style ?? '');
    if (style === 'fill') {
      const a = plots.get(String(plot.options.plot1)), b = plots.get(String(plot.options.plot2)); if (!a || !b) continue;
      const colors = Array(candles.length).fill(color(plot.options.color));
      for (const d of plot.data) { const i = index(d.time); if (i !== undefined) colors[i] = color(d.options?.color ?? plot.options.color); }
      if (result.fills.length < PINE_VISUAL_LIMITS.fills) result.fills.push({ a: series(a), b: series(b), colors });
    } else if (style === 'bar' || style === 'candle') {
      for (const d of plot.data.slice(-20000)) {
        const i = index(d.time), v = d.value, o = { ...plot.options, ...d.options };
        if (i === undefined || !Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(finite)) continue;
        result.ohlc.push({ x: i + (finite(o.offset) ? clamp(o.offset, -1000, 1000) : 0), open: v[0], high: v[1], low: v[2], close: v[3], candle: style === 'candle', color: color(o.color, '#2962ff'), wickcolor: color(o.wickcolor ?? o.color, '#2962ff'), bordercolor: color(o.bordercolor ?? o.color, '#2962ff') });
      }
    } else if (['background', 'shape', 'char'].includes(style)) {
      for (const d of plot.data.slice(-20000)) {
        const i = index(d.time); if (i === undefined) continue;
        const o = { ...plot.options, ...d.options }, offset = finite(o.offset) ? clamp(o.offset, -1000, 1000) : 0;
        if (style === 'background') { result.backgrounds.push({ x: i + offset, color: color(o.color) }); continue; }
        if (!d.value || typeof d.value === 'number' && !Number.isFinite(d.value) || result.shapes.length >= PINE_VISUAL_LIMITS.objects) continue;
        result.shapes.push({ x: i + offset, y: finite(d.value) ? d.value : candles[i].close, location: location(o.location), style: String(o.shape ?? 'circle').replace(/_/g, ''), char: style === 'char' ? text(o.char) : undefined, text: text(o.text), color: color(o.color, '#2962ff'), textcolor: color(o.textcolor, '#d1d4dc'), size: o.size as string | number | undefined });
      }
    } else if (['drawing_line', 'drawing_box', 'label', 'table', 'linefill', 'drawing_polyline'].includes(style)) {
      const snapshot = [...plot.data].reverse().find(d => Array.isArray(d.value));
      for (const value of (snapshot?.value as unknown[] ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
        const v = object(value); if (v._deleted) continue;
        if (style === 'drawing_line' && [v.x1, v.x2, v.y1, v.y2].every(finite)) result.lines.push({ ...v, xloc: xloc(v.xloc), extend: extend(v.extend), color: color(v.color, '#2962ff') } as PineVisualLine);
        if (style === 'drawing_box' && [v.left, v.right, v.top, v.bottom].every(finite)) result.boxes.push({ ...v, xloc: xloc(v.xloc), extend: extend(v.extend) } as PineVisualBox);
        if (style === 'label' && finite(v.x)) result.labels.push({ ...v, y: finite(v.y) ? v.y : NaN, xloc: xloc(v.xloc), yloc: location(v.yloc), color: color(v.color, '#2962ff'), textcolor: color(v.textcolor, '#ffffff') } as PineVisualLabel);
        if (style === 'linefill') {
          const a = object(v.line1), b = object(v.line2);
          if (!a._deleted && !b._deleted && [a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2].every(finite)) result.linefills.push({ a: { ...a, xloc: xloc(a.xloc), extend: extend(a.extend) } as PineVisualLine, b: { ...b, xloc: xloc(b.xloc), extend: extend(b.extend) } as PineVisualLine, color: color(v.color) });
        }
        if (style === 'drawing_polyline' && Array.isArray(v.points)) {
          const loc = xloc(v.xloc), points = v.points.slice(0, 1000).map(p => object(p)).filter(p => finite(p.price) && finite(loc === 'bar_time' ? p.time : p.index)).map(p => ({ x: (loc === 'bar_time' ? p.time : p.index) as number, y: p.price as number, xloc: loc }));
          if (points.length >= 2) result.polylines.push({ points, curved: !!v.curved, closed: !!v.closed, color: color(v.line_color, '#2962ff'), fill: color(v.fill_color), width: finite(v.line_width) ? v.line_width : 1, style: String(v.line_style ?? '') });
        }
        if (style === 'table' && finite(v.columns) && finite(v.rows) && v.columns > 0 && v.rows > 0 && v.columns * v.rows <= PINE_VISUAL_LIMITS.tableCells && Array.isArray(v.cells) && result.tables.length < PINE_VISUAL_LIMITS.tables) {
          // PineTS table snapshots are row-major; the renderer uses columns.
          const cells = v.cells as unknown[][], columns = Math.min(40, Math.floor(v.columns)), rows = Math.min(40, Math.floor(v.rows));
          result.tables.push({ ...v, columns, rows, cells: Array.from({ length: columns }, (_, c) => Array.from({ length: rows }, (_, r) => object(cells[r]?.[c]) as PineVisualCell)) } as PineVisualTable);
        }
      }
    }
  }
  return result;
}

/** Clip an extended line to the viewport. Vertical lines and backwards endpoints are supported. */
export function pineLineGeometry(x1: number, y1: number, x2: number, y2: number, width: number, height: number, extend = 'none'): [number, number, number, number] | null {
  if (![x1, y1, x2, y2, width, height].every(finite) || width <= 0 || height <= 0) return null;
  let low = extend.includes('both') || extend.includes('left') ? -Infinity : 0;
  let high = extend.includes('both') || extend.includes('right') ? Infinity : 1;
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return x1 >= 0 && x1 <= width && y1 >= 0 && y1 <= height ? [x1, y1, x1, y1] : null;
  // Liang–Barsky parameter bounds also cap infinite rays before drawing.
  for (const [p, q] of [[-dx, x1], [dx, width - x1], [-dy, y1], [dy, height - y1]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) low = Math.max(low, r); else high = Math.min(high, r);
    if (low > high) return null;
  }
  return [x1 + low * dx, y1 + low * dy, x1 + high * dx, y1 + high * dy];
}

/** One primitive per script/pane. Replacing its snapshot clears all previous script visuals. */
export class PineVisualLayer implements ISeriesPrimitive<Time> {
  private chart?: IChartApi;
  private series?: ISeriesApi<'Line'>;
  private request?: () => void;
  private candles: Candle[] = [];
  private data: PineVisualData = {};
  private readonly time: (epoch:number)=>Time;
  constructor(time:(epoch:number)=>Time=epoch=>epoch as Time){this.time=time;}
  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart; this.series = p.series as ISeriesApi<'Line'>; this.request = p.requestUpdate; }
  detached() { this.chart = undefined; this.series = undefined; this.request = undefined; this.candles = []; this.data = {}; }
  update(candles: Candle[], data: PineVisualData = {}) { this.candles = candles; this.data = data; this.request?.(); }
  clear() { this.data = {}; this.request?.(); }
  autoscaleInfo(from: Logical, to: Logical) {
    const values: number[] = [];
    const visible = (x1: number, x2 = x1, loc?: string) => { const a = this.logical(x1, loc), b = this.logical(x2, loc); return a !== null && b !== null && Math.max(a, b) >= from && Math.min(a, b) <= to; };
    for (const item of (this.data.lines ?? []).slice(-PINE_VISUAL_LIMITS.objects)) if (visible(item.x1, item.x2, item.xloc) || item.extend && !item.extend.includes('none')) values.push(item.y1, item.y2);
    for (const item of (this.data.boxes ?? []).slice(-PINE_VISUAL_LIMITS.objects)) if (visible(item.left, item.right, item.xloc)) values.push(item.top, item.bottom);
    for (const item of [...(this.data.labels ?? []), ...(this.data.shapes ?? [])].slice(-PINE_VISUAL_LIMITS.objects)) if (visible(item.x, item.x, item.xloc)) {
      const loc=('yloc' in item?item.yloc:undefined)??('location' in item?item.location:undefined)??'price';
      const candle=item.xloc?.includes('bar_time')?this.candles.find(c=>c.time===(item.x>1e11?item.x/1000:item.x)):this.candles[Math.round(item.x)];
      if(loc.includes('abovebar'))values.push(candle?.high??NaN);else if(loc.includes('belowbar'))values.push(candle?.low??NaN);else if(!loc.includes('top')&&!loc.includes('bottom'))values.push(item.y);
    }
    for (const item of (this.data.ohlc ?? []).slice(-20000)) if (visible(item.x)) values.push(item.high, item.low);
    for (const item of (this.data.polylines ?? []).slice(-PINE_VISUAL_LIMITS.objects)) for (const p of item.points.slice(0, 1000)) if (visible(p.x, p.x, p.xloc)) values.push(p.y);
    for (const fill of (this.data.fills ?? []).slice(0, PINE_VISUAL_LIMITS.fills)) for (let i=0;i<Math.min(this.candles.length,fill.a.length,fill.b.length);i++) if(visible(i+(fill.offset??0))) values.push(fill.a[i]??NaN,fill.b[i]??NaN);
    let minValue=Infinity,maxValue=-Infinity;for(const value of values)if(finite(value)){minValue=Math.min(minValue,value);maxValue=Math.max(maxValue,value);}
    return minValue===Infinity?null:{priceRange:{minValue,maxValue}};
  }
  paneViews(): IPrimitivePaneView[] {
    return (['bottom', 'top'] as const).map(layer => ({ zOrder: () => layer, renderer: () => ({ draw: target => target.useMediaCoordinateSpace(({ context, mediaSize }) => this.draw(context, mediaSize.width, mediaSize.height, layer)) }) }));
  }
  private x(value: number, xloc?: string): number | null {
    const logical = this.logical(value, xloc);
    return logical === null ? null : this.chart!.timeScale().logicalToCoordinate(logical as Logical);
  }
  /** Pine bar_index belongs to this script's candles, never the chart's union timeline. */
  private logical(value: number, xloc?: string): number | null {
    if (!finite(value) || !this.chart || !this.candles.length) return null;
    const scale = this.chart.timeScale();
    const at = (i: number): number | null => {
      const t = this.time(this.candles[i].time);
      if (typeof scale.timeToIndex === 'function') return scale.timeToIndex(t, false);
      const x = scale.timeToCoordinate(t);
      return x !== null && typeof scale.coordinateToLogical === 'function' ? scale.coordinateToLogical(x) : i;
    };
    if (xloc?.includes('bar_time')) {
      const seconds = value > 1e11 ? value / 1000 : value;
      if (typeof scale.timeToIndex === 'function') { const exact = scale.timeToIndex(this.time(seconds), false); if (exact !== null) return exact; }
      let low = 0, high = this.candles.length;
      while (low < high) { const mid = (low + high) >>> 1; if (this.candles[mid].time < seconds) low = mid + 1; else high = mid; }
      if (this.candles.length < 2) return seconds === this.candles[0].time ? at(0) : null;
      const i = clamp(low, 1, this.candles.length - 1), t1 = this.candles[i - 1].time, t2 = this.candles[i].time, a = at(i - 1), b = at(i);
      return a !== null && b !== null && t2 > t1 ? a + (b - a) * (seconds - t1) / (t2 - t1) : null;
    }
    if (value < 0) { const first = at(0); return first === null ? null : first + value; }
    const last = this.candles.length - 1;
    if (value >= last) { const end = at(last); return end === null ? null : end + value - last; }
    const i = Math.floor(value), a = at(i), b = at(i + 1);
    return a === null || b === null ? null : a + (b - a) * (value - i);
  }
  private y(value: unknown) { return finite(value) ? this.series?.priceToCoordinate(value) ?? null : null; }
  private anchor(item: PineVisualPoint & { yloc?: string; location?: string }, height: number): [number, number] | null {
    const x = this.x(item.x, item.xloc); if (x === null) return null;
    const location = item.yloc ?? item.location ?? 'price';
    if (location.includes('top')) return [x, 16];
    if (location.includes('bottom')) return [x, height - 16];
    const candle = item.xloc?.includes('bar_time') ? this.candles.find(c => c.time === (item.x > 1e11 ? item.x / 1000 : item.x)) : this.candles[Math.round(item.x)];
    const above = location.includes('abovebar'), below = location.includes('belowbar');
    const y = this.y(above ? candle?.high : below ? candle?.low : item.y);
    return y === null ? null : [x, y + (above ? -14 : below ? 14 : 0)];
  }
  private draw(ctx: CanvasRenderingContext2D, width: number, height: number, layer: 'bottom' | 'top') {
    if (!this.chart || !this.series || !width || !height) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    try { if (layer === 'bottom') this.background(ctx, width, height); else this.foreground(ctx, width, height); } finally { ctx.restore(); }
  }
  private background(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const visible = this.chart!.timeScale().getVisibleLogicalRange();
    const firstCandleAt = (logical: number) => { let low = 0, high = this.candles.length; while (low < high) { const mid = (low + high) >>> 1; if ((this.logical(mid) ?? Infinity) < logical) low = mid + 1; else high = mid; } return low; };
    const from = Math.max(0, visible ? firstCandleAt(visible.from) - 1 : 0), to = Math.min(this.candles.length - 1, visible ? firstCandleAt(visible.to) + 1 : this.candles.length - 1);
    for (const bg of (this.data.backgrounds ?? []).slice(-20000)) {
      if (bg.x < from - 1 || bg.x > to + 1) continue;
      const x = this.x(bg.x), left = this.x(bg.x - .5), right = this.x(bg.x + .5);
      if (x === null || left === null || right === null) continue;
      ctx.fillStyle = color(bg.color); ctx.fillRect(left, 0, Math.max(1, right - left), height);
    }
    for (const fill of (this.data.fills ?? []).slice(0, PINE_VISUAL_LIMITS.fills)) {
      const offset = fill.offset ?? 0;
      for (let i = Math.max(0, from - offset); i < Math.min(fill.a.length - 1, fill.b.length - 1, to - offset); i++) {
        const values = [fill.a[i], fill.b[i], fill.a[i + 1], fill.b[i + 1]];
        if (!values.every(finite)) continue; // Never bridge an na gap.
        const x1 = this.x(i + offset), x2 = this.x(i + 1 + offset), a1 = this.y(values[0]!), b1 = this.y(values[1]!), a2 = this.y(values[2]!), b2 = this.y(values[3]!);
        if ([x1, x2, a1, b1, a2, b2].some(v => v === null)) continue;
        ctx.fillStyle = color(fill.colors[i] ?? fill.colors[0]); ctx.beginPath(); ctx.moveTo(x1!, a1!); ctx.lineTo(x2!, a2!); ctx.lineTo(x2!, b2!); ctx.lineTo(x1!, b1!); ctx.closePath(); ctx.fill();
      }
    }
    for (const fill of (this.data.linefills ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
      const project = (line: PineVisualLine) => { const x1 = this.x(line.x1, line.xloc), x2 = this.x(line.x2, line.xloc), y1 = this.y(line.y1), y2 = this.y(line.y2); return [x1, x2, y1, y2].some(v => v === null) ? null : pineLineGeometry(x1!, y1!, x2!, y2!, width, height, line.extend); };
      const a = project(fill.a), b = project(fill.b); if (!a || !b) continue;
      ctx.fillStyle = color(fill.color); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[2], a[3]); ctx.lineTo(b[2], b[3]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill();
    }
    for (const poly of (this.data.polylines ?? []).slice(-PINE_VISUAL_LIMITS.objects)) if (poly.closed && poly.fill !== 'transparent') this.polyline(ctx, poly, true);
  }
  private foreground(ctx: CanvasRenderingContext2D, width: number, height: number) {
    for (const bar of (this.data.ohlc ?? []).slice(-20000)) {
      const x = this.x(bar.x), left = this.x(bar.x - .35), right = this.x(bar.x + .35), open = this.y(bar.open), high = this.y(bar.high), low = this.y(bar.low), close = this.y(bar.close);
      if ([x, left, right, open, high, low, close].some(v => v === null) || x! < -50 || x! > width + 50) continue;
      ctx.lineWidth = 1; ctx.strokeStyle = color(bar.wickcolor ?? bar.color); ctx.beginPath(); ctx.moveTo(x!, high!); ctx.lineTo(x!, low!); ctx.stroke();
      if (bar.candle) { const w = Math.max(1, right! - left!), y = Math.min(open!, close!), h = Math.max(1, Math.abs(close! - open!)); ctx.fillStyle = color(bar.color); ctx.fillRect(left!, y, w, h); ctx.strokeStyle = color(bar.bordercolor ?? bar.color); ctx.strokeRect(left!, y, w, h); }
      else { ctx.strokeStyle = color(bar.color); ctx.beginPath(); ctx.moveTo(left!, open!); ctx.lineTo(x!, open!); ctx.moveTo(x!, close!); ctx.lineTo(right!, close!); ctx.stroke(); }
    }
    for (const poly of (this.data.polylines ?? []).slice(-PINE_VISUAL_LIMITS.objects)) this.polyline(ctx, poly, false);
    for (const line of (this.data.lines ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
      const x1 = this.x(line.x1, line.xloc), x2 = this.x(line.x2, line.xloc), y1 = this.y(line.y1), y2 = this.y(line.y2);
      if ([x1, x2, y1, y2].some(v => v === null)) continue;
      const points = pineLineGeometry(x1!, y1!, x2!, y2!, width, height, line.extend); if (!points) continue;
      ctx.strokeStyle = color(line.color, '#2962ff'); ctx.lineWidth = clamp(line.width ?? 1, 1, 8); ctx.setLineDash(dash(line.style)); ctx.beginPath(); ctx.moveTo(points[0], points[1]); ctx.lineTo(points[2], points[3]); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const box of (this.data.boxes ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
      let left = this.x(box.left, box.xloc), right = this.x(box.right, box.xloc); const top = this.y(box.top), bottom = this.y(box.bottom);
      if (left === null || right === null || top === null || bottom === null) continue;
      if (box.extend?.includes('left') || box.extend?.includes('both')) left = 0;
      if (box.extend?.includes('right') || box.extend?.includes('both')) right = width;
      const x = Math.min(left, right), y = Math.min(top, bottom), w = Math.abs(right - left), h = Math.abs(bottom - top);
      const borderWidth = clamp(box.border_width ?? 1, 0, 8);
      ctx.fillStyle = color(box.bgcolor); ctx.fillRect(x, y, w, h); ctx.strokeStyle = color(box.border_color); ctx.setLineDash(dash(box.border_style)); if (borderWidth > 0) { ctx.lineWidth = borderWidth; ctx.strokeRect(x, y, w, h); } ctx.setLineDash([]);
      if (box.text) this.drawText(ctx, box.text, x + w / 2, y + h / 2, box.text_color, box.text_size, w);
    }
    for (const label of (this.data.labels ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
      const p = this.anchor(label, height); if (!p) continue;
      const font = size(label.size), message = text(label.text); ctx.font = `${font}px sans-serif`;
      const w = Math.min(width, ctx.measureText(message).width + 10), h = font + 8;
      if (!label.style?.includes('none')) { ctx.fillStyle = color(label.color, '#2962ff'); ctx.fillRect(p[0] - w / 2, p[1] - h / 2, w, h); }
      this.drawText(ctx, message, p[0], p[1], label.textcolor ?? '#ffffff', font, w - 4);
    }
    for (const shape of (this.data.shapes ?? []).slice(-PINE_VISUAL_LIMITS.objects)) {
      const p = this.anchor(shape, height); if (!p || p[0] < -50 || p[0] > width + 50) continue;
      this.shape(ctx, shape, p[0], p[1]);
    }
    for (const table of (this.data.tables ?? []).slice(-PINE_VISUAL_LIMITS.tables)) this.table(ctx, table, width, height);
  }
  private drawText(ctx: CanvasRenderingContext2D, value: unknown, x: number, y: number, ink?: string, font?: string | number, maxWidth = 1000) {
    ctx.fillStyle = color(ink, '#d1d4dc'); ctx.font = `${size(font)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text(value).split('\n').slice(0, 10), spacing = size(font) + 2;
    lines.forEach((line, i) => ctx.fillText(line, x, y + (i - (lines.length - 1) / 2) * spacing, Math.max(1, maxWidth)));
  }
  private shape(ctx: CanvasRenderingContext2D, shape: PineVisualShape, x: number, y: number) {
    const r = size(shape.size) / 2, style = shape.style ?? 'circle'; ctx.fillStyle = color(shape.color, '#2962ff'); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2;
    if (shape.char) this.drawText(ctx, shape.char, x, y, shape.color, shape.size);
    else if (style.includes('cross')) { ctx.beginPath(); const diagonal = style.includes('xcross'); ctx.moveTo(x - r, y - (diagonal ? r : 0)); ctx.lineTo(x + r, y + (diagonal ? r : 0)); ctx.moveTo(x - (diagonal ? r : 0), y + r); ctx.lineTo(x + (diagonal ? r : 0), y - r); ctx.stroke(); }
    else if (/triangle|arrow|label/.test(style)) { const down = style.includes('down'), d = down ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y + d * r); ctx.lineTo(x - r, y - d * r); ctx.lineTo(x + r, y - d * r); ctx.closePath(); ctx.fill(); if (style.includes('arrow')) { ctx.beginPath(); ctx.moveTo(x, y - d * r); ctx.lineTo(x, y - d * r * 3); ctx.stroke(); } }
    else if (style.includes('square')) ctx.fillRect(x - r, y - r, r * 2, r * 2);
    else if (style.includes('diamond')) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    if (shape.text) this.drawText(ctx, shape.text, x, y + r + 8, shape.textcolor, 10);
  }
  private polyline(ctx: CanvasRenderingContext2D, poly: PineVisualPolyline, fill: boolean) {
    const points = poly.points.slice(0, 1000).map(p => [this.x(p.x, p.xloc), this.y(p.y)] as const);
    if (points.length < 2 || points.some(p => p[0] === null || p[1] === null)) return;
    ctx.beginPath(); ctx.moveTo(points[0][0]!, points[0][1]!);
    for (let i = 1; i < points.length; i++) {
      if (!poly.curved) ctx.lineTo(points[i][0]!, points[i][1]!);
      else { const p0 = points[Math.max(0, i - 2)], p1 = points[i - 1], p2 = points[i], p3 = points[Math.min(points.length - 1, i + 1)]; ctx.bezierCurveTo(p1[0]! + (p2[0]! - p0[0]!) / 6, p1[1]! + (p2[1]! - p0[1]!) / 6, p2[0]! - (p3[0]! - p1[0]!) / 6, p2[1]! - (p3[1]! - p1[1]!) / 6, p2[0]!, p2[1]!); }
    }
    if (poly.closed) ctx.closePath();
    if (fill) { ctx.fillStyle = color(poly.fill); ctx.fill(); }
    else { ctx.strokeStyle = color(poly.color, '#2962ff'); ctx.lineWidth = clamp(poly.width ?? 1, 1, 8); ctx.setLineDash(dash(poly.style)); ctx.stroke(); ctx.setLineDash([]); }
  }
  private table(ctx: CanvasRenderingContext2D, table: PineVisualTable, width: number, height: number) {
    const cols = clamp(Math.floor(table.columns), 0, 40), rows = clamp(Math.floor(table.rows), 0, 40); if (!cols || !rows || cols * rows > PINE_VISUAL_LIMITS.tableCells) return;
    const widths = Array.from({ length: cols }, (_, c) => Math.min(width / cols, Math.max(36, ...Array.from({ length: rows }, (_, r) => { const cell = table.cells[c]?.[r]; ctx.font = `${size(cell?.text_size)}px sans-serif`; return cell?.width ? width * cell.width / 100 : ctx.measureText(text(cell?.text)).width + 12; }))));
    const heights = Array.from({ length: rows }, (_, r) => Math.min(height / rows, Math.max(22, ...Array.from({ length: cols }, (_, c) => { const cell = table.cells[c]?.[r]; return cell?.height ? height * cell.height / 100 : size(cell?.text_size) + 10; }))));
    const w = widths.reduce((a, b) => a + b, 0), h = heights.reduce((a, b) => a + b, 0), position = table.position ?? 'top_right';
    const x0 = position.includes('left') ? 4 : position.includes('center') ? (width - w) / 2 : width - w - 4;
    const y0 = position.includes('bottom') ? height - h - 4 : position.includes('middle') ? (height - h) / 2 : 4;
    ctx.fillStyle = color(table.bgcolor); ctx.fillRect(x0, y0, w, h);
    let x = x0;
    for (let c = 0; c < cols; c++) { let y = y0; for (let r = 0; r < rows; r++) {
      const cell = table.cells[c]?.[r];
      if (cell && !cell._merged) {
        const merge = table.merges?.find(m => m.startCol === c && m.startRow === r);
        const cw = merge ? widths.slice(c, clamp(merge.endCol + 1, c + 1, cols)).reduce((a, b) => a + b, 0) : widths[c];
        const ch = merge ? heights.slice(r, clamp(merge.endRow + 1, r + 1, rows)).reduce((a, b) => a + b, 0) : heights[r];
        ctx.fillStyle = color(cell.bgcolor); ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = color(table.border_color); const borderWidth = clamp(table.border_width ?? 0, 0, 8); if (borderWidth > 0) { ctx.lineWidth = borderWidth; ctx.strokeRect(x, y, cw, ch); }
        this.drawText(ctx, cell.text, x + cw / 2, y + ch / 2, cell.text_color, cell.text_size, cw - 6);
      }
      y += heights[r];
    } x += widths[c]; }
    ctx.strokeStyle = color(table.frame_color); const frameWidth = clamp(table.frame_width ?? 0, 0, 8); if (frameWidth > 0) { ctx.lineWidth = frameWidth; ctx.strokeRect(x0, y0, w, h); }
  }
}
