/** Discovery order is editorial (familiar names first), not a live market-cap ranking. */
export type MarketGroup = "india" | "us" | "crypto" | "commodities";
export type DirectoryInstrument = { symbol: string; name: string; instrumentKey?: string; categories: string[]; assetType?: string };
const leaders: Record<MarketGroup, string[]> = {
  india: ["RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL", "ICICIBANK", "INFY", "SBIN", "ITC", "LT", "HINDUNILVR", "BAJFINANCE", "MARUTI", "M&M", "SUNPHARMA", "TATAMOTORS"],
  us: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "TSM", "SPY", "QQQ", "AMD", "PLTR", "COIN", "MSTR", "HOOD", "INTC", "MU"],
  crypto: ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "TRX"],
  commodities: ["XAUT", "PAXG", "SLVON", "BRENT", "UKOIL", "USOIL", "WTI", "XAG", "COPPER"],
};
export function marketGroup(item: DirectoryInstrument): MarketGroup {
  const tags = item.categories.map(tag => tag.toUpperCase());
  if (!item.instrumentKey?.startsWith("DELTA|") && !item.instrumentKey?.startsWith("TVC|") && !tags.includes("GLOBAL")) return "india";
  if (tags.some(tag => ["METAL", "GOLD", "ENERGY", "COMMODITY", "COMMODITIES"].includes(tag)) || /^(XAUT|PAXG|SLVON|BRENT|UKOIL|USOIL|XAG)(USD)?$/.test(item.symbol)) return "commodities";
  if (tags.includes("US_MARKET")) return "us";
  return "crypto";
}
export function marketTicker(item: DirectoryInstrument): string {
  const group = marketGroup(item);
  if (item.assetType === "OPTION") return item.symbol;
  const root = item.symbol.replace(/USD$/, "");
  return group === "us" ? root.replace(/[XB]$/, "") : group === "india" ? item.symbol : root;
}
export function marketDisplayName(item: DirectoryInstrument): string {
  return item.name.replace(/\s+(?:xStock|bStocks) Token/gi, "").replace(/\s+perpetual$/i, "");
}
export function compareMarketInstruments(a: DirectoryInstrument, b: DirectoryInstrument): number {
  const groupA = marketGroup(a), groupB = marketGroup(b);
  if (groupA !== groupB) return ["india", "us", "crypto", "commodities"].indexOf(groupA) - ["india", "us", "crypto", "commodities"].indexOf(groupB);
  // Keep hundreds of strikes behind their underlying contracts in search.
  const optionOrder = Number(a.assetType === "OPTION") - Number(b.assetType === "OPTION");
  if (optionOrder) return optionOrder;
  const rank = (item: DirectoryInstrument) => { const index = leaders[groupA].indexOf(marketTicker(item)); return index < 0 ? 1000 : index; };
  return rank(a) - rank(b) || marketDisplayName(a).localeCompare(marketDisplayName(b)) || a.symbol.localeCompare(b.symbol);
}
export function marketProductLabel(item: DirectoryInstrument): string {
  if (item.instrumentKey?.startsWith("TVC|")) return "Reference · watch only";
  if (item.assetType === "OPTION") return "Option · USD";
  if (marketGroup(item) === "india") return item.assetType === "INDEX" ? "Index · INR" : "Stock · INR";
  return marketGroup(item) === "us" ? "Tokenised perpetual · USD" : "Perpetual · USD";
}
