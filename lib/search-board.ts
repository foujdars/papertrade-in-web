export type BoardQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
};

export type SearchBoard = { gainers: BoardQuote[]; losers: BoardQuote[] };

export const US_BOARD = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "PLTR", "INTC", "MU", "COIN", "MSTR", "HOOD", "TSM", "SPY", "QQQ"];
export const CRYPTO_BOARD = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "LINK", "AVAX", "SUI", "LTC", "BCH", "DOT", "TRX"];

const COLUMNS = ["name", "close", "change", "volume", "description"];

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

export function boardQuotes(payload: unknown, market: "us" | "crypto"): BoardQuote[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const rows: BoardQuote[] = [];
  for (const item of data) {
    const cells = (item as { d?: unknown }).d;
    if (!Array.isArray(cells)) continue;
    const raw = String(cells[0] ?? "").trim().toUpperCase();
    const symbol = market === "crypto" ? raw.replace(/USDT$/, "") : raw;
    const price = Number(cells[1]);
    const change = Number(cells[2]);
    const volume = Number(cells[3]);
    if (!/^[A-Z0-9]{1,12}$/.test(symbol) || !Number.isFinite(price) || !Number.isFinite(change)) continue;
    const description = typeof cells[4] === "string" ? cells[4].trim() : "";
    rows.push({ symbol, name: description || symbol, price, change, volume: Number.isFinite(volume) ? volume : 0 });
  }
  return rows;
}

export function splitBoard(rows: BoardQuote[], limit = 8): SearchBoard {
  const gainers = rows.filter(row => row.change > 0).sort((a, b) => b.change - a.change).slice(0, limit);
  const losers = rows.filter(row => row.change < 0).sort((a, b) => a.change - b.change).slice(0, limit);
  return { gainers, losers };
}
