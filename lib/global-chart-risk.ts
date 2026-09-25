import { freshPerpQuote, type PerpAccount, type PerpPosition, type PerpQuote } from "./global-markets.ts";
import { roundGlobalPrice, triggerValue, type GlobalExit, type GlobalProtection } from "./global-order-engine.ts";

export function globalChartLevels(p: PerpPosition) {
  const plan = p.protection;
  const stop = plan?.stopLoss;
  const trail = stop?.mode === "Trail" && stop.anchor && stop.trail
    ? stop.anchor + (p.side === "BUY" ? -stop.trail : stop.trail) : 0;
  return { targetPrice: plan?.takeProfit?.trigger ?? p.target ?? 0, stopLossPrice: stop?.mode === "Trail" ? trail : stop?.trigger ?? p.stop ?? 0 };
}

/** Change only the dragged leg. Keep trigger source, opposite leg and limit offset. */
export function moveGlobalChartLevel(a: PerpAccount, symbol: string, level: "target" | "stopLoss", value: number, q: PerpQuote, now: number): PerpAccount {
  const p = a.positions.find(p => p.symbol === symbol);
  if (!p || !freshPerpQuote(q, now) || q.symbol !== symbol) throw new Error("A position and fresh quote are required to move protection.");
  if (p.protection?.activeExit) throw new Error("An exit has already triggered. Manage it in Positions.");
  const plan: GlobalProtection = p.protection ?? { source: "mark", takeProfit: p.target ? { mode: "Market", trigger: p.target } : undefined, stopLoss: p.stop ? { mode: "Market", trigger: p.stop } : undefined };
  if (!(value > 0)) {
    const key = level === "target" ? "takeProfit" : "stopLoss";
    const field = level === "target" ? "target" : "stop";
    return { ...a, revision: a.revision + 1, positions: a.positions.map(item => item.symbol === symbol ? { ...item, [field]: undefined, protection: { ...plan, [key]: undefined } } : item) };
  }
  const reference = triggerValue(q, plan.source);
  const price = roundGlobalPrice(value, p.spec);
  if (!reference || !Number.isFinite(price) || price <= 0) throw new Error("A valid price and fresh trigger source are required.");
  const above = p.side === "BUY" ? level === "target" : level === "stopLoss";
  if (above ? price <= reference : price >= reference) throw new Error("That level is already crossed by the trigger price. Choose another level.");
  const key = level === "target" ? "takeProfit" : "stopLoss";
  const old = plan[key];
  let leg: GlobalExit = { mode: "Market", trigger: price };
  if (old?.mode === "Limit") {
    const limit = roundGlobalPrice(price + (old.limit! - old.trigger!), p.spec);
    if (limit <= 0) throw new Error("The moved exit limit would be invalid. Adjust it in Positions.");
    leg = { ...old, trigger: price, limit };
  } else if (old?.mode === "Trail") {
    const anchor = old.anchor ?? reference;
    const trail = roundGlobalPrice((anchor - price) * (p.side === "BUY" ? 1 : -1), p.spec);
    if (trail <= 0 || trail >= Math.min(reference, p.entry)) throw new Error("Choose a valid trailing-stop distance.");
    leg = { ...old, anchor, trail };
  }
  return { ...a, revision: a.revision + 1, positions: a.positions.map(item => item.symbol === symbol ? { ...item, stop: undefined, target: undefined, protection: { ...plan, [key]: leg } } : item) };
}
