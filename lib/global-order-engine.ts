import {
  advancePerps, availablePerpCash, cancelPerpOrder, closePerp, freshPerpQuote,
  marginRate, newPerpAccount, openPerp, readPerpAccount, tradingFee, USD_INR,
  type PerpAccount, type PerpOrder, type PerpQuote, type PerpSpec, type PerpSymbol,
} from "./global-markets.ts";

export const GLOBAL_ORDER_TYPES = ["Market", "Limit", "Maker only", "Stop limit", "Stop market", "Trailing stop", "Take profit market", "Take profit limit"] as const;
export type GlobalOrderType = typeof GLOBAL_ORDER_TYPES[number];
export type TriggerSource = "mark" | "last" | "index";
export type SizeUnit = "lots" | "USD" | "asset";
export type GlobalExit = { mode: "Market" | "Limit" | "Trail"; trigger?: number; limit?: number; trail?: number; anchor?: number };
export type GlobalProtection = { source: TriggerSource; takeProfit?: GlobalExit; stopLoss?: GlobalExit; activeExit?: "takeProfit" | "stopLoss" };
export type GlobalOrderFields = {
  type?: GlobalOrderType; trigger?: number; source?: TriggerSource; trail?: number;
  anchor?: number; triggered?: boolean; reduceOnly?: boolean; protection?: GlobalProtection;
};
export type GlobalOrderDraft = GlobalOrderFields & {
  type: GlobalOrderType; side: "BUY" | "SELL"; contracts: number; leverage: number; limit?: number;
};
export const formatUsd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
export const needsLimit = (type: GlobalOrderType) => ["Limit", "Maker only", "Stop limit", "Take profit limit"].includes(type);
export const needsTrigger = (type: GlobalOrderType) => type.startsWith("Stop ") || type.startsWith("Take profit ");
const validPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const tickValid = (value: unknown, spec: PerpSpec) => validPositive(value) && Math.abs(value / spec.tick - Math.round(value / spec.tick)) < 1e-6;
export const roundGlobalPrice = (value: number, spec: PerpSpec) => Number((Math.round(value / spec.tick) * spec.tick).toFixed(10));
export function triggerValue(quote: PerpQuote, source: TriggerSource = "mark") {
  const value = source === "index" ? quote.index : quote[source];
  return validPositive(value) ? value : undefined;
}
/** Dollar entry denotes notional, not margin; always round DOWN to tradable lots. */
export function sizeToContracts(value: number, unit: SizeUnit, spec: PerpSpec, price: number) {
  if (!validPositive(value) || !validPositive(price)) return 0;
  const raw = unit === "lots" ? value : unit === "asset" ? value / spec.lot : value / (spec.lot * price);
  if (unit !== "USD" && Math.abs(raw - Math.round(raw)) > 1e-7) throw new Error(`Use whole lots or asset increments of ${spec.lot}.`);
  const count = unit === "USD" ? Math.floor(raw + 1e-9) : Math.round(raw);
  if (!Number.isSafeInteger(count)) throw new Error("Quantity is too large.");
  return count;
}
export function affordableContracts(account: PerpAccount, spec: PerpSpec, price: number, leverage: number, fraction: number) {
  if (![price, leverage, fraction].every(validPositive) || fraction > 1) return 0;
  const funds = Math.max(0, availablePerpCash(account)) * fraction;
  const each = spec.lot * price;
  const prior = account.positions.find(p => p.symbol === spec.symbol);
  let lo = 0, hi = Math.floor(Math.min(funds / (each / leverage + tradingFee(spec, each, false, "USD")), spec.maxNotional / each));
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2), total = ((prior?.contracts ?? 0) + mid) * each;
    const margin = Math.max(mid * each / leverage, total / leverage - (prior?.margin ?? 0));
    if (total <= spec.maxNotional && 1 / leverage + 1e-12 >= marginRate(spec, total) && margin + tradingFee(spec, mid * each, false, "USD") <= funds) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Legacy rupee practice wallets are converted once, preserving positions/history. */
export function readGlobalAccount(text: string | null): PerpAccount {
  if (!text) return { ...newPerpAccount(), currency: "USD", wallet: 10000 };
  let a = readPerpAccount(text);
  if (a.currency !== undefined && a.currency !== "USD") throw new Error("Unknown global wallet currency.");
  if (!a.currency) a = { ...a, currency: "USD", wallet: a.wallet / USD_INR,
    positions: a.positions.map(p => ({ ...p, currency: "USD", margin: p.margin / USD_INR })),
    orders: a.orders.map(o => ({ ...o, reserve: o.reserve / USD_INR })),
    events: a.events.map(e => ({ ...e, pnl: e.pnl / USD_INR, fee: e.fee / USD_INR })), revision: a.revision + 1 };
  for (const p of a.positions) {
    if (p.currency !== "USD") throw new Error("Inconsistent position currency.");
    if (p.protection) validateProtection(p.protection, p.spec, p.side, p.entry, false);
  }
  for (const o of a.orders) {
    if (o.type && !GLOBAL_ORDER_TYPES.includes(o.type)) throw new Error("Unknown saved order type.");
    if (o.source && !["mark", "last", "index"].includes(o.source)) throw new Error("Unknown trigger source.");
    if (o.type && needsTrigger(o.type) && !validPositive(o.trigger)) throw new Error("Invalid saved trigger.");
    if (o.type === "Trailing stop" && (!validPositive(o.trail) || !validPositive(o.anchor))) throw new Error("Invalid saved trailing stop.");
    if (!Number.isFinite(o.at) || o.at <= 0 || typeof o.id !== "string") throw new Error("Invalid saved order.");
    if (o.protection) validateProtection(o.protection, a.positions.find(p => p.symbol === o.symbol)?.spec, o.side, o.limit, false);
    if (!o.protection && (o.stop || o.target)) o.protection = { source: "mark", stopLoss: o.stop ? { mode: "Market", trigger: o.stop } : undefined, takeProfit: o.target ? { mode: "Market", trigger: o.target } : undefined };
    if (o.reduceOnly !== undefined && typeof o.reduceOnly !== "boolean" || o.triggered !== undefined && typeof o.triggered !== "boolean") throw new Error("Invalid saved order flags.");
  }
  return a;
}
function validateProtection(plan: GlobalProtection, spec: PerpSpec | undefined, side: "BUY" | "SELL", entry: number, checkDirection = true) {
  if (!["mark", "last", "index"].includes(plan.source)) throw new Error("Choose a valid trigger source.");
  if (plan.activeExit && !["takeProfit", "stopLoss"].includes(plan.activeExit)) throw new Error("Invalid exit state.");
  for (const key of ["takeProfit", "stopLoss"] as const) {
    const leg = plan[key];
    if (!leg) continue;
    if (!["Market", "Limit", "Trail"].includes(leg.mode) || key === "takeProfit" && leg.mode === "Trail") throw new Error("Invalid protection type.");
    const price = leg.mode === "Trail" ? leg.trail : leg.trigger;
    if (!(spec ? tickValid(price, spec) : validPositive(price))) throw new Error(`${key === "takeProfit" ? "Target" : "Stop"} must use valid price increments.`);
    if (leg.mode === "Trail" && leg.trail! >= entry) throw new Error("Trail distance must be below entry price.");
    if (leg.mode === "Limit" && !(spec ? tickValid(leg.limit, spec) : validPositive(leg.limit))) throw new Error("Enter a valid exit limit price.");
    if (checkDirection && leg.mode !== "Trail") {
      const above = side === "BUY" ? key === "takeProfit" : key === "stopLoss";
      if (above ? leg.trigger! <= entry : leg.trigger! >= entry) throw new Error(`${key === "takeProfit" ? "Take profit" : "Stop loss"} is on the wrong side of entry.`);
    }
  }
}
const cloneProtection = (plan?: GlobalProtection): GlobalProtection | undefined => plan ? { ...plan, takeProfit: plan.takeProfit ? { ...plan.takeProfit } : undefined, stopLoss: plan.stopLoss ? { ...plan.stopLoss } : undefined } : undefined;
export function setGlobalProtection(a: PerpAccount, symbol: PerpSymbol, plan: GlobalProtection | undefined, q: PerpQuote, now: number) {
  const p = a.positions.find(p => p.symbol === symbol);
  if (!p || !freshPerpQuote(q, now) || q.symbol !== symbol) throw new Error("A position and fresh quote are required.");
  if (plan) {
    validateProtection(plan, p.spec, p.side, q.mark);
    if (!triggerValue(q, plan.source)) throw new Error("Selected trigger price is unavailable.");
  }
  const protection = cloneProtection(plan);
  if (protection) { delete protection.activeExit; if (protection.stopLoss?.mode === "Trail") protection.stopLoss.anchor = triggerValue(q, protection.source); }
  return { ...a, revision: a.revision + 1, positions: a.positions.map(v => v.symbol === symbol ? { ...v, stop: undefined, target: undefined, protection } : v) };
}
function execute(a: PerpAccount, s: PerpSpec, q: PerpQuote, d: GlobalOrderDraft, now: number) {
  if (d.reduceOnly) {
    const p = a.positions.find(p => p.symbol === s.symbol);
    if (!p || p.side === d.side) throw new Error("Reduce only needs an opposite open position.");
    const next = closePerp(a, s.symbol, q, Math.min(d.contracts, p.contracts), now, "CLOSE", `${d.type} · reduce only`, d.type === "Maker only");
    return next;
  }
  let next = openPerp(a, s, q, d.side, d.contracts, d.leverage, now, undefined, undefined, undefined, d.type === "Maker only");
  if (d.protection) {
    const protection = cloneProtection(d.protection)!;
    if (protection.stopLoss?.mode === "Trail") protection.stopLoss.anchor = triggerValue(q, protection.source);
    next = { ...next, positions: next.positions.map(p => p.symbol === s.symbol ? { ...p, protection, stop: undefined, target: undefined } : p) };
  }
  return next;
}
export function submitGlobalOrder(a: PerpAccount, s: PerpSpec, q: PerpQuote, d: GlobalOrderDraft, now: number): PerpAccount {
  if (a.currency !== "USD") throw new Error("Use the dollar global wallet.");
  if (!freshPerpQuote(q, now) || q.symbol !== s.symbol || !s.operational || now - s.fetchedAt > 3600000 || s.fetchedAt > now + 5000) throw new Error("Waiting for fresh Delta market data and contract rules.");
  if (!GLOBAL_ORDER_TYPES.includes(d.type) || !Number.isSafeInteger(d.contracts) || d.contracts < 1 || !validPositive(d.leverage) || d.leverage < 1) throw new Error("Enter valid lots and leverage.");
  if (a.orders.length >= 20 && d.type !== "Market") throw new Error("Maximum 20 open orders.");
  const source = d.source ?? "mark", observed = triggerValue(q, source);
  if (!["mark", "last", "index"].includes(source) || !observed) throw new Error("Selected trigger price is unavailable.");
  const reference = needsLimit(d.type) ? d.limit : needsTrigger(d.type) ? d.trigger : d.side === "BUY" ? q.ask : q.bid;
  if (!validPositive(reference)) throw new Error("Enter the order price.");
  if (needsLimit(d.type) && !tickValid(d.limit, s)) throw new Error(`Limit price must use ${s.tick} USD increments.`);
  if (needsTrigger(d.type)) {
    if (!tickValid(d.trigger, s)) throw new Error(`Trigger must use ${s.tick} USD increments.`);
    const above = d.type.startsWith("Take profit") ? d.side === "SELL" : d.side === "BUY";
    if (above ? d.trigger! <= observed : d.trigger! >= observed) throw new Error(`Trigger must be ${above ? "above" : "below"} the selected ${source} price.`);
  }
  if (d.type === "Trailing stop" && (!tickValid(d.trail, s) || d.trail! >= observed)) throw new Error(`Enter a trail distance below current price, in ${s.tick} USD increments.`);
  if (d.protection) { validateProtection(d.protection, s, d.side, reference); if (!triggerValue(q, d.protection.source)) throw new Error("Protection trigger price is unavailable."); }
  const marketable = d.side === "BUY" ? q.ask <= (d.limit ?? 0) : q.bid >= (d.limit ?? Infinity);
  if (d.type === "Maker only" && marketable) throw new Error("Maker-only order would execute immediately. Move the limit away from market.");
  const prior = a.positions.find(p => p.symbol === s.symbol);
  if (d.reduceOnly && (!prior || prior.side === d.side || d.contracts > prior.contracts)) throw new Error("Reduce-only quantity must fit the opposite open position.");
  if (d.reduceOnly && d.protection) throw new Error("Attach TP/SL to an entry or edit the existing position.");
  if (d.type === "Market" || d.type === "Limit" && marketable) return execute(a, s, q, d, now);
  // Core margin checks reserve funds for pending entries; reduce-only exits need no new margin.
  const pending = d.reduceOnly ? { ...a, orders: [...a.orders], revision: a.revision + 1 } : openPerp(a, s, q, d.side, d.contracts, d.leverage, now, undefined, undefined, roundGlobalPrice(reference, s));
  const o: PerpOrder = { ...d, source, anchor: observed, triggered: false, protection: cloneProtection(d.protection), id: `${now}:${pending.revision}`, symbol: s.symbol, limit: reference, at: now, reserve: d.reduceOnly ? 0 : pending.orders[pending.orders.length - 1].reserve };
  if (d.reduceOnly) pending.orders.push(o); else pending.orders[pending.orders.length - 1] = o;
  return pending;
}
/** Observe current quotes only. Triggered limit orders remain active across price reversals. */
export function advanceGlobalAccount(a: PerpAccount, quotes: Partial<Record<PerpSymbol, PerpQuote>>, specs: Partial<Record<PerpSymbol, PerpSpec>>, now: number) {
  let n = advancePerps(a, quotes, specs, now, false);
  for (const p of [...n.positions]) {
    const q = quotes[p.symbol], plan = cloneProtection(p.protection);
    if (!plan || !freshPerpQuote(q, now) || q.at < p.openedAt) continue;
    const observed = triggerValue(q, plan.source);
    if (!observed) continue;
    const sl = plan.stopLoss;
    if (sl?.mode === "Trail" && !plan.activeExit) {
      sl.anchor = p.side === "BUY" ? Math.max(sl.anchor ?? observed, observed) : Math.min(sl.anchor ?? observed, observed);
      sl.trigger = p.side === "BUY" ? sl.anchor - sl.trail! : sl.anchor + sl.trail!;
    }
    for (const key of ["stopLoss", "takeProfit"] as const) {
      const leg = plan[key];
      if (!leg || plan.activeExit) continue;
      const above = p.side === "BUY" ? key === "takeProfit" : key === "stopLoss";
      if (above ? observed >= leg.trigger! : observed <= leg.trigger!) plan.activeExit = key;
    }
    if (JSON.stringify(plan) !== JSON.stringify(p.protection)) n = { ...n, revision: n.revision + 1, positions: n.positions.map(v => v.symbol === p.symbol ? { ...v, protection: plan } : v) };
    const leg = plan.activeExit && plan[plan.activeExit];
    if (!leg || leg.mode === "Limit" && (p.side === "BUY" ? q.bid < leg.limit! : q.ask > leg.limit!)) continue;
    try { n = closePerp(n, p.symbol, q, p.contracts, now, "CLOSE", `${plan.activeExit} · ${leg.mode} · ${plan.source}`); } catch { /* Retry only when visible liquidity supports execution. */ }
  }
  for (const old of [...n.orders]) {
    if (!n.orders.some(o => o.id === old.id)) continue;
    const q = quotes[old.symbol], s = specs[old.symbol];
    if (!s || !freshPerpQuote(q, now) || q.at <= old.at) continue;
    const o = { ...old }, type = o.type ?? "Limit";
    if (o.reduceOnly) {
      const p = n.positions.find(p => p.symbol === o.symbol);
      if (!p || p.side === o.side) { n = cancelPerpOrder(n, o.id, now); continue; }
    } else if (n.fundingGap) continue;
    const observed = triggerValue(q, o.source);
    if (!observed) continue;
    if (type === "Trailing stop" && !o.triggered) {
      o.anchor = o.side === "SELL" ? Math.max(o.anchor ?? observed, observed) : Math.min(o.anchor ?? observed, observed);
      o.trigger = o.side === "SELL" ? o.anchor - o.trail! : o.anchor + o.trail!;
    }
    if ((needsTrigger(type) || type === "Trailing stop") && !o.triggered) {
      const above = type.startsWith("Take profit") ? o.side === "SELL" : o.side === "BUY";
      o.triggered = above ? observed >= o.trigger! : observed <= o.trigger!;
    }
    if (JSON.stringify(o) !== JSON.stringify(old)) n = { ...n, revision: n.revision + 1, orders: n.orders.map(v => v.id === o.id ? o : v) };
    if ((needsTrigger(type) || type === "Trailing stop") && !o.triggered) continue;
    if (needsLimit(type) && (o.side === "BUY" ? q.ask > o.limit : q.bid < o.limit)) continue;
    try { n = execute({ ...n, orders: n.orders.filter(v => v.id !== o.id) }, s, q, { ...o, type }, now); } catch { /* Reserved order remains pending; no fabricated fills. */ }
  }
  return n;
}
