import type { Instrument } from "./market";
export type PriceRequest = { instrument: Instrument; price: number; mode?: "alert" | "order"; side?: "BUY" | "SELL"; orderType?: "Limit" | "SL" };
export type PriceTask = {
  id: string; instrument: Instrument; kind: "alert" | "order"; price: number;
  condition: "above" | "below"; side: "BUY" | "SELL"; orderType: "Limit" | "SL";
  quantity: number; product: "DELIVERY" | "INTRADAY"; createdAt: number; expiresAt: number;
  status: "pending" | "triggered" | "filled" | "cancelled" | "expired" | "rejected"; message?: string;
};
export function priceTaskError(task: Pick<PriceTask, "instrument" | "price" | "quantity" | "kind">) {
  if (!Number.isFinite(task.price) || task.price < 0.01 || Math.abs(task.price * 100 - Math.round(task.price * 100)) > 0.00001) return "Enter a positive price with no more than two decimal places.";
  if (task.kind === "alert") return null;
  if (task.instrument.assetType === "INDEX") return "Indices cannot be traded directly. Select a stock or derivative.";
  const lot = Math.max(1, task.instrument.lotSize ?? 1);
  if (!Number.isSafeInteger(task.quantity) || task.quantity < 1 || task.quantity % lot !== 0) return `Quantity must be a positive multiple of ${lot}.`;
  return null;
}
export function priceTaskMatches(task: PriceTask, price: number) {
  if (!Number.isFinite(price) || price <= 0 || task.status !== "pending") return false;
  const above = task.kind === "alert" ? task.condition === "above" : task.orderType === "Limit" ? task.side === "SELL" : task.side === "BUY";
  return above ? price >= task.price : price <= task.price;
}
export function freshTaskQuote(q: { lastPrice?: number; updatedAt?: string; lastTradeAt?: string } | undefined, now: number) {
  const time = Date.parse(q?.lastTradeAt ?? q?.updatedAt ?? "");
  return Boolean(q && Number.isFinite(q.lastPrice) && q.lastPrice! > 0 && Number.isFinite(time) && time <= now + 5000 && now - time < 90000);
}
