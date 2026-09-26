"use client";

import { useEffect, useId, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Trash2, Settings2 } from "lucide-react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { studyLinePoints, drawingTextPosition, type StudyDrawing } from "@/lib/study-pane-drawings";

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.panes()[pane]?.getHeight() ?? 0;
  return top;
}

export function StudyPaneLayer({ chart, studyRenderer, drawings, cursor, selectedId, refreshRef, onDelete, onDone, onSettings }: {
  chart: IChartApi | null;
  studyRenderer: MutableRefObject<ChartStudyRenderer | null>;
  drawings: StudyDrawing[];
  cursor: { y: number; text: string; color?: string } | null;
  selectedId: string | null;
  refreshRef: MutableRefObject<(() => void) | null>;
  onDelete?: (id: string) => void;
  onDone?: () => void;
  onSettings?: (id: string) => void;
}) {
  const [, redraw] = useState(0);
  const clipPrefix = useId().replace(/:/g, '');
  useEffect(() => {
    let frame = 0;
    const refresh = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw((value) => value + 1); }); };
    refreshRef.current = refresh;
    const scale = chart?.timeScale();
    scale?.subscribeVisibleLogicalRangeChange(refresh);
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      scale?.unsubscribeVisibleLogicalRangeChange(refresh);
      refreshRef.current = null;
    };
  }, [chart, refreshRef, drawings.length]);
  if (!chart) return null;
  const width = chart.timeScale().width();
  let height = 0;
  // Newly added RSI panes have a model before their rendered widget exists.
  // Reading paneSize in that render window throws and unmounts the dashboard.
  for (const pane of chart.panes()) height += pane.getHeight();
  const point = (studyId: string, marker: StudyDrawing["a"]) => {
    const bundle = studyRenderer.current?.bundles.find((item) => item.id === studyId);
    const series = bundle?.series[0] as ISeriesApi<"Line"> | undefined;
    const pane = bundle && chart.panes()[bundle.pane];
    if (!bundle || !series || !pane) return null;
    const x = chart.timeScale().timeToCoordinate(marker.time as UTCTimestamp);
    const y = series.priceToCoordinate(marker.value);
    if (x == null || y == null) return null;
    return { x, y: y + paneTop(chart, bundle.pane), top: paneTop(chart, bundle.pane), paneHeight: pane.getHeight() };
  };
  let toolbar: { x: number; y: number } | null = null;
  const selected = selectedId ? drawings.find((line) => line.id === selectedId) : undefined;
  if (selected) {
    const from = point(selected.studyId, selected.a);
    const to = point(selected.studyId, selected.b);
    if (from && to) {
      const ends = studyLinePoints(selected.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight, selected.presentation);
      const midX = ends ? (ends.x1 + ends.x2) / 2 : (from.x + to.x) / 2;
      const midY = ends ? Math.min(ends.y1, ends.y2) : Math.min(from.y, to.y);
      toolbar = { x: Math.max(4, Math.min(width - 112, midX - 48)), y: Math.max(from.top + 4, midY - 36) };
    }
  }
  const stopToolbar = (event: ReactPointerEvent) => event.stopPropagation();
  return <>
    <svg className="chart-study-drawings" width={width} height={height} aria-hidden="true">
    {cursor && <line className="chart-study-crosshair" style={cursor.color ? { stroke: cursor.color } : undefined} x1={0} y1={cursor.y} x2={width} y2={cursor.y} />}
    {drawings.map((line) => {
      const from = point(line.studyId, line.a);
      const to = point(line.studyId, line.b);
      if (!from || !to) return null;
      const ends = studyLinePoints(line.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight, line.presentation);
      const selectedLine = line.id === selectedId;
      const label = drawingTextPosition(ends ? {x:ends.x1,y:ends.y1} : from,ends ? {x:ends.x2,y:ends.y2} : to,line.presentation);
      const labelY = Math.max(from.top + 14, Math.min(from.top + from.paneHeight - 6, label.y));
      const text = line.presentation?.text && <text x={label.x} y={labelY} textAnchor={label.anchor} fill="#8054da" fontSize={12}>{line.presentation.text}</text>;
      const clip = `study-clip-${clipPrefix}-${line.id}`;
      const wrap = (shape: React.ReactNode) => <g key={line.id}><defs><clipPath id={clip}><rect x={0} y={from.top} width={width} height={from.paneHeight}/></clipPath></defs><g clipPath={`url(#${clip})`}>{shape}{text}{selectedLine && <>{[from,to].map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4} fill="white" stroke="#8054da"/>)}</>}</g></g>;
      if (!ends) {
        const x = line.presentation?.extendLeft ? 0 : Math.min(from.x, to.x);
        const right = line.presentation?.extendRight ? width : Math.max(from.x,to.x);
        const y = Math.min(from.y, to.y);
        return wrap(<rect className={selectedLine ? "selected" : undefined} x={x} y={y} width={right-x} height={Math.abs(to.y - from.y)} />);
      }
      return wrap(<line className={selectedLine ? "selected" : undefined} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />);
    })}
    </svg>
    {cursor && <b className="chart-oscillator-tag" style={{ top: cursor.y, left: width, background: cursor.color, color: cursor.color ? "#fff" : undefined }}>{cursor.text}</b>}
    {selectedId && toolbar && <div className="chart-selected-drawing" role="toolbar" aria-label="Selected drawing actions" style={{ left: toolbar.x, top: toolbar.y }} onPointerDown={stopToolbar}>
      <button type="button" aria-label="Drawing settings" onClick={()=>onSettings?.(selectedId)}><Settings2 size={19}/></button>
      <button type="button" aria-label="Delete selected drawing" title="Delete drawing" onClick={() => onDelete?.(selectedId)}><Trash2 size={19} /></button>
      <button type="button" aria-label="Finish editing drawing" title="Done" onClick={() => onDone?.()}><Check size={21} /></button>
    </div>}
  </>;
}
