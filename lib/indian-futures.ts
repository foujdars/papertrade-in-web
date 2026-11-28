import type { Instrument } from "./market";

const venues = {
  NSE_EQ:"NSE", NSE_INDEX:"NSE", NSE_FO:"NFO", NCD_FO:"CDS", NSE_COM:"NSCOM",
  BSE_EQ:"BSE", BSE_INDEX:"BSE", BSE_FO:"BFO", BCD_FO:"BCD", MCX_FO:"MCX",
} as const;
export type SessionExchange = typeof venues[keyof typeof venues];
export const sessionExchanges = new Set<string>(Object.values(venues));
export function sessionExchange(instrument: {instrumentKey?: string}): SessionExchange {
  const segment = instrument.instrumentKey?.split("|",1)[0] as keyof typeof venues;
  return venues[segment] ?? "NSE";
}
export function isCurrencyFuture(key = "") { return /^(NCD_FO|BCD_FO)\|/.test(key); }
export function isContractPricedFuture(key = "") { return /^(MCX_FO|NSE_COM|NCD_FO|BCD_FO)\|/.test(key); }
export function listingExchange(instrument: {instrumentKey?: string}): "NSE" | "BSE" | "MCX" {
  const venue = sessionExchange(instrument);
  if (venue === "MCX") return "MCX";
  return ["BSE","BFO","BCD"].includes(venue) ? "BSE" : "NSE";
}
export const currencyExpiryTime = (expiry: string) => Date.parse(expiry + "T12:30:00+05:30");
export function currencyPrecision(key?: string) { return isCurrencyFuture(key) ? 4 : 2; }
export function currencyLotLabel(root: string | undefined, multiplier: number) {
  const unit = (root ?? "").replace(/INR$/, "");
  return (multiplier * (unit === "JPY" ? 100 : 1)).toLocaleString("en-IN") + " " + unit;
}

export function segmentFuture(item: {
  segment?: string; instrument_type?: string; instrument_key?: string; trading_symbol?: string; qty_multiplier?: number;
  underlying_symbol?: string; last_price?: number;
}, exchange: "NSE" | "BSE", expiry: string): Instrument | undefined {
  const key = item.instrument_key, root = item.underlying_symbol?.trim();
  if (!key || !root || item.instrument_type !== "FUT" || !item.trading_symbol?.trim() ||
    !/^(NCD_FO|BCD_FO|NSE_COM)\|\d+$/.test(key) || !key.startsWith(item.segment + "|") || listingExchange({instrumentKey:key}) !== exchange ||
    !Number.isSafeInteger(item.qty_multiplier) || item.qty_multiplier! <= 0) return;
  const currency = isCurrencyFuture(key);
  // These contracts quote their value in INR. Cross-currency pairs need a separate FX conversion.
  if (currency && !/^(USD|EUR|GBP|JPY)INR$/.test(root)) return;
  const name = item.trading_symbol.trim();
  return {symbol:name + " (" + exchange + ")", name, exchange, price:Number(item.last_price) || 0, change:0,
    instrumentKey:key, assetType:"FUTURE", categories:["Futures",currency ? "CURRENCY" : "COMMODITY"], underlyingSymbol:root,
    expiry, lotSize:item.qty_multiplier};
}
