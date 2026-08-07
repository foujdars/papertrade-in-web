import { calculateUpstoxTradingCharges, type EquityChargeBreakdown } from "./trading-charges.ts";

export type PaperOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "COMPLETE";
  time: string;
  product?: "INTRADAY" | "DELIVERY";
  createdAt?: number;
  charges?: EquityChargeBreakdown;
  autoSquareOff?: boolean;
  squareOffPolicy?: string;
  exitReason?: "TARGET" | "STOP_LOSS" | "MANUAL" | "AUTO_SQUARE_OFF";
  priceSource?: "UPSTOX_QUOTE" | "UPSTOX_CANDLE";
  instrumentKey?: string;
  instrumentName?: string;
  assetType?: "EQUITY" | "INDEX" | "OPTION" | "FUTURE";
  optionType?: "CE" | "PE";
  strikePrice?: number;
  expiry?: string;
  lotSize?: number;
  underlyingKey?: string;
  underlyingSymbol?: string;
};

export type PaperPosition = {
  symbol: string;
  side: "LONG" | "SHORT" | "FLAT";
  quantity: number;
  averagePrice: number;
  livePrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  returnPercent: number;
};

export type PaperProtection = {
  id: string;
  symbol: string;
  product: "INTRADAY" | "DELIVERY";
  side: "LONG" | "SHORT";
  targetPrice?: number;
  stopLossPrice?: number;
  createdAt: number;
};

const PAPER_PROTECTIONS_STORAGE_KEY = "papertrade-protections";

export function readPaperOrders(): PaperOrder[] {
  try {
    const value = JSON.parse(localStorage.getItem("papertrade-orders") ?? "[]") as PaperOrder[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function writePaperOrders(orders: PaperOrder[]) {
  localStorage.setItem("papertrade-orders", JSON.stringify(orders));
  window.dispatchEvent(new CustomEvent("papertrade-orders-updated", { detail: orders }));
}

export function readPaperProtections(): PaperProtection[] {
  try {
    const value = JSON.parse(localStorage.getItem(PAPER_PROTECTIONS_STORAGE_KEY) ?? "[]") as PaperProtection[];
    return Array.isArray(value) ? value.filter((item) => item?.id && item?.symbol && item?.product && item?.side) : [];
  } catch {
    return [];
  }
}

export function writePaperProtections(protections: PaperProtection[]) {
  localStorage.setItem(PAPER_PROTECTIONS_STORAGE_KEY, JSON.stringify(protections));
}

function paperOrderTimestamp(order: PaperOrder) {
  const idTimestamp = Number(order.id);
  return order.createdAt ?? (Number.isFinite(idTimestamp) && idTimestamp > 1_000_000_000_000 ? idTimestamp : 0);
}

function orderCashEffect(order: PaperOrder) {
  const calculatedCharges = calculateUpstoxTradingCharges(order.assetType, {
    side: order.side,
    product: order.product ?? "INTRADAY",
    quantity: order.quantity,
    price: order.price,
  });
  const charges = order.assetType === "OPTION" || order.assetType === "FUTURE"
    ? calculatedCharges
    : order.charges ?? calculatedCharges;
  return (order.side === "SELL" ? 1 : -1) * order.price * order.quantity * .2 - charges.total;
}

export function deletePaperTradeOrders(orders: PaperOrder[], sourceOrderIds: string[]) {
  const ids = new Set(sourceOrderIds);
  const removedOrders = orders.filter((order) => ids.has(order.id));
  return {
    orders: orders.filter((order) => !ids.has(order.id)),
    removedOrders,
    balanceAdjustment: -removedOrders.reduce((total, order) => total + orderCashEffect(order), 0),
  };
}

export function repairRatnaveerSimulationTrade(orders: PaperOrder[]) {
  const ordered = [...orders].sort((a, b) => paperOrderTimestamp(a) - paperOrderTimestamp(b));
  const idsToRemove = new Set<string>();

  for (const exit of ordered) {
    const exitTimestamp = paperOrderTimestamp(exit);
    const isCorruptedExit = exit.symbol === "RATNAVEER" &&
      exit.side === "BUY" &&
      exit.quantity === 500 &&
      exit.price >= 1_000 &&
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(exitTimestamp)) === "2026-08-05";
    if (!isCorruptedExit) continue;
    const entry = [...ordered].reverse().find((candidate) => {
      const candidateTimestamp = paperOrderTimestamp(candidate);
      return candidate.symbol === exit.symbol &&
        candidate.side === "SELL" &&
        candidate.quantity === exit.quantity &&
        candidate.price > 0 &&
        candidate.price < 1_000 &&
        candidateTimestamp < exitTimestamp &&
        exitTimestamp - candidateTimestamp <= 4 * 60 * 60 * 1_000;
    });
    idsToRemove.add(exit.id);
    if (entry) idsToRemove.add(entry.id);
  }

  const removedOrders = orders.filter((order) => idsToRemove.has(order.id));
  return {
    orders: orders.filter((order) => !idsToRemove.has(order.id)),
    removedOrders,
    balanceAdjustment: -removedOrders.reduce((total, order) => total + orderCashEffect(order), 0),
  };
}

export function getProtectionTrigger(protection: PaperProtection, livePrice: number): "TARGET" | "STOP_LOSS" | null {
  if (!Number.isFinite(livePrice) || livePrice <= 0) return null;
  if (protection.side === "LONG") {
    if (protection.targetPrice && livePrice >= protection.targetPrice) return "TARGET";
    if (protection.stopLossPrice && livePrice <= protection.stopLossPrice) return "STOP_LOSS";
  } else {
    if (protection.targetPrice && livePrice <= protection.targetPrice) return "TARGET";
    if (protection.stopLossPrice && livePrice >= protection.stopLossPrice) return "STOP_LOSS";
  }
  return null;
}

export function calculatePosition(
  orders: PaperOrder[],
  symbol: string,
  livePrice: number,
  product?: "INTRADAY" | "DELIVERY",
): PaperPosition {
  const fills = orders
    .filter((order) =>
      order.symbol === symbol &&
      (!product || (order.product ?? "INTRADAY") === product) &&
      order.status === "COMPLETE" &&
      Number.isFinite(order.quantity) &&
      order.quantity > 0 &&
      Number.isFinite(order.price),
    )
    .sort((a, b) => Number(a.id) - Number(b.id));

  let signedQuantity = 0;
  let averagePrice = 0;
  let realizedPnl = 0;

  for (const fill of fills) {
    const fillDirection = fill.side === "BUY" ? 1 : -1;
    const fillQuantity = Math.abs(fill.quantity);

    if (signedQuantity === 0 || Math.sign(signedQuantity) === fillDirection) {
      const previousQuantity = Math.abs(signedQuantity);
      const combinedQuantity = previousQuantity + fillQuantity;
      averagePrice = combinedQuantity > 0
        ? (averagePrice * previousQuantity + fill.price * fillQuantity) / combinedQuantity
        : 0;
      signedQuantity += fillDirection * fillQuantity;
      continue;
    }

    const positionDirection = Math.sign(signedQuantity);
    const closingQuantity = Math.min(Math.abs(signedQuantity), fillQuantity);
    realizedPnl += (fill.price - averagePrice) * closingQuantity * positionDirection;
    const nextQuantity = signedQuantity + fillDirection * fillQuantity;

    if (nextQuantity === 0) {
      signedQuantity = 0;
      averagePrice = 0;
    } else if (Math.sign(nextQuantity) !== positionDirection) {
      signedQuantity = nextQuantity;
      averagePrice = fill.price;
    } else {
      signedQuantity = nextQuantity;
    }
  }

  const safeLivePrice = Number.isFinite(livePrice) ? livePrice : averagePrice;
  const unrealizedPnl = signedQuantity === 0 ? 0 : (safeLivePrice - averagePrice) * signedQuantity;
  const costBasis = averagePrice * Math.abs(signedQuantity);

  return {
    symbol,
    side: signedQuantity > 0 ? "LONG" : signedQuantity < 0 ? "SHORT" : "FLAT",
    quantity: Math.abs(signedQuantity),
    averagePrice,
    livePrice: safeLivePrice,
    marketValue: safeLivePrice * Math.abs(signedQuantity),
    unrealizedPnl,
    realizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    returnPercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
  };
}
