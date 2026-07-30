export type PaperOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "COMPLETE";
  time: string;
  product?: "INTRADAY" | "DELIVERY";
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

export function calculatePosition(
  orders: PaperOrder[],
  symbol: string,
  livePrice: number,
): PaperPosition {
  const fills = orders
    .filter((order) =>
      order.symbol === symbol &&
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
