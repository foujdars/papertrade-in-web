export type HomeQuote = { lastPrice: number; changePercent: number | null };
export function usableHomeQuote(value: unknown): HomeQuote | null {
  const q = value as { lastPrice?: number; previousClose?: number; changeAvailable?: boolean } | undefined;
  if (!q || !Number.isFinite(q.lastPrice) || q.lastPrice! <= 0) return null;
  return { lastPrice: q.lastPrice!, changePercent: q.changeAvailable !== false && Number.isFinite(q.previousClose) && q.previousClose! > 0 ? (q.lastPrice! / q.previousClose! - 1) * 100 : null };
}
export function quoteChangeText(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
