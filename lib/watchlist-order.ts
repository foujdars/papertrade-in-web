/** Preserve saved positions while removing deleted lists and appending new ones. */
export function reconcileWatchlistOrder(saved: unknown, availableIds: readonly string[]): string[] {
  const available = new Set(availableIds);
  const ordered = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string" && available.has(id)) : [];
  return [...new Set([...ordered, ...availableIds])];
}

/** Move a stable list ID; never mutate the caller's order. */
export function moveWatchlistItem(ids: readonly string[], id: string, targetIndex: number): string[] {
  const next = [...ids];
  const source = next.indexOf(id);
  if (source < 0 || !Number.isFinite(targetIndex)) return next;
  next.splice(source, 1);
  next.splice(Math.max(0, Math.min(next.length, Math.trunc(targetIndex))), 0, id);
  return next;
}
