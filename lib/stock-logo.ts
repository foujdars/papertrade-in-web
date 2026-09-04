export type LogoInstrument = {
  symbol: string;
  instrumentKey?: string;
  underlyingKey?: string;
  underlyingSymbol?: string;
};

const equityKey = /^NSE_EQ\|IN[A-Z0-9]{10}$/;

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
    ?? stockLogoUrl(directory.get(item.underlyingSymbol ?? ""));
}
