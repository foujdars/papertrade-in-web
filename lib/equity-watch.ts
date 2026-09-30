export const WATCH_INDICES = [
  { id: "nifty50", label: "Nifty 50", symbol: "NSE:NIFTY" },
  { id: "next50", label: "Next 50", symbol: "NSE:NIFTYJR" },
  { id: "bank", label: "Bank", symbol: "NSE:BANKNIFTY" },
  { id: "fin", label: "Fin", symbol: "NSE:CNXFINANCE" },
  { id: "it", label: "IT", symbol: "NSE:CNXIT" },
  { id: "auto", label: "Auto", symbol: "NSE:CNXAUTO" },
  { id: "pharma", label: "Pharma", symbol: "NSE:CNXPHARMA" },
  { id: "fmcg", label: "FMCG", symbol: "NSE:CNXFMCG" },
  { id: "metal", label: "Metal", symbol: "NSE:CNXMETAL" },
  { id: "energy", label: "Energy", symbol: "NSE:CNXENERGY" },
  { id: "midcap", label: "Midcap", symbol: "NSE:CNXMIDCAP" },
  { id: "psu", label: "PSU Bank", symbol: "NSE:CNXPSUBANK" },
] as const;

export type WatchIndexId = (typeof WATCH_INDICES)[number]["id"];
export type WatchSort = "change" | "name" | "volume";

export type WatchQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
};

export const WATCH_COLUMNS = ["name", "close", "change", "open", "high", "low", "volume", "description"] as const;

export function watchIndex(id: string | null | undefined) {
  return WATCH_INDICES.find(item => item.id === id) ?? WATCH_INDICES[0];
}

export function watchScan(indexSymbol: string) {
  return {
    filter: [
      { left: "exchange", operation: "equal", right: "NSE" },
      { left: "is_primary", operation: "equal", right: true },
    ],
    options: { lang: "en" },
    columns: [...WATCH_COLUMNS],
    sort: { sortBy: "name", sortOrder: "asc" },
    range: [0, 120],
    symbols: { query: { types: ["stock"] }, tickers: [], groups: [{ type: "index", values: [indexSymbol] }] },
  };
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quotesFromWatch(payload: unknown): WatchQuote[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const rows: WatchQuote[] = [];
  for (const item of data) {
    const ticker = String((item as { s?: unknown })?.s ?? "");
    if (!ticker.startsWith("NSE:")) continue;
    const symbol = ticker.slice(4).toUpperCase();
    if (!/^[A-Z0-9&_-]{1,20}$/.test(symbol)) continue;
    const cells = (item as { d?: unknown }).d;
    if (!Array.isArray(cells)) continue;
    const price = num(cells[1]);
    const change = num(cells[2]);
    if (price === null || change === null) continue;
    const description = typeof cells[7] === "string" ? cells[7].trim() : "";
    rows.push({
      symbol,
      name: description || symbol,
      price,
      change,
      open: num(cells[3]),
      high: num(cells[4]),
      low: num(cells[5]),
      volume: num(cells[6]) ?? 0,
    });
  }
  return rows;
}

export function sortWatch(rows: WatchQuote[], sort: WatchSort): WatchQuote[] {
  const next = [...rows];
  if (sort === "name") next.sort((a, b) => a.symbol.localeCompare(b.symbol));
  else if (sort === "volume") next.sort((a, b) => b.volume - a.volume || a.symbol.localeCompare(b.symbol));
  else next.sort((a, b) => b.change - a.change || a.symbol.localeCompare(b.symbol));
  return next;
}

export function volumeLabel(volume: number) {
  if (!(volume > 0)) return "—";
  if (volume >= 1e7) return `${(volume / 1e7).toFixed(volume >= 1e8 ? 0 : 1)} Cr`;
  if (volume >= 1e5) return `${(volume / 1e5).toFixed(volume >= 1e6 ? 0 : 1)} L`;
  return volume.toLocaleString("en-IN");
}
