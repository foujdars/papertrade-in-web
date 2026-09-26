"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { ChartStudyRenderer } from "@/lib/chart-study-renderer";
import { studyLinePoints, type StudyDrawing } from "@/lib/study-pane-drawings";

function paneTop(chart: IChartApi, index: number) {
  let top = 0;
  for (let pane = 0; pane < index; pane += 1) top += chart.paneSize(pane).height;
  return top;
}

export function StudyPaneLayer({ chart, studyRenderer, drawings, cursor, selectedId, refreshRef }: {
  chart: IChartApi | null;
  studyRenderer: MutableRefObject<ChartStudyRenderer | null>;
  drawings: StudyDrawing[];
  cursor: { y: number; text: string } | null;
  selectedId: string | null;
  refreshRef: MutableRefObject<(() => void) | null>;
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
  return <>
    <svg className="chart-study-drawings" width={width} height={height} aria-hidden="true">
    {cursor && <line className="chart-study-crosshair" x1={0} y1={cursor.y} x2={width} y2={cursor.y} />}
    {drawings.map((line) => {
      const from = point(line.studyId, line.a);
      const to = point(line.studyId, line.b);
      if (!from || !to) return null;
      const ends = studyLinePoints(line.tool, from.x, from.y, to.x, to.y, width, from.top, from.paneHeight);
      const selected = line.id === selectedId;
      if (!ends) {
        const x = Math.min(from.x, to.x);
        const y = Math.min(from.y, to.y);
        return <rect key={line.id} className={selected ? "selected" : undefined} x={x} y={y} width={Math.abs(to.x - from.x)} height={Math.abs(to.y - from.y)} />;
      }
      return <line key={line.id} className={selected ? "selected" : undefined} x1={ends.x1} y1={ends.y1} x2={ends.x2} y2={ends.y2} />;
    })}
    </svg>
    {cursor && <b className="chart-oscillator-tag" style={{ top: cursor.y, left: width }}>{cursor.text}</b>}
  </>;
}
