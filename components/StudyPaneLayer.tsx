"use client";

import { useEffect, useId, useState, type MutableRefObject } from "react";
import { DrawingActionBar } from "./DrawingActionBar";
import { drawingTitle } from "@/lib/drawing-editing";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { studyLinePoints, drawingTextPosition, drawingTextVisible, type StudyDrawing } from "@/lib/study-pane-drawings";

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.panes()[pane]?.getHeight() ?? 0;
  return top;
}

export function StudyPaneLayer({ chart, studyRenderer, drawings, cursor, selectedId, refreshRef, onAction, onDone, onSettings, disabled = false }: {
  chart: IChartApi | null;
  studyRenderer: MutableRefObject<ChartStudyRenderer | null>;
  drawings: StudyDrawing[];
  cursor: { y: number; text: string; color?: string } | null;
  selectedId: string | null;
  refreshRef: MutableRefObject<(() => void) | null>;
  onAction?: (id: string, action: 'duplicate'|'lock'|'hide'|'delete') => void;
  disabled?: boolean;
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
      toolbar = { x: Math.max(4, Math.min(width - 280, midX - 136)), y: Math.max(from.top + 4, midY - 82) };
    }
  }
  return <>
    <svg className="chart-study-drawings" width={width} height={height} aria-hidden="true">
    {cursor && !cursor.color && <line className="chart-study-crosshair" x1={0} y1={cursor.y} x2={width} y2={cursor.y} />}
    {drawings.map((line) => {
      const from = point(line.studyId, line.a);
      const to = point(line.studyId, line.b);
      if (!from || !to) return null;
      const ends = studyLinePoints(line.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight, line.presentation);
      const selectedLine = line.id === selectedId;
      const label = drawingTextPosition(from,to,line.presentation);
      const text = line.presentation?.text && drawingTextVisible(line.tool, from, label, width, height) && <text x={label.x} y={label.y} textAnchor={label.anchor} fill={line.presentation?.color ?? "#8054da"} fontSize={12} style={{paintOrder:"stroke",stroke:"var(--surface,#fff)",strokeWidth:3,strokeLinejoin:"round"}}>{line.presentation.text}</text>;
      const clip = `study-clip-${clipPrefix}-${line.id}`;
      const wrap = (shape: React.ReactNode) => <g key={line.id}><defs><clipPath id={clip}><rect x={0} y={from.top} width={width} height={from.paneHeight}/></clipPath></defs><g clipPath={`url(#${clip})`}>{shape}{text}{selectedLine && <>{[from,to].map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4} fill="white" stroke="#8054da"/>)}</>}</g></g>;
      if (!ends) {
        const x = line.presentation?.extendLeft ? 0 : Math.min(from.x, to.x);
        const right = line.presentation?.extendRight ? width : Math.max(from.x,to.x);
        const y = Math.min(from.y, to.y);
        return wrap(<rect className={selectedLine ? "selected" : undefined} style={{stroke:line.presentation?.color,strokeWidth:line.presentation?.lineWidth,strokeDasharray:line.presentation?.lineDash?.join(" ")}} x={x} y={y} width={right-x} height={Math.abs(to.y - from.y)} />);
      }
      return wrap(<line className={selectedLine ? "selected" : undefined} style={{stroke:line.presentation?.color,strokeWidth:line.presentation?.lineWidth,strokeDasharray:line.presentation?.lineDash?.join(" ")}} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />);
    })}
    </svg>
    {cursor && <b className="chart-oscillator-tag" style={{ top: cursor.y, left: width, background: cursor.color, color: cursor.color ? "#fff" : undefined }}>{cursor.text}</b>}
    {selected && toolbar && <DrawingActionBar title={drawingTitle(selected.tool)} locked={!!selected.locked} disabled={disabled} position={toolbar} onSettings={()=>onSettings?.(selected.id)} onDuplicate={()=>onAction?.(selected.id,'duplicate')} onLock={()=>onAction?.(selected.id,'lock')} onHide={()=>onAction?.(selected.id,'hide')} onDelete={()=>onAction?.(selected.id,'delete')} onDone={()=>onDone?.()} />}

  </>;
}
