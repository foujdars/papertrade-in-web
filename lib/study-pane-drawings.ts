export type StudyPoint = { time: number; value: number };
export type StudyDrawing = {
  id: string;
  studyId: string;
  tool: string;
  a: StudyPoint;
  b: StudyPoint;
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

export function studyLinePoints(tool: string, x1: number, y1: number, x2: number, y2: number, width: number, paneTop: number, paneHeight: number) {
  if (tool === "horizontal-line") return { x1: 0, y1, x2: width, y2: y1 };
  if (tool === "horizontal-ray") return { x1, y1, x2: width, y2: y1 };
  if (tool === "vertical-line") return { x1, y1: paneTop, x2: x1, y2: paneTop + paneHeight };
  if (tool === "rectangle") return null;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const yAt = (x: number) => Math.abs(dx) < 0.001 ? y1 : y1 + dy * ((x - x1) / dx);
  if (tool === "extended-line") return { x1: 0, y1: yAt(0), x2: width, y2: yAt(width) };
  if (tool === "ray" || tool === "trend-line") {
    const endX = dx >= 0 ? width : 0;
    return { x1, y1, x2: endX, y2: yAt(endX) };
  }
  return { x1, y1, x2, y2 };
}
