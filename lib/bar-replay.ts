import type { Candle } from "./market.ts";

export type ReplayPosition = { side: "BUY" | "SELL"; price: number; quantity: number; time: number };
export type ReplayFill = { id: string; time: number; price: number; side: "BUY" | "SELL"; role: "ENTRY" | "EXIT"; quantity: number };
export type ReplayAccount = { position: ReplayPosition | null; realized: number; fills: ReplayFill[] };
export const emptyReplayAccount = (): ReplayAccount => ({ position: null, realized: 0, fills: [] });

// Freeze and validate the historical snapshot. Never generate fallback prices.
export function prepareReplayCandles(candles: Candle[]): Candle[] {
  const unique = new Map<number, Candle>();
  for (const candle of candles) {
    if (![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    if (candle.time <= 0 || candle.low <= 0 || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) continue;
    unique.set(candle.time, { ...candle });
  }
  // The newest bar may still be forming (including daily/weekly bars).
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(0, -1);
}

export function replayPnl(position: ReplayPosition | null, price: number): number {
  return position ? (price - position.price) * (position.side === "BUY" ? 1 : -1) * position.quantity : 0;
}

export function replayTrade(account: ReplayAccount, side: "BUY" | "SELL" | "CLOSE", candle: Candle, quantity: number): ReplayAccount {
  if (!Number.isFinite(candle.close) || candle.close <= 0) return account;
  if (account.position) {
    if (side === account.position.side) return account;
    const exitSide = account.position.side === "BUY" ? "SELL" : "BUY";
    return { position: null, realized: account.realized + replayPnl(account.position, candle.close), fills: [...account.fills, { id: `replay-${account.fills.length}`, time: candle.time, price: candle.close, side: exitSide, role: "EXIT", quantity: account.position.quantity }] };
  }
  if (side === "CLOSE" || !Number.isSafeInteger(quantity) || quantity <= 0) return account;
  return { ...account, position: { side, price: candle.close, quantity, time: candle.time }, fills: [...account.fills, { id: `replay-${account.fills.length}`, time: candle.time, price: candle.close, side, role: "ENTRY", quantity }] };
}
