export type OptionKind = "CE" | "PE";
export type Greek = "delta" | "gamma" | "theta" | "vega";
export type ChainGreeks = Partial<Record<Greek, number | null>>;

export type SpreadContract = {
  id: string;
  series: string;
  symbol?: string;
  exchangeLot?: number;
  strike: number;
  kind: OptionKind;
  multiplier: number | null;
  bid: number | null;
  ask: number | null;
  last: number | null;
  mark?: number | null;
  iv?: number | null; // Annualized volatility as a fraction.
  oi?: number | null;
  greeks?: ChainGreeks;
  bidSize?: number | null;
  askSize?: number | null;
};

export type SpreadFuture = Omit<SpreadContract, "kind" | "strike"> & {
  kind: "FUT";
  symbol: string;
  futureExpiry: string | null; // A null date identifies a perpetual.
};
export type StrategyContract = SpreadContract | SpreadFuture;
export type SpreadSeries = { id: string; expiry: string; detail?: string };
export type SpreadChain = { contracts: SpreadContract[]; reference: number | null; quoteWarning?: string; future?: SpreadFuture };

export const SPREADS = {
  bullCall: { label: "Bull call", flow: "Debit", kind: "CE", buyLower: true },
  bearPut: { label: "Bear put", flow: "Debit", kind: "PE", buyLower: false },
  bullPut: { label: "Bull put", flow: "Credit", kind: "PE", buyLower: true },
  bearCall: { label: "Bear call", flow: "Credit", kind: "CE", buyLower: false },
} as const;

export type SpreadId = keyof typeof SPREADS;
export type PremiumSource = "market" | "last" | "manual";

export function finiteQuote(value: unknown): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function reportedGreeks(raw?: Partial<Record<Greek, unknown>>): ChainGreeks {
  return { delta: finiteQuote(raw?.delta), gamma: finiteQuote(raw?.gamma), theta: finiteQuote(raw?.theta), vega: finiteQuote(raw?.vega) };
}

export function positiveQuote(value: unknown) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function bookPrices(bid: unknown, ask: unknown, bidSize: unknown, askSize: unknown) {
  const prices = { bid: positiveQuote(bidSize) ? positiveQuote(bid) : null, ask: positiveQuote(askSize) ? positiveQuote(ask) : null };
  return prices.bid !== null && prices.ask !== null && prices.bid > prices.ask
    ? { bid: null, ask: null }
    : prices;
}

export function calculateSpread(
  id: SpreadId,
  buy: SpreadContract,
  sell: SpreadContract,
  buyPremium: number,
  sellPremium: number,
  lots: number,
) {
  const preset = SPREADS[id];
  if (buy.series !== sell.series || buy.kind !== preset.kind || sell.kind !== preset.kind ||
      !positiveQuote(buy.strike) || !positiveQuote(sell.strike) ||
      (preset.buyLower ? buy.strike >= sell.strike : buy.strike <= sell.strike)) {
    throw new Error("Select two distinct strikes in the required order for this spread.");
  }
  if (!buy.multiplier || !positiveQuote(buy.multiplier) || buy.multiplier !== sell.multiplier) {
    throw new Error("Both contracts need the same verified lot multiplier.");
  }
  if (!Number.isSafeInteger(lots) || lots < 1 || lots > 100_000) {
    throw new Error("Enter a whole number of lots from 1 to 100,000.");
  }
  if (![buyPremium, sellPremium].every(price => Number.isFinite(price) && price >= 0)) {
    throw new Error("Enter a valid premium for both legs.");
  }

  const lower = Math.min(buy.strike, sell.strike);
  const upper = Math.max(buy.strike, sell.strike);
  const width = upper - lower;
  const debit = buyPremium - sellPremium;
  const isDebit = preset.flow === "Debit";
  const net = isDebit ? debit : -debit;
  if (net <= 0 || net >= width) {
    throw new Error(`The selected premiums must give a net ${preset.flow.toLowerCase()} greater than zero and smaller than the strike width. Check the quotes or enter premiums manually.`);
  }

  const quantity = buy.multiplier * lots;
  const profitPoints = isDebit ? width - net : net;
  const lossPoints = isDebit ? net : width - net;
  const bullish = id === "bullCall" || id === "bullPut";
  const breakEven = bullish ? lower + lossPoints : lower + profitPoints;
  const maxProfit = profitPoints * quantity;
  const maxLoss = lossPoints * quantity;

  function payoff(price: number) {
    const rise = Math.max(0, Math.min(width, price - lower));
    return bullish ? rise * quantity - maxLoss : maxProfit - rise * quantity;
  }

  return { lower, upper, breakEven, quantity, netPremium: net * quantity, maxProfit, maxLoss, payoff };
}

export function initialStrikes(contracts: SpreadContract[], id: SpreadId, reference: number | null, source: PremiumSource) {
  const preset = SPREADS[id];
  const side = contracts.filter(contract => contract.kind === preset.kind).sort((a, b) => a.strike - b.strike);
  const pivot = reference ?? side[Math.floor(side.length / 2)]?.strike ?? 0;
  const candidates = side.slice().sort((a, b) => Math.abs(a.strike - pivot) - Math.abs(b.strike - pivot));
  const getPremium = (contract: SpreadContract, role: "bid" | "ask") => source === "market" ? contract[role] : contract.last;
  let fallback: { buy: string; sell: string } | undefined;

  for (const buy of candidates) {
    const alternatives = preset.buyLower ? side.filter(leg => leg.strike > buy.strike) : side.filter(leg => leg.strike < buy.strike).reverse();
    for (const sell of alternatives) {
      if (!buy.multiplier || buy.multiplier !== sell.multiplier) continue;
      const result = { buy: buy.id, sell: sell.id };
      fallback ??= result;
      if (source === "manual") return result;
      const ask = getPremium(buy, "ask");
      const bid = getPremium(sell, "bid");
      if (ask === null || bid === null) continue;
      const net = preset.flow === "Debit" ? ask - bid : bid - ask;
      if (net > 0 && net < Math.abs(buy.strike - sell.strike)) return result;
    }
  }
  return fallback ?? { buy: "", sell: "" };
}
