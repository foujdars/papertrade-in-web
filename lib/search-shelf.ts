import { marketDisplayName, marketGroup, marketTicker, type DirectoryInstrument } from "./market-directory.ts";

export type SearchShelfId = "all" | "in" | "us" | "crypto";
export type PopularLists = {
  in: string[];
  us: string[];
  crypto: string[];
  sources: { in: string; us: string; crypto: string };
};

export const FALLBACK_POPULAR: PopularLists = {
  in: ["RELIANCE", "HDFCBANK", "TCS", "BHARTIARTL", "ICICIBANK", "INFY", "SBIN", "ITC", "LT", "HINDUNILVR", "BAJFINANCE", "MARUTI", "M&M", "SUNPHARMA", "TATAMOTORS", "AXISBANK", "KOTAKBANK", "TATASTEEL", "TRENT", "HAL"],
  us: ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "PLTR", "INTC", "MU"],
  crypto: ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "LINK", "AVAX", "SUI"],
  sources: { in: "fallback", us: "fallback", crypto: "fallback" },
};

const STABLE = new Set(["USDT", "USDC", "DAI", "TUSD", "FDUSD", "USDE", "STETH", "WBETH", "WETH", "WBTC"]);

export function nextData(html: string): unknown {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); }
  catch { return null; }
}

export function moneycontrolTrendingSymbols(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = Object.values(payload as Record<string, unknown>).filter((row): row is { analytics_sequence?: unknown; sc_nseid?: unknown } => !!row && typeof row === "object");
  rows.sort((a, b) => Number(a.analytics_sequence ?? 99) - Number(b.analytics_sequence ?? 99));
  const symbols: string[] = [];
  for (const row of rows) {
    const symbol = typeof row.sc_nseid === "string" ? row.sc_nseid.trim().toUpperCase() : "";
    if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= 24) break;
  }
  return symbols;
}

export function moneycontrolUsSymbols(payload: unknown): string[] {
  const table = (payload as { props?: { pageProps?: { USData?: { tableData?: { header?: unknown; body?: { dataList?: unknown } } } } } })?.props?.pageProps?.USData?.tableData;
  const rows = table?.body?.dataList;
  if (!Array.isArray(rows)) return [];
  const header = Array.isArray(table?.header) ? table.header : [];
  const found = header.findIndex(column => {
    const name = (column as { name?: unknown })?.name;
    return name === "stock_ticker" || name === "ticker";
  });
  const index = found >= 0 ? found : 0;
  const symbols: string[] = [];
  for (const row of rows) {
    const symbol = Array.isArray(row) && typeof row[index] === "string" ? row[index].trim().toUpperCase() : "";
    if (!/^[A-Z.]{1,6}$/.test(symbol) || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= 24) break;
  }
  return symbols;
}

export function moneycontrolEquitySymbols(payload: unknown): string[] {
  const list = (payload as { props?: { pageProps?: { marketStatsData?: { marketStatsOverviewData?: { list?: unknown } } } } })?.props?.pageProps?.marketStatsData?.marketStatsOverviewData?.list;
  if (!Array.isArray(list)) return [];
  const symbols: string[] = [];
  for (const row of list) {
    const symbol = typeof (row as { symbol?: unknown })?.symbol === "string" ? (row as { symbol: string }).symbol.trim().toUpperCase() : "";
    if (!/^[A-Z0-9&-]{1,20}$/.test(symbol) || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= 24) break;
  }
  return symbols;
}

export function moneycontrolCryptoSymbols(payload: unknown): string[] {
  const list = (payload as { props?: { pageProps?: { topCryptoListData?: unknown } } })?.props?.pageProps?.topCryptoListData;
  if (!Array.isArray(list)) return [];
  const symbols: string[] = [];
  for (const row of list) {
    const symbol = typeof (row as { baseAsset?: unknown })?.baseAsset === "string" ? (row as { baseAsset: string }).baseAsset.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{2,12}$/.test(symbol) || STABLE.has(symbol) || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= 16) break;
  }
  return symbols;
}

export function tradingViewLeaders(payload: unknown): string[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const symbols: string[] = [];
  for (const row of data) {
    const name = Array.isArray((row as { d?: unknown })?.d) ? String((row as { d: unknown[] }).d[0] ?? "") : "";
    const symbol = name.trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(symbol) || symbols.includes(symbol)) continue;
    symbols.push(symbol);
    if (symbols.length >= 20) break;
  }
  return symbols;
}

function shelfOf(item: DirectoryInstrument): SearchShelfId | "other" {
  const group = marketGroup(item);
  if (group === "india") return "in";
  if (group === "us") return "us";
  if (group === "crypto") return "crypto";
  return "other";
}

export function matchShelfInstrument<T extends DirectoryInstrument>(instruments: T[], shelf: SearchShelfId, token: string): T | null {
  const pool = instruments.filter(item => item.assetType !== "OPTION" && (shelf === "all" || shelfOf(item) === shelf));
  const key = token.trim().toUpperCase();
  if (!key) return null;
  const bySymbol = new Map(pool.map(item => [item.symbol.toUpperCase(), item]));
  const byTicker = new Map<string, T>();
  for (const item of pool) {
    const ticker = marketTicker(item).toUpperCase();
    const previous = byTicker.get(ticker);
    if (!previous || item.symbol.length < previous.symbol.length) byTicker.set(ticker, item);
  }
  return bySymbol.get(key) ?? bySymbol.get(`${key}USD`) ?? byTicker.get(key) ?? null;
}

export function searchShelfRows<T extends DirectoryInstrument>(input: {
  shelf: SearchShelfId;
  instruments: T[];
  recent: string[];
  popular: PopularLists;
  query: string;
}) {
  const tradable = input.instruments.filter(item => item.assetType !== "OPTION");
  const pool = tradable.filter(item => input.shelf === "all" || shelfOf(item) === input.shelf);
  const bySymbol = new Map(pool.map(item => [item.symbol.toUpperCase(), item]));
  const byTicker = new Map<string, T>();
  for (const item of pool) {
    const key = marketTicker(item).toUpperCase();
    const previous = byTicker.get(key);
    if (!previous || item.symbol.length < previous.symbol.length) byTicker.set(key, item);
  }
  const query = input.query.trim().toLowerCase();
  if (query) {
    return {
      recent: [] as T[],
      popular: [] as T[],
      matches: pool.filter(item => `${item.symbol} ${item.name} ${marketDisplayName(item)}`.toLowerCase().includes(query)).slice(0, 20),
    };
  }
  const recent: T[] = [];
  for (const symbol of input.recent) {
    const item = bySymbol.get(symbol.toUpperCase());
    if (!item || recent.some(row => row.symbol === item.symbol)) continue;
    recent.push(item);
    if (recent.length >= 5) break;
  }
  const tokens = input.shelf === "us" ? input.popular.us : input.shelf === "crypto" ? input.popular.crypto : input.popular.in;
  const seen = new Set(recent.map(item => item.symbol));
  const popular: T[] = [];
  for (const token of tokens) {
    const key = token.toUpperCase();
    const item = bySymbol.get(key) ?? bySymbol.get(`${key}USD`) ?? byTicker.get(key);
    if (!item || seen.has(item.symbol)) continue;
    if ((input.shelf === "all" || input.shelf === "in") && shelfOf(item) !== "in") continue;
    seen.add(item.symbol);
    popular.push(item);
    if (popular.length >= 12) break;
  }
  return { recent, popular, matches: [] as T[] };
}

export function popularHeading(shelf: SearchShelfId, popular: PopularLists) {
  const source = shelf === "us" ? popular.sources.us : shelf === "crypto" ? popular.sources.crypto : popular.sources.in;
  if (source === "tradingview") return "Most active on TradingView";
  if (source === "moneycontrol-active") return "Most active on Moneycontrol";
  if (shelf === "us" && source === "moneycontrol") return "Largest on Moneycontrol";
  if (shelf === "crypto" && source === "moneycontrol") return "Top on Moneycontrol";
  if (source === "moneycontrol") return "Trending on Moneycontrol";
  return "Popular symbols";
}
