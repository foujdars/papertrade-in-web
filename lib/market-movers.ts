import { volumeLabel } from "./equity-watch.ts";

export const MOVER_TABS = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "active", label: "Most active" },
  { id: "volume", label: "Volume" },
  { id: "high52", label: "52W high" },
  { id: "low52", label: "52W low" },
  { id: "upper", label: "Upper band" },
  { id: "lower", label: "Lower band" },
] as const;

export type MoverTab = (typeof MOVER_TABS)[number]["id"];

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeAbs: number;
  volume: number;
  relativeVolume: number | null;
  weekHigh: number | null;
  weekLow: number | null;
  high: number | null;
  low: number | null;
  tradedValue: number | null;
};

export type Mover = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  tradedValue: number | null;
  note: string | null;
};

export const SCAN_COLUMNS = ["name", "close", "change", "change_abs", "volume", "relative_volume_10d_calc", "price_52_week_high", "price_52_week_low", "high", "low", "Value.Traded", "description"] as const;

const NSE_STOCKS = [
  { left: "exchange", operation: "equal", right: "NSE" },
  { left: "type", operation: "equal", right: "stock" },
  { left: "is_primary", operation: "equal", right: true },
];

const BANDS = [2, 5, 10, 20, 40];

export function moverScan(tab: MoverTab) {
  const columns = [...SCAN_COLUMNS];
  const common = { columns, options: { lang: "en" }, symbols: { query: { types: [] }, tickers: [] } };
  if (tab === "gainers") return { ...common, filter: [...NSE_STOCKS, { left: "change", operation: "greater", right: 0 }], sort: { sortBy: "change", sortOrder: "desc" }, range: [0, 8] };
  if (tab === "losers") return { ...common, filter: [...NSE_STOCKS, { left: "change", operation: "less", right: 0 }], sort: { sortBy: "change", sortOrder: "asc" }, range: [0, 8] };
  if (tab === "active") return { ...common, filter: [...NSE_STOCKS], sort: { sortBy: "Value.Traded", sortOrder: "desc" }, range: [0, 8] };
  if (tab === "volume") return { ...common, filter: [...NSE_STOCKS, { left: "relative_volume_10d_calc", operation: "greater", right: 1.5 }], sort: { sortBy: "relative_volume_10d_calc", sortOrder: "desc" }, range: [0, 8] };
  if (tab === "high52") return { ...common, filter: [...NSE_STOCKS, { left: "price_52_week_high", operation: "eless", right: "high" }], sort: { sortBy: "change", sortOrder: "desc" }, range: [0, 8] };
  if (tab === "low52") return { ...common, filter: [...NSE_STOCKS, { left: "low", operation: "eless", right: "price_52_week_low" }], sort: { sortBy: "change", sortOrder: "asc" }, range: [0, 8] };
  if (tab === "upper") return { ...common, filter: [...NSE_STOCKS, { left: "change", operation: "greater", right: 1.7 }], sort: { sortBy: "change", sortOrder: "desc" }, range: [0, 80] };
  return { ...common, filter: [...NSE_STOCKS, { left: "change", operation: "less", right: -1.7 }], sort: { sortBy: "change", sortOrder: "asc" }, range: [0, 80] };
}

function num(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function quotesFromScan(payload: unknown): Quote[] {
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const rows: Quote[] = [];
  for (const item of data) {
    const ticker = String((item as { s?: unknown })?.s ?? "");
    if (!ticker.startsWith("NSE:")) continue;
    const symbol = ticker.slice(4).toUpperCase();
    if (!/^[A-Z0-9&_-]{1,20}$/.test(symbol)) continue;
    const cells = (item as { d?: unknown }).d;
    if (!Array.isArray(cells)) continue;
    const price = num(cells[1]);
    const change = num(cells[2]);
    const changeAbs = num(cells[3]);
    if (price === null || change === null || changeAbs === null) continue;
    const description = typeof cells[11] === "string" ? cells[11].trim() : "";
    rows.push({
      symbol,
      name: description || symbol,
      price,
      change,
      changeAbs,
      volume: num(cells[4]) ?? 0,
      relativeVolume: num(cells[5]),
      weekHigh: num(cells[6]),
      weekLow: num(cells[7]),
      high: num(cells[8]),
      low: num(cells[9]),
      tradedValue: num(cells[10]),
    });
  }
  return rows;
}

/** A day high or low that lands on an NSE circuit (2, 5, 10, 20, or 40 percent) is a price-band hit. */
export function priceBand(row: Quote, side: "upper" | "lower"): number | null {
  const previous = row.price - row.changeAbs;
  if (!(previous > 0)) return null;
  const extreme = side === "upper" ? row.high : row.low;
  if (extreme === null || !(extreme > 0)) return null;
  const percent = side === "upper" ? ((extreme - previous) / previous) * 100 : ((previous - extreme) / previous) * 100;
  if (!(percent > 0)) return null;
  return BANDS.find(band => Math.abs(percent - band) <= 0.2) ?? null;
}

function volumeNote(multiple: number) {
  const digits = multiple >= 10 ? 0 : 1;
  return `${multiple.toFixed(digits)}× avg`;
}

function valueNote(rupees: number) {
  const crore = rupees / 1e7;
  const digits = crore >= 100 ? 0 : 1;
  return `₹${crore.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })} cr`;
}

export function volumeMetrics(row: { volume: number; tradedValue?: number | null; note?: string | null }) {
  const parts: string[] = [];
  if (row.volume > 0) parts.push(`Vol ${volumeLabel(row.volume)}`);
  const turnover = row.tradedValue && row.tradedValue > 0 ? valueNote(row.tradedValue) : null;
  if (turnover && turnover !== row.note) parts.push(turnover);
  if (row.note) parts.push(row.note);
  return parts.join(" · ");
}

export function presentMovers(tab: MoverTab, rows: Quote[], limit = 8): Mover[] {
  const movers: Mover[] = [];
  for (const row of rows) {
    let note: string | null = null;
    if (tab === "upper" || tab === "lower") {
      const band = priceBand(row, tab === "upper" ? "upper" : "lower");
      if (band === null) continue;
      note = `${band}% band`;
    } else if (tab === "volume") {
      if (row.relativeVolume === null || row.relativeVolume < 1.5) continue;
      note = volumeNote(row.relativeVolume);
    } else if (tab === "active") {
      note = row.tradedValue && row.tradedValue > 0 ? valueNote(row.tradedValue) : null;
    }
    movers.push({ symbol: row.symbol, name: row.name, price: row.price, change: row.change, volume: row.volume, tradedValue: row.tradedValue, note });
    if (movers.length >= limit) break;
  }
  return movers;
}
