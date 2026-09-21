import type { PerpQuote } from "./global-markets";

export const isDeltaOptionSymbol = (value: string): boolean =>
  /^[CP]-[A-Z0-9]{2,12}-\d+(?:\.\d+)?-\d{6}$/.test(value);

export const isSafeDeltaContractSymbol = (value: string): boolean =>
  /^[A-Z0-9][A-Z0-9.-]{1,47}$/.test(value);

export type DeltaOptionSpec = {
  contractType: "call_options" | "put_options";
  symbol: string;
  underlying: string;
  strike: number;
  expiry: number;
  lot: number;
  tick: number;
  maker: number;
  taker: number;
  premiumFeeCap: number;
  operational: boolean;
  fetchedAt: number;
};

const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

export function normalizeDeltaOptionSpec(raw: Record<string, any>, symbol: string, now: number): DeltaOptionSpec {
  if (!isDeltaOptionSymbol(symbol) || raw.symbol !== symbol ||
    !["call_options", "put_options"].includes(raw.contract_type) ||
    raw.quoting_asset?.symbol !== "USD" || raw.settling_asset?.symbol !== "USD" ||
    raw.notional_type !== "vanilla" || raw.is_quanto) {
    throw new Error("Unsupported Delta option contract.");
  }
  const spec: DeltaOptionSpec = {
    contractType: raw.contract_type,
    symbol,
    underlying: String(raw.contract_unit_currency ?? ""),
    strike: Number(raw.strike_price),
    expiry: Date.parse(raw.settlement_time),
    lot: Number(raw.contract_value),
    tick: Number(raw.tick_size),
    maker: Number(raw.maker_commission_rate),
    taker: Number(raw.taker_commission_rate),
    premiumFeeCap: Number(raw.product_specs?.premium_commission_rate),
    operational: raw.state === "live" && raw.trading_status === "operational" && !raw.product_specs?.only_reduce_only_orders_allowed && Date.parse(raw.settlement_time) > now,
    fetchedAt: now,
  };
  if (![spec.strike, spec.expiry, spec.lot, spec.tick].every(positive) ||
    !/^[A-Z0-9]{2,12}$/.test(spec.underlying) ||
    ![spec.maker, spec.taker, spec.premiumFeeCap].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error("Incomplete Delta option rules.");
  }
  return spec;
}

export function normalizeDeltaOptionQuote(raw: Record<string, any>, symbol: string): PerpQuote {
  const mark = Number(raw.mark_price);
  const quote: PerpQuote = {
    symbol,
    last: positive(raw.close) ? Number(raw.close) : mark,
    mark,
    index: positive(raw.spot_price) ? Number(raw.spot_price) : undefined,
    bid: Number(raw.quotes?.best_bid),
    ask: Number(raw.quotes?.best_ask),
    bidSize: Number(raw.quotes?.bid_size),
    askSize: Number(raw.quotes?.ask_size),
    funding: 0,
    change: Number.isFinite(Number(raw.ltp_change_24h)) ? Number(raw.ltp_change_24h) : 0,
    at: Number(raw.timestamp) / 1000,
    operational: raw.product_trading_status === "operational",
  };
  if (raw.symbol !== symbol || ![quote.mark, quote.ask, quote.at].every(positive) ||
    !Number.isFinite(quote.bid) || quote.bid < 0 || quote.bid > quote.ask ||
    ![quote.bidSize, quote.askSize].every(value => Number.isFinite(value) && value >= 0)) {
    throw new Error("Delta option quote unavailable.");
  }
  return quote;
}

export function normalizeDeltaSettlement(raw: Record<string, any>, symbol: string): number | null {
  const value = Number(raw.settlement_price);
  return raw.symbol === symbol && ["expired", "settled"].includes(raw.state) &&
    raw.settlement_price !== null && Number.isFinite(value) && value >= 0 ? value : null;
}
