const KEY = "papertrade-chart-timeframe-v1";
const valid = ["1m", "2m", "3m", "5m", "10m", "15m", "30m", "1H", "2H", "3H", "4H", "1D", "1W", "1M", "1Y"];
type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function readChartTimeframe(storage: StorageLike, userId: string, query: string | null, lastChart: unknown): string {
  let preferred: unknown;
  let legacy: unknown;
  try { preferred = storage.getItem(`${KEY}:${userId}`); } catch { /* Storage may be unavailable. */ }
  try { legacy = JSON.parse(storage.getItem(`papertrade-ui-preferences-v2:${userId}`) ?? "{}").timeframe; } catch { /* Ignore invalid legacy settings. */ }
  return [preferred, legacy, query, lastChart].find((value): value is string => typeof value === "string" && valid.includes(value)) ?? "5m";
}

export function saveChartTimeframe(storage: StorageLike, userId: string, timeframe: string) {
  if (!valid.includes(timeframe)) return;
  try { storage.setItem(`${KEY}:${userId}`, timeframe); } catch { /* Keep this session usable if storage is blocked. */ }
}
