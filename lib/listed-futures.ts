import type { Instrument } from "./market";
import { isDeltaPerpSymbol } from "./global-markets.ts";
import { isDeltaDatedFutureSymbol } from "./global-contracts.ts";
import { currencyExpiryTime, isCurrencyFuture, listingExchange } from "./indian-futures.ts";

export type FuturesScope = { market: "india" | "global"; rootKey?: string; label?: string };

const expiryFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export function formatFuturesExpiry(expiry: string | null | undefined) {
  return expiry ? expiryFormat.format(new Date(expiry)) : "Perpetual";
}

export function futuresRootKey(item: Instrument): string {
  if (isCurrencyFuture(item.instrumentKey) || item.instrumentKey.startsWith("NSE_COM|"))
    return item.instrumentKey.split("|")[0] + "|" + item.underlyingSymbol;
  if (item.exchange === "DELTA" || item.exchange === "MCX") {
    return item.underlyingSymbol ? item.exchange + "|" + item.underlyingSymbol : "";
  }
  return item.underlyingKey ?? item.instrumentKey;
}

export function isListedFuture(item: Instrument, tradingDate: string, now: number) {
  if (item.assetType !== "FUTURE") return false;
  if (item.exchange === "DELTA") {
    if (!Number.isFinite(item.contractMultiplier) || !(item.contractMultiplier! > 0) || item.instrumentKey !== "DELTA|" + item.symbol) return false;
    return item.expiry ? isDeltaDatedFutureSymbol(item.symbol) && Date.parse(item.expiry) > now : isDeltaPerpSymbol(item.symbol);
  }
  return item.exchange === listingExchange(item) && /^(NSE_FO|BSE_FO|MCX_FO|NCD_FO|BCD_FO|NSE_COM)\|\d+$/.test(item.instrumentKey) &&
    !!item.expiry && /^\d{4}-\d{2}-\d{2}$/.test(item.expiry) && Number.isFinite(Date.parse(item.expiry)) && item.expiry >= tradingDate &&
    (!isCurrencyFuture(item.instrumentKey) || currencyExpiryTime(item.expiry) > now) &&
    Number.isSafeInteger(item.lotSize) && item.lotSize! > 0;
}

const priority = new Map(["NIFTY", "BANKNIFTY", "SENSEX", "BTC", "ETH"].map((root, rank) => [root, rank]));
export function compareFutures(a: Instrument, b: Instrument) {
  const rootA = a.underlyingSymbol ?? a.symbol, rootB = b.underlyingSymbol ?? b.symbol;
  return (priority.get(rootA) ?? priority.size) - (priority.get(rootB) ?? priority.size) ||
    rootA.localeCompare(rootB) || (a.expiry ?? "").localeCompare(b.expiry ?? "") || a.instrumentKey.localeCompare(b.instrumentKey);
}
