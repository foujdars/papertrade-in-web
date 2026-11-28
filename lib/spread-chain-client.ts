import type { FnoUnderlying, OptionChainRow } from "./fno";
import { loadOptionChain, loadOptionExpiries } from "./fno-client";
import { bookPrices, positiveQuote, reportedGreeks, type SpreadChain, type SpreadSeries, type SpreadFuture } from "./vertical-spread";
import type { IndianBook } from "./option-basket-orders";

export type SpreadMarket = "india" | "crypto" | "metals" | "tokens";

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error((typeof data.error === "string" ? data.error : data.error?.message) ?? "The option feed is unavailable.");
  }
  return data as T;
}

export async function loadSpreadUnderlyings(signal: AbortSignal) {
  const result = await read<{ underlyings: FnoUnderlying[] }>("/api/upstox/fno-underlyings", signal);
  return result.underlyings.filter(item => item.optionContracts > 0);
}

function providerUrl(market: Exclude<SpreadMarket, "india">, root: string, series = "") {
  if (market === "crypto" || market === "tokens") {
    return `/api/global-markets?${new URLSearchParams({ mode: "spread-chain", underlying: root, series })}`;
  }
  return `/api/upstox/commodities?${new URLSearchParams({ optionRoot: root, series })}`;
}

export async function loadTokenOptionRoots(signal: AbortSignal) {
  const result = await read<{ roots: string[] }>("/api/global-markets?mode=token-option-roots", signal);
  return result.roots;
}

export async function loadCryptoOptionRoots(signal: AbortSignal) {
  const result = await read<{ roots: string[] }>("/api/global-markets?mode=crypto-option-roots", signal);
  return result.roots;
}

export async function loadSpreadSeries(market: SpreadMarket, root: string, underlying: FnoUnderlying | undefined, signal: AbortSignal): Promise<SpreadSeries[]> {
  if (market !== "india") {
    const result = await read<{ series: SpreadSeries[] }>(providerUrl(market, root), signal);
    return result.series;
  }
  if (!underlying) return [];
  const expiries = await loadOptionExpiries(underlying, signal);
  return expiries.map(expiry => ({ id: expiry, expiry }));
}

export function normalizeNseSpreadChain(rows: OptionChainRow[], series: string): SpreadChain {
  return {
    contracts: rows.filter(row => row.expiry === series && positiveQuote(row.strikePrice)).flatMap(row =>
      [row.call, row.put].flatMap(contract => contract ? [{
        id: contract.instrumentKey, symbol: contract.tradingSymbol, exchangeLot: contract.lotSizeVerified ? contract.lotSize : undefined, series, strike: row.strikePrice, kind: contract.optionType,
        multiplier: contract.lotSizeVerified ? contract.lotSize : null,
        ...bookPrices(contract.marketData.bidPrice, contract.marketData.askPrice, contract.marketData.bidQty, contract.marketData.askQty),
        bidSize: positiveQuote(contract.marketData.bidQty), askSize: positiveQuote(contract.marketData.askQty),
        iv: positiveQuote(contract.greeks?.iv) ? contract.greeks.iv! / 100 : null,
        greeks: reportedGreeks(contract.greeks),
        oi: contract.marketData.oiAvailable ? contract.marketData.oi : null,
        last: positiveQuote(contract.marketData.ltp),
      }] : [])),
    reference: positiveQuote(rows.find(row => row.expiry === series && row.underlyingSpotPrice > 0)?.underlyingSpotPrice),
  };
}

export async function loadSpreadChain(market: SpreadMarket, root: string, underlying: FnoUnderlying | undefined, series: string, signal: AbortSignal): Promise<SpreadChain> {
  if (market !== "india") return read<SpreadChain>(providerUrl(market, root, series), signal);
  if (!underlying) return { contracts: [], reference: null };
  const listed = (underlying.futures ?? []).filter(item => item.expiry >= series && item.lotSizeVerified);
  async function readFutures(): Promise<SpreadFuture[]> {
    if (!listed.length) return [];
    const params = new URLSearchParams({ keys: listed.map(contract => contract.instrumentKey).join(","), depth: "1" });
    const result = await read<{ books?: Record<string, IndianBook>; quotes?: Record<string, { lastPrice: number }> }>(`/api/upstox/quotes?${params}`, signal).catch(() => undefined);
    return listed.map(contract => {
      const id = contract.instrumentKey, book = result?.books?.[id];
      return { id, series, kind: "FUT", symbol: contract.tradingSymbol, futureExpiry: contract.expiry, multiplier: contract.lotSize, exchangeLot: contract.lotSize,
        ...bookPrices(book?.bid, book?.ask, book?.bidSize, book?.askSize), last: positiveQuote(result?.quotes?.[id]?.lastPrice) };
    });
  }
  const [rows, futures] = await Promise.all([loadOptionChain(underlying, series, signal), readFutures()]);
  return { ...normalizeNseSpreadChain(rows, series), future: futures[0], futures };
}
