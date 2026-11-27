import { positiveQuote, type SpreadContract } from "./vertical-spread.ts";

export type BasketSide = "BUY" | "SELL";
export type BasketLeg = { id: string; side: BasketSide; lots: string; manual: string };
export type PricedLeg = { contract: SpreadContract; side: BasketSide; lots: number; premium: number };

export function selectBasketLeg(legs: BasketLeg[], id: string, side: BasketSide): BasketLeg[] {
  const existing = legs.find(leg => leg.id === id);
  if (!existing) return [...legs, { id, side, lots: "1", manual: "" }];
  if (existing.side === side) return legs.filter(leg => leg.id !== id);
  return legs.map(leg => leg.id === id ? { ...leg, side } : leg);
}

export function basketPayoff(legs: PricedLeg[]) {
  if (!legs.length) throw new Error("Choose a call or put from the chain.");
  const ids = new Set<string>();
  for (const { contract, lots, premium } of legs) {
    if (contract.series !== legs[0].contract.series || ids.has(contract.id)) throw new Error("Use distinct contracts from one expiry.");
    if (!positiveQuote(contract.strike) || !positiveQuote(contract.multiplier)) throw new Error("A verified contract multiplier and strike are required.");
    if (!Number.isSafeInteger(lots) || lots < 1 || lots > 100_000) throw new Error("Lots must be a whole number from 1 to 100,000.");
    if (!Number.isFinite(premium) || premium < 0) throw new Error("Enter a valid premium for each leg.");
    ids.add(contract.id);
  }

  const positions = legs.map(({contract, lots, side, premium}) => ({
    strike: contract.strike, kind: contract.kind, units: lots * contract.multiplier! * (side === "BUY" ? 1 : -1), premium,
  }));
  const debit = positions.reduce((sum, leg) => sum + leg.premium * leg.units, 0);
  function payoff(price: number) {
    return positions.reduce((sum, leg) => sum + leg.units *
      Math.max(0, leg.kind === "CE" ? price - leg.strike : leg.strike - price), -debit);
  }
  const strikes = [...new Set(positions.map(leg => leg.strike))].sort((a,b) => a-b);
  const prices = [0, ...strikes];
  const values = prices.map(payoff);
  const calls = positions.filter(leg => leg.kind === "CE");
  const slope = calls.reduce((sum, leg) => sum + leg.units, 0);
  const slopeTolerance = Number.EPSILON * calls.reduce((sum, leg) => sum + Math.abs(leg.units), 0) * 8;
  const tail = Math.abs(slope) <= slopeTolerance ? 0 : slope;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(debit), ...values.map(Math.abs)) * 16;
  const breakEvens: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    const y = values[i], next = values[i+1];
    if (Math.abs(y) <= tolerance) {
      // Report endpoints of a flat zero-P&L interval only where it meets a nonzero segment.
      if ((i > 0 && Math.abs(values[i-1]) > tolerance) || (next !== undefined && Math.abs(next) > tolerance) || (next === undefined && tail !== 0)) breakEvens.push(prices[i]);
    } else if (next !== undefined && Math.abs(next) > tolerance && Math.sign(next) !== Math.sign(y)) {
      breakEvens.push(prices[i] - y * (prices[i+1] - prices[i]) / (next - y));
    } else if (next === undefined && tail && y * tail < 0) breakEvens.push(prices[i] - y / tail);
  }
  return {
    debit, strikes, breakEvens, payoff,
    maxProfit: tail > 0 ? Infinity : Math.max(0, ...values),
    maxLoss: tail < 0 ? Infinity : Math.max(0, ...values.map(value => -value)),
  };
}
