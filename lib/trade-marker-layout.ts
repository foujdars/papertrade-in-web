type MarkerPosition = { id: string; time: number; candleTime: number; x: number; y: number; direction: "up" | "down" };

/** Stack each execution at the candle's x coordinate, including entry/exit pairs. */
export function stackTradeMarkers<T extends MarkerPosition>(markers: T[], height: number): T[] {
  const groups = new Map<number, T[]>();
  for (const marker of markers) groups.set(marker.candleTime, [...(groups.get(marker.candleTime) ?? []), marker]);
  return [...groups.values()].flatMap(group => {
    const placed = group.map(marker => ({ ...marker, y: marker.direction === "down" ? marker.y - 38 : marker.y + 3 }))
      .sort((a, b) => a.y - b.y || a.time - b.time || a.id.localeCompare(b.id));
    for (let i = 0; i < placed.length; i++) placed[i].y = Math.max(52, placed[i].y, i ? placed[i - 1].y + 38 : 52);
    const overflow = Math.max(0, (placed.at(-1)?.y ?? 0) - (height - 40));
    if (overflow) for (const marker of placed) marker.y -= overflow;
    return placed;
  });
}
