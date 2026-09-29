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
  sources: { in: "moneycontrol", us: "tradingview", crypto: "moneycontrol" },
};

const STABLE = new Set(["USDT", "USDC", "DAI", "TUSD", "FDUSD", "USDE", "STETH", "WBETH", "WETH", "WBTC"]);

export function nextData(html: string): unknown {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); }
  catch { return null; }
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

export function searchShelfRows(input: {
  shelf: SearchShelfId;
  instruments: DirectoryInstrument[];
  recent: string[];
  popular: PopularLists;
  query: string;
}) {
  const tradable = input.instruments.filter(item => item.assetType !== "OPTION");
  const pool = tradable.filter(item => input.shelf === "all" || shelfOf(item) === input.shelf);
  const bySymbol = new Map(pool.map(item => [item.symbol.toUpperCase(), item]));
  const byTicker = new Map<string, DirectoryInstrument>();
  for (const item of pool) {
    const key = marketTicker(item).toUpperCase();
    const previous = byTicker.get(key);
    if (!previous || item.symbol.length < previous.symbol.length) byTicker.set(key, item);
  }
  const query = input.query.trim().toLowerCase();
  if (query) {
    return {
      recent: [] as DirectoryInstrument[],
      popular: [] as DirectoryInstrument[],
      matches: pool.filter(item => `${item.symbol} ${item.name} ${marketDisplayName(item)}`.toLowerCase().includes(query)).slice(0, 20),
    };
  }
  const recent: DirectoryInstrument[] = [];
  for (const symbol of input.recent) {
    const item = bySymbol.get(symbol.toUpperCase());
    if (!item || recent.some(row => row.symbol === item.symbol)) continue;
    recent.push(item);
    if (recent.length >= 8) break;
  }
  const tokens = input.shelf === "us" ? input.popular.us : input.shelf === "crypto" ? input.popular.crypto : input.popular.in;
  const seen = new Set(recent.map(item => item.symbol));
  const popular: DirectoryInstrument[] = [];
  for (const token of tokens) {
    const key = token.toUpperCase();
    const item = bySymbol.get(key) ?? bySymbol.get(`${key}USD`) ?? byTicker.get(key);
    if (!item || seen.has(item.symbol)) continue;
    if ((input.shelf === "all" || input.shelf === "in") && shelfOf(item) !== "in") continue;
    seen.add(item.symbol);
    popular.push(item);
    if (popular.length >= 12) break;
  }
  return { recent, popular, matches: [] as DirectoryInstrument[] };
}

export function popularHeading(shelf: SearchShelfId, popular: PopularLists) {
  const source = shelf === "us" ? popular.sources.us : shelf === "crypto" ? popular.sources.crypto : popular.sources.in;
  if (source === "tradingview") return "Most active on TradingView";
  if (source === "moneycontrol") return "Most active on Moneycontrol";
  return "Popular symbols";
}
