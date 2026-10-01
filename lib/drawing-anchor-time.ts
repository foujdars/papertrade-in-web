import { candleBucket } from './chart-history.ts';

/** Display the containing calendar candle without changing the saved anchor. */
export function drawingTimeForFrame(time: number, times: number[], timeframe: string, calendarOffset = 0, sourceAxisOffset = 0, targetAxisOffset = 0) {
  const epoch = time - sourceAxisOffset;
  const displayTime = epoch + targetAxisOffset;
  if (!times.length || !['1D', '1W', '1M', '1Y'].includes(timeframe)) return displayTime;
  const bucket = candleBucket(epoch + calendarOffset, timeframe);
  let low = 0, high = times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (candleBucket(times[mid] - targetAxisOffset + calendarOffset, timeframe) < bucket) low = mid + 1;
    else high = mid;
  }
  return low < times.length && candleBucket(times[low] - targetAxisOffset + calendarOffset, timeframe) === bucket ? times[low] : displayTime;
}
