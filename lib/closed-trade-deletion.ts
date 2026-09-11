import { deletePaperTradeOrders, type PaperOrder } from "./paper-trading.ts";
import { buildClosedTrades } from "./trade-analytics.ts";

/** Validate the full batch before changing any fills or account totals. */
export function prepareClosedTradeDeletion(orders: PaperOrder[], tradeIds: string[]) {
  const ids = new Set(tradeIds);
  const allTrades = buildClosedTrades(orders);
  const trades = allTrades.filter((trade) => ids.has(trade.id));
  const sourceIds = new Set(trades.flatMap((trade) => trade.sourceOrderIds));
  const deletion = deletePaperTradeOrders(orders, [...sourceIds]);
  let error = "";
  if (!ids.size || trades.length !== ids.size) {
    error = "The trade history has changed. Cancel and select the trades again.";
  } else if (allTrades.some((trade) => !ids.has(trade.id) && trade.sourceOrderIds.some((id) => sourceIds.has(id)))) {
    error = "These trades share entry or exit fills with other closed trades. Select those related trades too, using All, to keep your records consistent.";
  } else {
    const exposure = new Map<string, number>();
    for (const order of deletion.removedOrders) {
      const key = `${order.symbol}:${order.product ?? "INTRADAY"}`;
      exposure.set(key, (exposure.get(key) ?? 0) + (order.side === "BUY" ? 1 : -1) * order.quantity);
    }
    if ([...exposure.values()].some((quantity) => Math.abs(quantity) > 1e-8)) {
      error = "These fills are still linked to an open position. Close that position before deleting its trade history.";
    }
  }
  return { ...deletion, trades, error };
}
