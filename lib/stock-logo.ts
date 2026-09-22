import { marketGroup, marketTicker, type DirectoryInstrument } from "./market-directory.ts";

export type LogoInstrument = {
  symbol: string;
  instrumentKey?: string;
  underlyingKey?: string;
  underlyingSymbol?: string;
  categories?: string[];
  assetType?: string;
};

const equityKey = /^NSE_EQ\|IN[A-Z0-9]{10}$/;
const safeTicker = /^[A-Z0-9]{1,12}$/;
const CRYPTO_ROOTS = new Set([
  "BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "TRX",
  "SHIB", "PEPE", "TON", "NEAR", "ATOM", "UNI", "APT", "ARB", "OP", "FIL", "ICP", "HBAR", "VET", "ALGO",
  "XLM", "ETC", "AAVE", "MKR", "CRV", "LDO", "RENDER", "INJ", "SEI", "TIA", "WIF", "BONK", "POL", "TAO",
]);
const COMMODITY_LOGOS: Record<string, string> = {
  XAUT: coincapLogo("XAUT")!,
  PAXG: coincapLogo("PAXG")!,
  SLVON: parqetLogo("SLV")!,
  XAG: parqetLogo("SLV")!,
  BRENT: parqetLogo("BZ")!,
  UKOIL: parqetLogo("BZ")!,
  USOIL: parqetLogo("CL")!,
  WTI: parqetLogo("CL")!,
  COPPER: parqetLogo("HG")!,
};

function parqetLogo(ticker: string): string | null {
  return safeTicker.test(ticker) ? `https://assets.parqet.com/logos/symbol/${ticker}?format=png` : null;
}

function coincapLogo(ticker: string): string | null {
  return safeTicker.test(ticker) ? `https://assets.coincap.io/assets/icons/${ticker.toLowerCase()}@2x.png` : null;
}

function looksGlobal(item: LogoInstrument): boolean {
  const key = item.instrumentKey ?? "";
  const tags = item.categories ?? [];
  return key.startsWith("DELTA|") || key.startsWith("TVC|") || tags.includes("GLOBAL")
    || item.symbol === "BRENT" || /USD$/.test(item.symbol);
}

function directoryItem(item: LogoInstrument): DirectoryInstrument {
  const tags = item.categories ?? [];
  const root = (item.underlyingSymbol || item.symbol.replace(/USD$/, "")).toUpperCase();
  const inferred = tags.length ? tags : CRYPTO_ROOTS.has(root) ? ["GLOBAL", "CRYPTO"]
    : /^(XAUT|PAXG|SLVON|BRENT|UKOIL|USOIL|XAG|COPPER)(USD)?$/.test(item.symbol) || item.instrumentKey?.startsWith("TVC|") ? ["GLOBAL", "METAL"]
    : /^[A-Z]{1,5}[XB]$/.test(root) ? ["GLOBAL", "US_MARKET"]
    : ["GLOBAL", "CRYPTO"];
  return {
    symbol: item.symbol,
    name: item.symbol,
    instrumentKey: item.instrumentKey,
    categories: inferred,
    assetType: item.assetType,
  };
}

export function tokenLogoUrl(item: LogoInstrument): string | null {
  if (!looksGlobal(item)) return null;
  const listed = directoryItem(item);
  const group = marketGroup(listed);
  const ticker = item.assetType === "OPTION" && item.underlyingSymbol && safeTicker.test(item.underlyingSymbol)
    ? item.underlyingSymbol
    : marketTicker(listed);
  if (!safeTicker.test(ticker)) return null;
  if (group === "commodities") return COMMODITY_LOGOS[ticker] ?? COMMODITY_LOGOS[item.symbol] ?? coincapLogo(ticker);
  if (group === "us") return parqetLogo(ticker);
  return coincapLogo(ticker);
}

// Company artwork is indexed by ISIN, not a guessed company domain or ticker.
export function stockLogoUrl(key?: string): string | null {
  return key && equityKey.test(key)
    ? `https://assets.upstox.com/content/assets/images/logos/${encodeURIComponent(key)}.png`
    : null;
}

export function stockLogoDirectory(instruments: readonly LogoInstrument[]): Map<string, string> {
  const directory = new Map<string, string>();
  for (const item of instruments) {
    if (stockLogoUrl(item.instrumentKey)) directory.set(item.symbol, item.instrumentKey!);
  }
  for (const item of instruments) {
    const key = stockLogoUrl(item.underlyingKey) ? item.underlyingKey : directory.get(item.underlyingSymbol ?? "");
    if (key && !directory.has(item.symbol)) directory.set(item.symbol, key);
  }
  return directory;
}

export function resolveStockLogo(item: LogoInstrument, directory: ReadonlyMap<string, string>): string | null {
  return stockLogoUrl(item.instrumentKey)
    ?? stockLogoUrl(item.underlyingKey)
    ?? stockLogoUrl(directory.get(item.symbol))
    ?? stockLogoUrl(directory.get(item.underlyingSymbol ?? ""))
    ?? tokenLogoUrl(item)
    ?? (item.underlyingSymbol ? tokenLogoUrl({ ...item, symbol: item.underlyingSymbol, assetType: undefined }) : null);
}
