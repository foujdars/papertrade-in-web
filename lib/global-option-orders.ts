import { availablePerpCash, type PerpAccount, type PerpQuote } from "./global-markets.ts";
import { isDeltaOptionSymbol, type DeltaOptionSpec } from "./global-contracts.ts";

export type OptionPosition = {
  symbol: string;
  side: "BUY" | "SELL";
  contracts: number;
  entry: number;
  margin: number;
  leverage: number;
  openedAt: number;
  spec: DeltaOptionSpec;
};
export type OptionOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  contracts: number;
  limit: number;
  leverage: number;
  reduceOnly: boolean;
  reserve: number;
  at: number;
  spec: DeltaOptionSpec;
};
export type OptionEvent = {
  id: string;
  symbol: string;
  kind: "OPEN" | "CLOSE" | "SETTLEMENT" | "LIQUIDATION" | "CANCEL";
  at: number;
  contracts: number;
  price: number;
  pnl: number;
  fee: number;
  detail: string;
};
export type OptionSnapshot = { spec: DeltaOptionSpec; quote: PerpQuote };
export type OptionObservation = { snapshot?: OptionSnapshot; settlement?: number };

const positions = (account: PerpAccount) => account.optionPositions ?? [];
const orders = (account: PerpAccount) => account.optionOrders ?? [];
const events = (account: PerpAccount) => account.optionEvents ?? [];
const positive = (value: number) => Number.isFinite(value) && value > 0;
export const optionPnl = (position: OptionPosition, price: number) =>
  (price - position.entry) * position.contracts * position.spec.lot * (position.side === "BUY" ? 1 : -1);
export const freshOptionQuote = (quote: PerpQuote | undefined, now: number): quote is PerpQuote =>
  !!quote && quote.operational && positive(quote.mark) && positive(quote.ask) &&
  Number.isFinite(quote.bid) && quote.bid >= 0 && quote.bid <= quote.ask &&
  quote.at <= now + 5000 && now - quote.at <= 30000;
export function optionFee(spec: DeltaOptionSpec, quote: PerpQuote, premiumPrice: number, contracts: number, maker = false) {
  const premium = premiumPrice * contracts * spec.lot;
  const notional = (quote.index ?? spec.strike) * contracts * spec.lot;
  return Math.min(notional * (maker ? spec.maker : spec.taker), premium * spec.premiumFeeCap) * 1.18;
}
export function optionMargin(spec: DeltaOptionSpec, quote: PerpQuote, side: "BUY" | "SELL", contracts: number, premiumPrice: number, leverage: number) {
  const quantity = contracts * spec.lot;
  if (side === "BUY") return premiumPrice * quantity;
  const spot = quote.index ?? spec.strike;
  const riskBase = spec.contractType === "call_options" ? 2 * spot : spec.strike;
  return Math.max(riskBase * quantity / leverage, spot * quantity * 0.1, premiumPrice * quantity);
}
function record(account: PerpAccount, event: Omit<OptionEvent, "id">): PerpAccount {
  return { ...account, optionEvents: [...events(account), { ...event, id: `${event.at}:${account.revision}:${events(account).length}` }].slice(-2000) };
}
export function validateOptionAccount(account: PerpAccount): PerpAccount {
  const p = positions(account), o = orders(account), e = events(account);
  if (!Array.isArray(p) || !Array.isArray(o) || !Array.isArray(e) || p.length > 100 || o.length > 20 || e.length > 2000) throw new Error("Saved option paper account is invalid.");
  if (new Set(p.map(item => item.symbol)).size !== p.length || new Set(o.map(item => item.id)).size !== o.length) throw new Error("Duplicate option account record.");
  for (const item of p) {
    if (!item || !isDeltaOptionSymbol(item.symbol) || !["BUY", "SELL"].includes(item.side) || !Number.isSafeInteger(item.contracts) || item.contracts < 1 ||
      ![item.entry, item.leverage, item.openedAt, item.margin].every(positive) || item.leverage > 10 ||
      item.spec?.symbol !== item.symbol || !["call_options", "put_options"].includes(item.spec.contractType) ||
      ![item.spec.lot, item.spec.tick, item.spec.strike, item.spec.expiry, item.spec.fetchedAt].every(positive) ||
      ![item.spec.maker, item.spec.taker, item.spec.premiumFeeCap].every(value => Number.isFinite(value) && value >= 0)) throw new Error("Saved option position is invalid.");
  }
  for (const item of o) {
    if (!item || typeof item.id !== "string" || !isDeltaOptionSymbol(item.symbol) || !["BUY", "SELL"].includes(item.side) || !Number.isSafeInteger(item.contracts) || item.contracts < 1 ||
      ![item.limit, item.leverage, item.at].every(positive) || item.leverage > 10 || !Number.isFinite(item.reserve) || item.reserve < 0 || typeof item.reduceOnly !== "boolean" || item.spec?.symbol !== item.symbol ||
      !["call_options", "put_options"].includes(item.spec.contractType) || ![item.spec.lot, item.spec.tick, item.spec.strike, item.spec.expiry].every(positive)) throw new Error("Saved option order is invalid.");
  }
  for (const item of e) {
    if (!item || typeof item.id !== "string" || !isDeltaOptionSymbol(item.symbol) || !["OPEN", "CLOSE", "SETTLEMENT", "LIQUIDATION", "CANCEL"].includes(item.kind) ||
      !positive(item.at) || !Number.isSafeInteger(item.contracts) || item.contracts < 1 || !Number.isFinite(item.price) || item.price < 0 || !Number.isFinite(item.pnl) || !Number.isFinite(item.fee) || item.fee < 0) throw new Error("Saved option history is invalid.");
  }
  const normalized = { ...account, optionPositions: p, optionOrders: o, optionEvents: e };
  if (availablePerpCash(normalized) < -0.000001) throw new Error("Option collateral exceeds the USD wallet.");
  return normalized;
}
export function executeOption(account: PerpAccount, spec: DeltaOptionSpec, quote: PerpQuote, side: "BUY" | "SELL", contracts: number, leverage: number, now: number): PerpAccount {
  if (account.currency !== "USD" || !spec.operational || spec.expiry <= now || spec.symbol !== quote.symbol || now - spec.fetchedAt > 3600000 || !freshOptionQuote(quote, now)) throw new Error("Fresh live Delta option data is required.");
  if (!Number.isSafeInteger(contracts) || contracts < 1 || !Number.isSafeInteger(leverage) || leverage < 1 || leverage > 10) throw new Error("Enter whole lots and leverage from 1× to 10×.");
  const price = side === "BUY" ? quote.ask : quote.bid;
  if (!positive(price)) throw new Error("No executable bid or ask is available.");
  if (contracts > (side === "BUY" ? quote.askSize : quote.bidSize)) throw new Error("Order exceeds visible Delta liquidity.");
  const current = positions(account).find(item => item.symbol === spec.symbol);
  if (current && current.side !== side) return closeOption(account, spec.symbol, quote, contracts, now);
  if (!current && positions(account).length >= 100) throw new Error("Maximum 100 open option positions.");
  const margin = optionMargin(spec, quote, side, contracts, price, leverage);
  const fee = optionFee(spec, quote, price, contracts);
  if (margin + fee > availablePerpCash(account) + 1e-8) throw new Error("Insufficient available USD for option premium or collateral.");
  const nextPositions = current
    ? positions(account).map(item => item.symbol === spec.symbol ? { ...item, entry: (item.entry * item.contracts + price * contracts) / (item.contracts + contracts), contracts: item.contracts + contracts, margin: item.margin + margin, leverage, spec } : item)
    : [...positions(account), { symbol: spec.symbol, side, contracts, entry: price, margin, leverage, openedAt: now, spec }];
  const next = { ...account, wallet: account.wallet - fee, revision: account.revision + 1, optionPositions: nextPositions };
  return record(next, { symbol: spec.symbol, kind: "OPEN", at: now, contracts, price, pnl: 0, fee, detail: side === "BUY" ? "Long option · full premium reserved" : "Short option · collateral reserved (estimated)" });
}
export function closeOption(account: PerpAccount, symbol: string, quote: PerpQuote, contracts: number, now: number, kind: "CLOSE" | "LIQUIDATION" = "CLOSE"): PerpAccount {
  const position = positions(account).find(item => item.symbol === symbol);
  if (!position || quote.symbol !== symbol || !freshOptionQuote(quote, now)) throw new Error("Fresh option quote and open position are required.");
  if (now >= position.spec.expiry) throw new Error("This option has expired. Waiting for Delta settlement.");
  if (!Number.isSafeInteger(contracts) || contracts < 1 || contracts > position.contracts) throw new Error("Close lots exceed the open position.");
  if (contracts > (position.side === "BUY" ? quote.bidSize : quote.askSize)) throw new Error("Close exceeds visible Delta liquidity.");
  const price = position.side === "BUY" ? quote.bid : quote.ask;
  const fee = optionFee(position.spec, quote, price, contracts);
  const share = contracts / position.contracts;
  const gross = (price - position.entry) * contracts * position.spec.lot * (position.side === "BUY" ? 1 : -1);
  const net = Math.max(-position.margin * share, gross - fee);
  const remaining = positions(account).map(item => item.symbol === symbol ? { ...item, contracts: item.contracts - contracts, margin: item.margin * (1 - share) } : item).filter(item => item.contracts > 0);
  const next = { ...account, wallet: Math.max(0, account.wallet + net), revision: account.revision + 1, optionPositions: remaining, optionOrders: orders(account).filter(item => item.symbol !== symbol) };
  return record(next, { symbol, kind, at: now, contracts, price, pnl: net + fee, fee, detail: net > gross - fee ? "Isolated paper loss capped at reserved collateral" : "Observed Delta bid/ask" });
}
export function settleOption(account: PerpAccount, symbol: string, settlement: number, now: number): PerpAccount {
  const position = positions(account).find(item => item.symbol === symbol);
  if (!position || !Number.isFinite(settlement) || settlement < 0 || now < position.spec.expiry) return account;
  const quantity = position.contracts;
  const gross = (settlement - position.entry) * quantity * position.spec.lot * (position.side === "BUY" ? 1 : -1);
  const reference = { index: position.spec.strike } as PerpQuote;
  const fee = settlement === 0 ? 0 : optionFee(position.spec, reference, settlement, quantity);
  const net = Math.max(-position.margin, gross - fee);
  const next = { ...account, wallet: Math.max(0, account.wallet + net), revision: account.revision + 1, optionPositions: positions(account).filter(item => item.symbol !== symbol), optionOrders: orders(account).filter(item => item.symbol !== symbol) };
  return record(next, { symbol, kind: "SETTLEMENT", at: now, contracts: quantity, price: settlement, pnl: net + fee, fee, detail: "Delta published option settlement price" });
}
export function placeOptionLimit(account: PerpAccount, spec: DeltaOptionSpec, quote: PerpQuote, side: "BUY" | "SELL", contracts: number, leverage: number, limit: number, now: number): PerpAccount {
  if (account.currency !== "USD" || !spec.operational || spec.expiry <= now || now - spec.fetchedAt > 3600000 || !freshOptionQuote(quote, now) || spec.symbol !== quote.symbol) throw new Error("Live option data is required.");
  if (!Number.isSafeInteger(contracts) || contracts < 1 || !Number.isSafeInteger(leverage) || leverage < 1 || leverage > 10 || !positive(limit) || Math.abs(limit / spec.tick - Math.round(limit / spec.tick)) > 1e-6) throw new Error("Enter valid lots, leverage and a tick-aligned limit price.");
  if (orders(account).length >= 20) throw new Error("Maximum 20 pending option orders.");
  const current = positions(account).find(item => item.symbol === spec.symbol);
  const reduceOnly = !!current && current.side !== side;
  if (reduceOnly && contracts > current!.contracts) throw new Error("Close lots exceed the open position.");
  if (side === "BUY" ? quote.ask <= limit : quote.bid >= limit) return executeOption(account, spec, quote, side, contracts, leverage, now);
  const reserve = reduceOnly ? 0 : optionMargin(spec, quote, side, contracts, limit, leverage) + optionFee(spec, quote, limit, contracts);
  if (reserve > availablePerpCash(account) + 1e-8) throw new Error("Insufficient USD to reserve this option order.");
  const next = { ...account, revision: account.revision + 1, optionOrders: [...orders(account), { id: `${now}:${account.revision + 1}`, symbol: spec.symbol, side, contracts, limit, leverage, reduceOnly, reserve, at: now, spec }] };
  return next;
}
export function cancelOptionLimit(account: PerpAccount, id: string, now: number): PerpAccount {
  const order = orders(account).find(item => item.id === id);
  if (!order) return account;
  return record({ ...account, revision: account.revision + 1, optionOrders: orders(account).filter(item => item.id !== id) }, { symbol: order.symbol, kind: "CANCEL", at: now, contracts: order.contracts, price: order.limit, pnl: 0, fee: 0, detail: "Option limit order cancelled" });
}
export function advanceOptions(account: PerpAccount, observed: Record<string, OptionObservation>, now: number): PerpAccount {
  let next = account;
  for (const position of [...positions(next)]) {
    const entry = observed[position.symbol];
    if (entry?.settlement !== undefined && now >= position.spec.expiry) { next = settleOption(next, position.symbol, entry.settlement, now); continue; }
    if (now >= position.spec.expiry) continue; // Wait for Delta's published settlement; never invent it.
    const quote = entry?.snapshot?.quote;
    if (!freshOptionQuote(quote, now) || quote.at < position.openedAt || position.side !== "SELL") continue;
    const maintenance = Math.max(position.margin * 0.5, optionMargin(position.spec, quote, "SELL", position.contracts, quote.mark, position.leverage) * 0.5);
    if (position.margin + optionPnl(position, quote.mark) <= maintenance) {
      try { next = closeOption(next, position.symbol, quote, position.contracts, now, "LIQUIDATION"); } catch { /* Wait for executable liquidity. */ }
    }
  }
  for (const order of [...orders(next)]) {
    if (!orders(next).some(item => item.id === order.id)) continue;
    if (now >= order.spec.expiry) { next = cancelOptionLimit(next, order.id, now); continue; }
    const quote = observed[order.symbol]?.snapshot?.quote;
    const liveSpec = observed[order.symbol]?.snapshot?.spec;
    if (!freshOptionQuote(quote, now) || quote.at <= order.at) continue;
    if (!liveSpec?.operational || liveSpec.symbol !== order.symbol || liveSpec.expiry !== order.spec.expiry || liveSpec.strike !== order.spec.strike || liveSpec.lot !== order.spec.lot) continue;
    if (order.side === "BUY" ? quote.ask > order.limit : quote.bid < order.limit) continue;
    try {
      const without = { ...next, optionOrders: orders(next).filter(item => item.id !== order.id) };
      next = executeOption(without, liveSpec, quote, order.side, order.contracts, order.leverage, now);
    } catch { /* Leave the reserved order pending until executable. */ }
  }
  return next;
}
