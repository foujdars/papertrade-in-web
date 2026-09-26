"use client";

import { useEffect, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Trash2 } from "lucide-react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { studyLinePoints, type StudyDrawing } from "@/lib/study-pane-drawings";

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.paneSize(pane).height;
  return top;
}

export function StudyPaneLayer({ chart, studyRenderer, drawings, cursor, selectedId, refreshRef, onDelete, onDone }: {
  chart: IChartApi | null;
  studyRenderer: MutableRefObject<ChartStudyRenderer | null>;
  drawings: StudyDrawing[];
  cursor: { y: number; text: string; color?: string } | null;
  selectedId: string | null;
  refreshRef: MutableRefObject<(() => void) | null>;
  onDelete?: (id: string) => void;
  onDone?: () => void;
}) {
  const [, redraw] = useState(0);
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
  for (let pane = 0; pane < chart.panes().length; pane += 1) height += chart.paneSize(pane).height;
  const point = (studyId: string, marker: StudyDrawing["a"]) => {
    const bundle = studyRenderer.current?.bundles.find((item) => item.id === studyId);
    const series = bundle?.series[0] as ISeriesApi<"Line"> | undefined;
    if (!bundle || !series) return null;
    const x = chart.timeScale().timeToCoordinate(marker.time as UTCTimestamp);
    const y = series.priceToCoordinate(marker.value);
    if (x == null || y == null) return null;
    return { x, y: y + paneTop(chart, bundle.pane), top: paneTop(chart, bundle.pane), paneHeight: chart.paneSize(bundle.pane).height };
  };
  let toolbar: { x: number; y: number } | null = null;
  const selected = selectedId ? drawings.find((line) => line.id === selectedId) : undefined;
  if (selected) {
    const from = point(selected.studyId, selected.a);
    const to = point(selected.studyId, selected.b);
    if (from && to) {
      const ends = studyLinePoints(selected.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight);
      const midX = ends ? (ends.x1 + ends.x2) / 2 : (from.x + to.x) / 2;
      const midY = ends ? Math.min(ends.y1, ends.y2) : Math.min(from.y, to.y);
      toolbar = { x: Math.max(4, Math.min(width - 72, midX - 28)), y: Math.max(from.top + 4, midY - 36) };
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
      const ends = studyLinePoints(line.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight);
      const selectedLine = line.id === selectedId;
      if (!ends) {
        const x = Math.min(from.x, to.x);
        const y = Math.min(from.y, to.y);
        return <rect key={line.id} className={selectedLine ? "selected" : undefined} x={x} y={y} width={Math.abs(to.x - from.x)} height={Math.abs(to.y - from.y)} />;
      }
      return <line key={line.id} className={selectedLine ? "selected" : undefined} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />;
    })}
    </svg>
    {cursor && <b className="chart-oscillator-tag" style={{ top: cursor.y, left: width, background: cursor.color, color: cursor.color ? "#fff" : undefined }}>{cursor.text}</b>}
    {selectedId && toolbar && <div className="chart-selected-drawing" role="toolbar" aria-label="Selected drawing actions" style={{ left: toolbar.x, top: toolbar.y }} onPointerDown={stopToolbar}>
      <button type="button" aria-label="Delete selected drawing" title="Delete drawing" onClick={() => onDelete?.(selectedId)}><Trash2 size={19} /></button>
      <button type="button" aria-label="Finish editing drawing" title="Done" onClick={() => onDone?.()}><Check size={21} /></button>
    </div>}
  </>;
}
