import type { PaperOrder } from "./paper-trading.ts";

const istDay = (time: number) => Math.floor((time + 19_800_000) / 86_400_000);
const timestamp = (order: PaperOrder) => order.createdAt ?? (Number(order.id) > 1e12 ? Number(order.id) : 0);

/** Today's additions are valued from their fill, not yesterday's close; disposals consume oldest lots. */
export function holdingPerformance(orders: PaperOrder[], symbol: string, livePrice: number, previousClose: number | null, now: number) {
  const lots: { quantity: number; price: number; time: number }[] = [];
  const fills = orders.filter(o => o.symbol === symbol && o.product === "DELIVERY" && o.status === "COMPLETE" && o.quantity > 0 && Number.isFinite(o.price)).sort((a,b) => timestamp(a) - timestamp(b));
  for (const fill of fills) {
    if (fill.side === "BUY") lots.push({ quantity: fill.quantity, price: fill.price, time: timestamp(fill) });
    else {
      let remaining = fill.quantity;
      for (const lot of lots) { const closed = Math.min(remaining, lot.quantity); lot.quantity -= closed; remaining -= closed; if (!remaining) break; }
    }
  }
  const open = lots.filter(l => l.quantity > 0);
  const dates = open.filter(l => l.time > 0).map(l => l.time);
  const dayPnl = open.reduce((sum, lot) => {
    const today = lot.time > 0 && istDay(lot.time) === istDay(now);
    const base = today ? lot.price : previousClose;
    return sum + (Number.isFinite(livePrice) && base !== null && Number.isFinite(base) && base > 0 ? (livePrice - base) * lot.quantity : 0);
  }, 0);
  return { dayPnl, purchasedAt: dates.length ? Math.min(...dates) : null, latestPurchaseAt: dates.length ? Math.max(...dates) : null };
}
