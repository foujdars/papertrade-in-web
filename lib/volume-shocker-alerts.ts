import { NSE_HOLIDAYS } from "./nse-holidays.ts";
import { indiaClock, shadeChoice } from "./notification-policy.ts";

export const VOLUME_SHOCKER_LEVELS = [10, 15, 17] as const;
export const VOLUME_SHOCKER_WATCH_LIMIT = 50;
export const VOLUME_SHOCKER_DEVICE_LIMIT = 25;
export const VOLUME_SHOCKER_UNION_LIMIT = 80;
export const VOLUME_SHOCKER_HISTORY_BUDGET = 12;
const NSE_EQUITY_KEY = /^NSE_EQ\|INE[A-Z0-9]+$/;

export type ShockerInstrument = { symbol: string; name: string; instrumentKey: string };
export type ShockerMove = { symbol: string; instrumentKey: string; changePercent: number; volumeMultiple: number };
export type ShockerNotice = {
  id: string;
  symbol: string;
  instrumentKey: string;
  side: "up" | "down";
  level: number;
  changePercent: number;
  title: string;
  body: "";
  url: string;
  kind: "trade";
};
export type ShockerPlan = { notices: ShockerNotice[]; sentIds: string[] };

export function nseCashSessionOpen(now: number) {
  const clock = indiaClock(now);
  if (clock.weekday === 0 || clock.weekday === 6 || NSE_HOLIDAYS[clock.day]) return false;
  return clock.minutes >= 9 * 60 + 15 && clock.minutes < 15 * 60 + 30;
}

export function normalizeShockerWatch(value: unknown, limit = VOLUME_SHOCKER_WATCH_LIMIT): ShockerInstrument[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const instruments: ShockerInstrument[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { symbol?: unknown; name?: unknown; instrumentKey?: unknown };
    const symbol = typeof record.symbol === "string" ? record.symbol.trim().toUpperCase() : "";
    const instrumentKey = typeof record.instrumentKey === "string" ? record.instrumentKey.trim() : "";
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : symbol;
    if (!symbol || symbol.length > 32 || !NSE_EQUITY_KEY.test(instrumentKey) || seen.has(instrumentKey)) continue;
    seen.add(instrumentKey);
    instruments.push({ symbol, name, instrumentKey });
    if (instruments.length >= limit) break;
  }
  return instruments;
}

export function selectVolumeShockerWatch(input: {
  watchlist: string;
  customWatchlists: readonly { id: string; symbols: readonly string[] }[];
  instruments: readonly { symbol: string; name: string; instrumentKey: string; categories?: readonly string[]; assetType?: string }[];
}): ShockerInstrument[] {
  const equity = new Map<string, { item: ShockerInstrument; categories: readonly string[] }>();
  for (const instrument of input.instruments) {
    if (!NSE_EQUITY_KEY.test(instrument.instrumentKey) || instrument.assetType === "INDEX" || instrument.assetType === "OPTION" || instrument.assetType === "FUTURE") continue;
    const symbol = instrument.symbol.trim().toUpperCase();
    if (!symbol || equity.has(symbol)) continue;
    equity.set(symbol, {
      categories: instrument.categories ?? [],
      item: { symbol, name: instrument.name.trim().slice(0, 80) || symbol, instrumentKey: instrument.instrumentKey },
    });
  }
  const picked: ShockerInstrument[] = [];
  const seen = new Set<string>();
  const add = (item?: ShockerInstrument) => {
    if (!item || seen.has(item.instrumentKey) || picked.length >= VOLUME_SHOCKER_WATCH_LIMIT) return;
    seen.add(item.instrumentKey);
    picked.push(item);
  };
  const broad = input.watchlist === "ALL NSE" || input.watchlist === "NIFTY 500";
  if (!broad) {
    const custom = input.customWatchlists.find((list) => `custom:${list.id}` === input.watchlist);
    if (custom) {
      for (const symbol of custom.symbols) add(equity.get(symbol.trim().toUpperCase())?.item);
      return picked;
    }
    if (input.watchlist === "NIFTY 50" || input.watchlist === "BANK NIFTY") {
      for (const row of equity.values()) if (row.categories.includes(input.watchlist)) add(row.item);
      return picked;
    }
  }
  for (const list of input.customWatchlists) for (const symbol of list.symbols) add(equity.get(symbol.trim().toUpperCase())?.item);
  return picked;
}

export function pickHistoryKeys(candidates: readonly { instrumentKey: string; changePercent: number }[], options: { cached?: ReadonlySet<string>; skip?: ReadonlySet<string>; limit: number }) {
  return candidates
    .filter((candidate) => !options.cached?.has(candidate.instrumentKey) && !options.skip?.has(candidate.instrumentKey))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || a.instrumentKey.localeCompare(b.instrumentKey))
    .slice(0, Math.max(0, options.limit))
    .map((candidate) => candidate.instrumentKey);
}

const formatMove = (changePercent: number) => `${changePercent >= 0 ? "+" : "-"}${Math.round(Math.abs(changePercent))}%`;
const formatMultiple = (volumeMultiple: number) => volumeMultiple >= 10 ? String(Math.round(volumeMultiple)) : (Math.round(volumeMultiple * 10) / 10).toFixed(1);

export function shockerTitle(symbol: string, changePercent: number, volumeMultiple: number) {
  const move = formatMove(changePercent);
  const multiple = formatMultiple(volumeMultiple);
  return shadeChoice(changePercent >= 0 ? "📈" : "📉", [
    `${symbol} ${move} · ${multiple}× volume`,
    `${symbol} ${move} · ${multiple}× vol`,
    `${symbol} ${move} on volume`,
    `${symbol} ${move}`,
  ]);
}

export function shockerNoticeId(day: string, symbol: string, side: "up" | "down", level: number) {
  return `vshock-${day}-${symbol}-${side}-${level}`;
}

export function shockerChartUrl(symbol: string) {
  return `/?symbol=${encodeURIComponent(symbol)}&timeframe=5m`;
}

export function planShockerNotices(rows: readonly ShockerMove[], day: string, alreadySent: ReadonlySet<string>): ShockerPlan {
  const notices: ShockerNotice[] = [];
  const sentIds: string[] = [];
  for (const row of rows) {
    if (!row.symbol || !Number.isFinite(row.changePercent) || !(row.volumeMultiple > 5)) continue;
    const side = row.changePercent >= 0 ? "up" : "down";
    const pending = VOLUME_SHOCKER_LEVELS.filter((level) => Math.abs(row.changePercent) >= level && !alreadySent.has(shockerNoticeId(day, row.symbol, side, level)));
    if (!pending.length) continue;
    const level = pending[pending.length - 1];
    sentIds.push(...pending.map((item) => shockerNoticeId(day, row.symbol, side, item)));
    notices.push({
      id: shockerNoticeId(day, row.symbol, side, level),
      symbol: row.symbol,
      instrumentKey: row.instrumentKey,
      side,
      level,
      changePercent: row.changePercent,
      title: shockerTitle(row.symbol, row.changePercent, row.volumeMultiple),
      body: "",
      url: shockerChartUrl(row.symbol),
      kind: "trade",
    });
  }
  notices.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || a.symbol.localeCompare(b.symbol));
  return { notices, sentIds };
}
