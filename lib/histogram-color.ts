/** Four MACD states: rising/fading above zero, recovering/falling below zero. */
export function macdHistogramColor(value: number, previous: number | undefined, colors: readonly string[]): string {
  const rising = !Number.isFinite(previous) ? value >= 0 : value > previous!;
  return colors[value >= 0 ? rising ? 2 : 3 : rising ? 4 : 5];
}
