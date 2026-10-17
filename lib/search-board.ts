export type BoardQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  source?: "tradingview" | "upstox";
  quoteAt?: string | null;
  delayed?: boolean;
  exchange?: string;
};

export type SearchBoard = { gainers: BoardQuote[]; losers: BoardQuote[] };
export type BoardMetadata = {
  fetchedAt: string | null;
  status: "delayed" | "stale" | "unavailable";
  source: "tradingview";
  warning: string | null;
};

export const US_BOARD = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "PLTR", "INTC", "MU", "COIN", "MSTR", "HOOD", "TSM", "SPY", "QQQ"];
export const CRYPTO_BOARD = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "TRX"];

const COLUMNS = ["name", "close", "change", "volume", "description", "change_abs"];

export function americaBoardScan() {
  return {
    filter: [
      { left: "type", operation: "equal", right: "stock" },
      { left: "exchange", operation: "in_range", right: ["NASDAQ", "NYSE", "AMEX"] },
      { left: "name", operation: "in_range", right: US_BOARD },
    ],
    columns: COLUMNS,
    sort: { sortBy: "change", sortOrder: "desc" },
    range: [0, US_BOARD.length],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
  };
}

export function cryptoBoardScan() {
  return {
    filter: [
      { left: "exchange", operation: "equal", right: "BINANCE" },
      { left: "name", operation: "in_range", right: CRYPTO_BOARD.map(symbol => `${symbol}USDT`) },
    ],
    columns: COLUMNS,
    sort: { sortBy: "change", sortOrder: "desc" },
    range: [0, CRYPTO_BOARD.length],
    options: { lang: "en" },
    symbols: { query: { types: [] }, tickers: [] },
  };
}

function quoteNumber(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function boardQuotes(payload: unknown, market: "us" | "crypto"): BoardQuote[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const rows: BoardQuote[] = [];
  for (const item of data) {
    const cells = (item as { d?: unknown }).d;
    if (!Array.isArray(cells)) continue;
    const raw = String(cells[0] ?? "").trim().toUpperCase();
    const symbol = market === "crypto" ? raw.replace(/USDT$/, "") : raw;
    const price = quoteNumber(cells[1]);
    const changeAbs = quoteNumber(cells[5]);
    const previousClose = price !== null && changeAbs !== null ? price - changeAbs : null;
    const change = previousClose !== null && previousClose > 0 && changeAbs !== null ? (changeAbs / previousClose) * 100 : null;
    const volume = quoteNumber(cells[3]);
    if (!/^[A-Z0-9]{1,12}$/.test(symbol) || price === null || price <= 0 || change === null) continue;
    const description = typeof cells[4] === "string" ? cells[4].trim() : "";
    rows.push({ symbol, name: description || symbol, price, change, volume: volume !== null && volume >= 0 ? volume : 0, source: "tradingview", quoteAt: null, delayed: true });
  }
  return rows;
}

export function splitBoard(rows: BoardQuote[], limit = 8): SearchBoard {
  const gainers = rows.filter(row => row.change > 0).sort((a, b) => b.change - a.change).slice(0, limit);
  const losers = rows.filter(row => row.change < 0).sort((a, b) => a.change - b.change).slice(0, limit);
  return { gainers, losers };
}
