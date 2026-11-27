import type { FnoUnderlying, OptionChainRow } from "./fno";
import { loadOptionChain, loadOptionExpiries } from "./fno-client";
import { bookPrices, positiveQuote, type SpreadChain, type SpreadSeries } from "./vertical-spread";

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
        id: contract.instrumentKey, series, strike: row.strikePrice, kind: contract.optionType,
        multiplier: contract.lotSizeVerified ? contract.lotSize : null,
        ...bookPrices(contract.marketData.bidPrice, contract.marketData.askPrice, contract.marketData.bidQty, contract.marketData.askQty),
        last: positiveQuote(contract.marketData.ltp),
      }] : [])),
    reference: positiveQuote(rows.find(row => row.expiry === series && row.underlyingSpotPrice > 0)?.underlyingSpotPrice),
  };
}

export async function loadSpreadChain(market: SpreadMarket, root: string, underlying: FnoUnderlying | undefined, series: string, signal: AbortSignal): Promise<SpreadChain> {
  if (market !== "india") return read<SpreadChain>(providerUrl(market, root, series), signal);
  if (!underlying) return { contracts: [], reference: null };
  return normalizeNseSpreadChain(await loadOptionChain(underlying, series, signal), series);
}
