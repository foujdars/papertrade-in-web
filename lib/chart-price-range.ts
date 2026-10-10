export type PriceRange = { minValue: number; maxValue: number };

/** Ignore zero-price anchors on a positive-price chart; keep legitimate ranges intact. */
export function priceRangeWithoutZeroAnchor(
  range: PriceRange,
  bars: ReadonlyArray<{ low: number; high: number }>,
): PriceRange {
  if (range.minValue > 0 || !bars.length) return range;
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (const bar of bars) {
    if (!Number.isFinite(bar.low) || !Number.isFinite(bar.high) || bar.low <= 0 || bar.high < bar.low) return range;
    minValue = Math.min(minValue, bar.low);
    maxValue = Math.max(maxValue, bar.high);
  }
  return { minValue, maxValue: Math.max(maxValue, range.maxValue) };
}
