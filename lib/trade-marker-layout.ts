type MarkerPosition = { id: string; time: number; candleTime: number; x: number; y: number; direction: "up" | "down" };

/** Keep sell arrows above the high and buy arrows below the low, never across the candle. */
export function stackTradeMarkers<T extends MarkerPosition>(markers: T[], height: number, width = Infinity, size = 22): T[] {
  const groups = new Map<string, T[]>();
  for (const marker of markers) {
    const key = `${marker.candleTime}:${marker.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), marker]);
  }
  return [...groups.values()].flatMap(group => {
    return [...group].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
      .map((marker, index) => ({ ...marker, y: marker.direction === "down" ? marker.y - size - 4 - index * (size + 2) : marker.y + 4 + index * (size + 2) }))
      // Clip instead of moving an offscreen execution onto another price or onto an axis.
      .filter(marker => marker.x >= size / 2 && marker.x <= width - size / 2 && marker.y >= 0 && marker.y + size <= height);
  });
}

export function positionPnl(side: "BUY" | "SELL", quantity: number, entry: number, current: number) {
  return (current - entry) * (side === "BUY" ? 1 : -1) * quantity;
}

export function compactPnl(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
