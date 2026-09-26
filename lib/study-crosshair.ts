import type { IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts';

// Use the primary study plot at the selected candle, never the pointer's Y
// coordinate or a nearby smoothing line. Pane coordinates are local to each pane.
export function snapStudyCrosshair(
  chart: IChartApi,
  series: ISeriesApi<'Line' | 'Histogram'> | undefined,
  event: MouseEventParams<Time>,
): boolean {
  if (!series || !event.point || event.time === undefined ||
      event.paneIndex !== series.getPane().paneIndex() || !series.options().visible) return false;

  const point = event.seriesData.get(series);
  if (!point || !('value' in point) || !Number.isFinite(point.value)) return false;

  // This API updates the native axis label and horizontal guide together and
  // does not emit another crosshair event (including for touch tracking).
  chart.setCrosshairPosition(point.value, event.time, series);
  return true;
}
