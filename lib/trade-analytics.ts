import type { PaperOrder } from "./paper-trading.ts";
import { calculateUpstoxTradingCharges } from "./trading-charges.ts";

export type ClosedPaperTrade = {
  id: string;
  symbol: string;
  product: "INTRADAY" | "DELIVERY";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  closedAt: number;
  sourceOrderIds: string[];
};

type OpenLeg = {
  signedQuantity: number;
  averagePrice: number;
  entryCharges: number;
  entryOrderIds: string[];
};

function orderTimestamp(order: PaperOrder) {
  const idTimestamp = Number(order.id);
  return order.createdAt ?? (Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : 0);
}

export function getOrderCharges(order: PaperOrder) {
  const calculatedCharges = calculateUpstoxTradingCharges(order.assetType, {
    side: order.side,
    product: order.product ?? "INTRADAY",
    quantity: order.quantity,
    price: order.price,
  });
  return order.assetType === "OPTION" || order.assetType === "FUTURE"
    ? calculatedCharges
    : order.charges ?? calculatedCharges;
}

export function buildClosedTrades(orders: PaperOrder[]) {
  const positions = new Map<string, OpenLeg>();
  const trades: ClosedPaperTrade[] = [];
  const chronological = [...orders].sort((a, b) => orderTimestamp(a) - orderTimestamp(b) || Number(a.id) - Number(b.id));

  for (const order of chronological) {
    const direction = order.side === "BUY" ? 1 : -1;
    const quantity = Math.max(0, order.quantity);
    if (!quantity || !Number.isFinite(order.price)) continue;
    const key = `${order.symbol}:${order.product ?? "INTRADAY"}`;
    const leg = positions.get(key) ?? { signedQuantity: 0, averagePrice: 0, entryCharges: 0, entryOrderIds: [] };
    const orderCharges = getOrderCharges(order).total;

    if (leg.signedQuantity === 0 || Math.sign(leg.signedQuantity) === direction) {
      const previousQuantity = Math.abs(leg.signedQuantity);
      const combinedQuantity = previousQuantity + quantity;
      leg.averagePrice = combinedQuantity ? (leg.averagePrice * previousQuantity + order.price * quantity) / combinedQuantity : 0;
      leg.signedQuantity += direction * quantity;
      leg.entryCharges += orderCharges;
      leg.entryOrderIds.push(order.id);
      positions.set(key, leg);
      continue;
    }

    const positionDirection = Math.sign(leg.signedQuantity);
    const openQuantity = Math.abs(leg.signedQuantity);
    const closingQuantity = Math.min(openQuantity, quantity);
    const allocatedEntryCharges = openQuantity ? leg.entryCharges * (closingQuantity / openQuantity) : 0;
    const allocatedExitCharges = orderCharges * (closingQuantity / quantity);
    const grossPnl = (order.price - leg.averagePrice) * closingQuantity * positionDirection;
    const charges = allocatedEntryCharges + allocatedExitCharges;
    trades.push({
      id: order.id,
      symbol: order.symbol,
      product: order.product ?? "INTRADAY",
      quantity: closingQuantity,
      entryPrice: leg.averagePrice,
      exitPrice: order.price,
      grossPnl,
      charges,
      netPnl: grossPnl - charges,
      closedAt: orderTimestamp(order),
      sourceOrderIds: [...new Set([...leg.entryOrderIds, order.id])],
    });

    leg.entryCharges -= allocatedEntryCharges;
    const nextQuantity = leg.signedQuantity + direction * quantity;
    if (nextQuantity === 0) {
      positions.delete(key);
    } else if (Math.sign(nextQuantity) !== positionDirection) {
      const reversingQuantity = Math.abs(nextQuantity);
      leg.signedQuantity = nextQuantity;
      leg.averagePrice = order.price;
      leg.entryCharges = orderCharges * (reversingQuantity / quantity);
      leg.entryOrderIds = [order.id];
      positions.set(key, leg);
    } else {
      leg.signedQuantity = nextQuantity;
      positions.set(key, leg);
    }
  }

  return trades.sort((a, b) => b.closedAt - a.closedAt);
}
