import { deltaOptionRoot } from "./global-contracts.ts";

export type ListedDeltaOption = {
  symbol: string;
  assetType?: string;
  instrumentKey?: string;
  categories: readonly string[];
  underlyingSymbol?: string;
  expiry?: string;
  strikePrice?: number;
  optionType?: "CE" | "PE";
};

export type DeltaOption = ListedDeltaOption & { instrumentKey: string; expiry: string; strikePrice: number; optionType: "CE" | "PE" };

export const isTokenisedDelta = (item: ListedDeltaOption) =>
  item.categories?.some(tag => tag === "METAL" || tag === "GOLD" || tag === "US_MARKET") ||
  ["XAUT", "PAXG", "SLVON"].includes(item.underlyingSymbol ?? deltaOptionRoot(item.symbol) ?? item.symbol.replace(/USD$/, ""));

export function deltaChartOptionRoot(item: ListedDeltaOption) {
  if (!item.instrumentKey?.startsWith("DELTA|")) return null;
  const symbol = item.instrumentKey.slice(6);
  return deltaOptionRoot(symbol) ?? (/^[A-Z0-9]+USD$/.test(symbol) ? symbol.slice(0, -3) : item.underlyingSymbol ?? null);
}

export function deltaOptionDirectory(items: readonly ListedDeltaOption[]) {
  const roots = new Map<string, DeltaOption[]>();
  for (const item of items) {
    const root = deltaOptionRoot(item.symbol);
    if (!root || item.assetType !== "OPTION" || item.instrumentKey !== `DELTA|${item.symbol}` ||
      !item.expiry || !Number.isFinite(Date.parse(item.expiry)) ||
      !item.strikePrice || !Number.isFinite(item.strikePrice) || item.strikePrice < 0 ||
      (item.optionType !== "CE" && item.optionType !== "PE")) continue;
    const contracts = roots.get(root) ?? [];
    contracts.push(item as DeltaOption);
    roots.set(root, contracts);
  }
  return roots;
}

export function deltaOptionStrikes(contracts: readonly DeltaOption[], expiry: string) {
  const rows = new Map<number, { strike: number; CE?: DeltaOption; PE?: DeltaOption }>();
  for (const item of contracts) {
    if (item.expiry !== expiry) continue;
    const row = rows.get(item.strikePrice) ?? { strike: item.strikePrice };
    row[item.optionType] = item;
    rows.set(row.strike, row);
  }
  return [...rows.values()].sort((a, b) => a.strike - b.strike);
}
