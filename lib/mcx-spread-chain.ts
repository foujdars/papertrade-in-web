import { nseDate } from "./market-hours.ts";
import type { McxMasterRow } from "./mcx.ts";
import { bookPrices, positiveQuote, type SpreadContract, type SpreadSeries } from "./vertical-spread.ts";

export const MCX_SPREAD_PRODUCTS = {
  GOLD: { label: "Gold", multiplier: 100, unit: "₹ per 10 g" },
  GOLDM: { label: "Gold Mini", multiplier: 10, unit: "₹ per 10 g" },
  SILVER: { label: "Silver", multiplier: 30, unit: "₹ per kg" },
  SILVERM: { label: "Silver Mini", multiplier: 5, unit: "₹ per kg" },
} as const;

export type McxSpreadRoot = keyof typeof MCX_SPREAD_PRODUCTS;
export const isMcxSpreadRoot = (value: string): value is McxSpreadRoot => Object.hasOwn(MCX_SPREAD_PRODUCTS, value);

export type McxOptionMasterRow = McxMasterRow & { asset_key?: string; asset_symbol?: string; strike_price?: number };

type DepthLevel = { price?: number; quantity?: number };
export type McxOptionQuote = {
  instrument_token?: string;
  last_price?: number;
  depth?: { buy?: DepthLevel[]; sell?: DepthLevel[] };
};

const mcxKey = /^MCX_FO\|\d+$/;

export function mcxSpreadDirectory(master: McxOptionMasterRow[], root: McxSpreadRoot, now = new Date()) {
  const today = nseDate(now);
  const futures = new Map(master.filter(row => row.instrument_type === "FUT" && mcxKey.test(row.instrument_key ?? ""))
    .map(row => [row.instrument_key!, row]));
  const contracts = new Map<string, SpreadContract>();
  const series = new Map<string, SpreadSeries & { futureKey?: string }>();

  for (const row of master) {
    const kind = row.instrument_type;
    const key = row.instrument_key;
    if (!key || !mcxKey.test(key) || row.segment !== "MCX_FO" || (kind !== "CE" && kind !== "PE")) continue;
    const candidateRoot = [row.trading_symbol?.split(/\s+/)[0], row.underlying_symbol, row.asset_symbol, row.name]
      .find((value): value is McxSpreadRoot => Boolean(value && isMcxSpreadRoot(value)));
    if (candidateRoot !== root) continue;

    const strike = positiveQuote(row.strike_price);
    const expiryTime = positiveQuote(row.last_trading_date) ?? positiveQuote(row.expiry);
    if (!strike || !expiryTime) continue;
    const date = new Date(expiryTime);
    if (!Number.isFinite(date.getTime())) continue;
    const expiry = nseDate(date);
    if (expiry < today) continue;

    const futureKey = [row.underlying_key, row.asset_key].find(key => key && futures.has(key));
    const id = futureKey ? `${expiry}~${futureKey}` : expiry;
    const future = futureKey ? futures.get(futureKey) : undefined;
    series.set(id, { id, expiry, detail: future?.trading_symbol, futureKey });
    contracts.set(key, { id: key, symbol: row.trading_symbol, exchangeLot: positiveQuote(row.lot_size) ?? undefined, series: id, strike, kind, multiplier: MCX_SPREAD_PRODUCTS[root].multiplier, bid: null, ask: null, last: null });
  }

  return {
    contracts: [...contracts.values()].sort((a, b) => a.strike - b.strike),
    series: [...series.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function mcxSpreadQuote(contract: SpreadContract, quote?: McxOptionQuote): SpreadContract {
  if (!quote || quote.instrument_token !== contract.id) return contract;
  const bid = quote.depth?.buy?.[0];
  const ask = quote.depth?.sell?.[0];
  return { ...contract, ...bookPrices(bid?.price, ask?.price, bid?.quantity, ask?.quantity), last: positiveQuote(quote.last_price) };
}
