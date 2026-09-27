import type { PerpAccount } from "./global-markets.ts";
import { pnlDay } from "./pnl-analytics.ts";
import type { ClosedPaperTrade } from "./trade-analytics.ts";

type Fill = { id: string; symbol: string; kind: string; at: number; contracts: number; price: number; pnl: number; fee: number; detail: string };
type Lot = { contracts: number; entry: number; openedAt: number; side: "BUY" | "SELL"; fee: number };

const sideOf = (detail: string): "BUY" | "SELL" => /short/i.test(detail) ? "SELL" : "BUY";

function closes(events: Fill[], prefix: string): ClosedPaperTrade[] {
  const books = new Map<string, Lot[]>();
  const trades: ClosedPaperTrade[] = [];
  for (const event of [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))) {
    const book = books.get(event.symbol) ?? [];
    books.set(event.symbol, book);
    if (event.kind === "OPEN") {
      book.push({ contracts: event.contracts, entry: event.price, openedAt: event.at, side: sideOf(event.detail), fee: Math.max(0, event.fee) });
      continue;
    }
    if (!["CLOSE", "LIQUIDATION", "SETTLEMENT"].includes(event.kind) || event.contracts <= 0) continue;
    let left = event.contracts, entryNotional = 0, matched = 0, entryFee = 0, openedAt = event.at, side: "BUY" | "SELL" = "BUY";
    while (left > 0 && book.length) {
      const lot = book[0], take = Math.min(left, lot.contracts), share = lot.contracts ? take / lot.contracts : 0;
      entryNotional += lot.entry * take;
      entryFee += lot.fee * share;
      lot.fee *= 1 - share;
      lot.contracts -= take;
      openedAt = Math.min(openedAt, lot.openedAt);
      side = lot.side;
      matched += take;
      left -= take;
      if (lot.contracts <= 1e-8) book.shift();
    }
    const charges = Math.max(0, event.fee) + entryFee;
    trades.push({
      id: `global:${prefix}:${event.id}`,
      symbol: event.symbol,
      product: pnlDay(openedAt) === pnlDay(event.at) ? "INTRADAY" : "DELIVERY",
      quantity: event.contracts,
      entryPrice: matched ? entryNotional / matched : event.price,
      exitPrice: event.price,
      grossPnl: event.pnl,
      charges,
      netPnl: event.pnl - event.fee - entryFee,
      closedAt: event.at,
      openedAt,
      direction: side === "BUY" ? "LONG" : "SHORT",
      sourceOrderIds: [],
    });
  }
  return trades;
}

export function globalClosedTrades(account: Pick<PerpAccount, "events" | "optionEvents"> | null): ClosedPaperTrade[] {
  if (!account) return [];
  return [...closes(account.events ?? [], "perp"), ...closes(account.optionEvents ?? [], "option")].sort((a, b) => a.closedAt - b.closedAt || a.id.localeCompare(b.id));
}
