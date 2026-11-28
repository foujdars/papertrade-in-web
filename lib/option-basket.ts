import { initialStrikes, positiveQuote, SPREADS, type Greek, type PremiumSource, type SpreadContract, type SpreadId, type StrategyContract } from "./vertical-spread.ts";

export type BasketSide = "BUY" | "SELL";
export type BasketLeg = { id: string; side: BasketSide; lots: string; manual: string; enabled?: boolean };
export type PricedLeg = { contract: StrategyContract; side: BasketSide; lots: number; premium: number };

export function legPrice(leg: BasketLeg, contract: StrategyContract, source: PremiumSource) {
  if (source === "manual") return leg.manual.trim() ? Number(leg.manual) : null;
  return source === "last" ? contract.last : leg.side === "BUY" ? contract.ask : contract.bid;
}

export function priceBasket(legs: BasketLeg[], contracts: Map<string, StrategyContract>, source: PremiumSource, multiplier: number) {
  if (!Number.isSafeInteger(multiplier) || multiplier < 1 || multiplier > 100_000) throw new Error("Enter a whole strategy multiplier from 1 to 100,000.");
  return legs.filter(leg => leg.enabled !== false).map(leg => {
    const contract = contracts.get(leg.id);
    if (!contract) throw new Error("A selected contract is no longer listed. Remove it or turn it off.");
    const premium = legPrice(leg, contract, source);
    if (premium === null) throw new Error("A selected leg has no price. Change its pricing source or turn it off.");
    const lots = Number(leg.lots);
    if (!Number.isSafeInteger(lots) || lots < 1) throw new Error("Enter a positive whole number of lots for each leg.");
    return { contract, side: leg.side, lots: lots * multiplier, premium };
  });
}

export const volatilityPresets = { straddle: "Long straddle", strangle: "Long strangle", condor: "Iron condor" } as const;
export type BasketPreset = SpreadId | keyof typeof volatilityPresets;

export function presetLegs(contracts: SpreadContract[], preset: BasketPreset, reference: number | null, source: PremiumSource): BasketLeg[] {
  const draft = (contract: SpreadContract, side: BasketSide) => ({
    id: contract.id, side, lots: "1", manual: String((side === "BUY" ? contract.ask : contract.bid) ?? contract.last ?? ""),
  });
  if (Object.hasOwn(SPREADS, preset)) {
    const { buy, sell } = initialStrikes(contracts, preset as SpreadId, reference, source);
    const long = contracts.find(item => item.id === buy), short = contracts.find(item => item.id === sell);
    if (long && short) return [draft(long, "BUY"), draft(short, "SELL")];
  } else {
    const listed = contracts.filter(item => positiveQuote(item.multiplier)).sort((a,b) => a.strike - b.strike);
    const spot = reference ?? listed[Math.floor(listed.length / 2)]?.strike;
    const usable = (c: SpreadContract, side: BasketSide) => source === "manual" || (source === "last" ? c.last : side === "BUY" ? c.ask : c.bid) !== null;
    for (const size of new Set(listed.map(c => c.multiplier))) {
      const same = listed.filter(c => c.multiplier === size);
      const calls = same.filter(c => c.kind === "CE"), puts = same.filter(c => c.kind === "PE");
      if (preset === "straddle") {
        const paired = calls.filter(c => usable(c, "BUY")).sort((a,b) => Math.abs(a.strike-spot) - Math.abs(b.strike-spot));
        for (const call of paired) {
          const put = puts.find(c => c.strike === call.strike && usable(c, "BUY"));
          if (put) return [draft(call, "BUY"), draft(put, "BUY")];
        }
      } else {
        const side = preset === "condor" ? "SELL" : "BUY";
        const put = puts.filter(c => c.strike < spot && usable(c, side)).at(-1);
        const call = calls.find(c => c.strike > spot && usable(c, side));
        if (!put || !call) continue;
        if (preset === "strangle") return [draft(put, side), draft(call, side)];
        const lower = puts.filter(c => c.strike < put.strike && usable(c, "BUY")).at(-1);
        const upper = calls.find(c => c.strike > call.strike && usable(c, "BUY"));
        if (lower && upper) return [draft(lower, "BUY"), draft(put, side), draft(call, side), draft(upper, "BUY")];
      }
    }
  }
  throw new Error("This expiry has too few matching strikes for that preset.");
}

export function selectBasketLeg(legs: BasketLeg[], id: string, side: BasketSide): BasketLeg[] {
  const existing = legs.find(leg => leg.id === id);
  if (!existing) return [...legs, { id, side, lots: "1", manual: "" }];
  if (existing.enabled === false) return legs.map(leg => leg.id === id ? { ...leg, side, enabled: true } : leg);
  if (existing.side === side) return legs.filter(leg => leg.id !== id);
  return legs.map(leg => leg.id === id ? { ...leg, side } : leg);
}

export function basketPayoff(legs: PricedLeg[]) {
  if (!legs.length) throw new Error("Select a contract to see its payoff.");
  const ids = new Set<string>();
  for (const { contract, lots, premium } of legs) {
    if (contract.series !== legs[0].contract.series || ids.has(contract.id)) throw new Error("Use distinct contracts from one expiry.");
    if ((contract.kind !== "FUT" && !positiveQuote(contract.strike)) || !positiveQuote(contract.multiplier)) throw new Error("A verified contract multiplier and strike are required.");
    if (!Number.isSafeInteger(lots) || lots < 1 || lots > 100_000) throw new Error("Lots must be a whole number from 1 to 100,000.");
    if (!Number.isFinite(premium) || premium < 0) throw new Error("Enter a valid premium for each leg.");
    if (contract.kind === "FUT" && !positiveQuote(premium)) throw new Error("Enter a positive futures entry price.");
    ids.add(contract.id);
  }

  const positions = legs.map(({contract, lots, side, premium}) => ({
    strike: contract.kind === "FUT" ? premium : contract.strike, kind: contract.kind, units: lots * contract.multiplier! * (side === "BUY" ? 1 : -1), premium,
  }));
  const debit = positions.reduce((sum, leg) => leg.kind === "FUT" ? sum : sum + leg.premium * leg.units, 0);
  function payoff(price: number) {
    return positions.reduce((sum, leg) => sum + leg.units * (leg.kind === "FUT" ? price - leg.premium :
      Math.max(0, leg.kind === "CE" ? price - leg.strike : leg.strike - price)), -debit);
  }
  const strikes = [...new Set(positions.map(leg => leg.strike))].sort((a,b) => a-b);
  const prices = [0, ...strikes];
  const values = prices.map(payoff);
  const calls = positions.filter(leg => leg.kind !== "PE");
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

export function legGreek(leg: PricedLeg, greek: Greek) {
  const unit = leg.contract.kind === "FUT" ? Number(greek === "delta") : leg.contract.greeks?.[greek];
  return unit == null ? null : unit * leg.lots * leg.contract.multiplier! * (leg.side === "BUY" ? 1 : -1);
}

// Standard normal CDF, Abramowitz & Stegun 26.2.17.
function normalCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const polynomial = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = Math.exp(-x*x / 2) / Math.sqrt(2*Math.PI) * polynomial;
  return x < 0 ? upper : 1 - upper;
}

/** Scenario valuation at unchanged per-leg IV and zero rates, dividends and futures basis. */
export function targetPayoff(legs: PricedLeg[], price: number, years: number): number | null {
  let total = 0;
  for (const {contract, side, lots, premium} of legs) {
    let value = price;
    if (contract.kind !== "FUT") {
      const sign = contract.kind === "CE" ? 1 : -1;
      value = Math.max(0, sign * (price - contract.strike));
      if (years > 0 && price > 0) {
        if (!positiveQuote(contract.iv)) return null;
        const volatility = contract.iv! * Math.sqrt(years);
        const d1 = Math.log(price / contract.strike) / volatility + volatility / 2;
        value = Math.max(0, sign * (price * normalCdf(sign*d1) - contract.strike * normalCdf(sign*(d1-volatility))));
      }
    }
    total += (value - premium) * (side === "BUY" ? 1 : -1) * lots * contract.multiplier!;
  }
  return total;
}
