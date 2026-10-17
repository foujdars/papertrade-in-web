import "server-only";
import { moverScan, quotesFromScan, type MoverTab, type Quote } from "./market-movers";
import { createMoverService, moverQuoteDelayed, type MoverVerification } from "./mover-snapshot";
import { normalizeUpstoxQuote, type UpstoxQuote } from "./upstox";
import { isUpstoxConfigured, upstoxFetch } from "./upstox-server";

const SCAN = "https://scanner.tradingview.com/india/scan";
const MASTER = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const PRIORITY = ["EQ", "BE", "BZ", "ST", "SM"];
type Instrument = { segment?: string; exchange?: string; instrument_type?: string; instrument_key?: string; trading_symbol?: string };
let instrumentCache: { until: number; keys: Map<string, string> } | null = null;
let instrumentPending: Promise<Map<string, string>> | null = null;

/** Match the exchange and preferred equity series; symbol-only cross-exchange matches are unsafe. */
export function moverInstrumentKeys(master: unknown): Map<string, string> {
  const rows = new Map<string, { key: string; priority: number }>();
  if (!Array.isArray(master)) return new Map();
  for (const item of master as Instrument[]) {
    if (!item || typeof item !== "object") continue;
    const symbol = item.trading_symbol?.trim().toUpperCase() ?? "";
    const key = item.instrument_key?.trim() ?? "";
    const priority = PRIORITY.indexOf(item.instrument_type?.toUpperCase() ?? "");
    if (item.segment !== "NSE_EQ" || item.exchange !== "NSE" || priority < 0 || !/^[A-Z0-9&_-]{1,20}$/.test(symbol) || !/^NSE_EQ\|INE[A-Z0-9]+$/.test(key)) continue;
    const current = rows.get(symbol);
    if (!current || priority < current.priority) rows.set(symbol, { key, priority });
  }
  return new Map([...rows].map(([symbol, value]) => [symbol, value.key]));
}

async function instrumentKeys() {
  if (instrumentCache && instrumentCache.until > Date.now()) return instrumentCache.keys;
  instrumentPending ??= (async () => {
    const response = await fetch(MASTER, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
    if (!response.ok || !response.body) throw new Error("NSE instrument directory unavailable.");
    const data = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
    const keys = moverInstrumentKeys(data);
    if (!keys.size) throw new Error("NSE instrument directory was empty.");
    instrumentCache = { until: Date.now() + 30 * 60_000, keys };
    return keys;
  })().finally(() => { instrumentPending = null; });
  return instrumentPending;
}

async function scan(tab: MoverTab) {
  const response = await fetch(SCAN, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; PaperTrade/1.0)" },
    body: JSON.stringify(moverScan(tab)), signal: AbortSignal.timeout(4_500),
  });
  if (!response.ok) throw new Error(`Market scan returned ${response.status}.`);
  const payload = await response.json() as { data?: unknown };
  if (!Array.isArray(payload?.data)) throw new Error("Market scan did not return a valid snapshot.");
  const rows = quotesFromScan(payload);
  if (payload.data.length && !rows.length) throw new Error("Market scan contained no usable quote data.");
  return rows;
}

async function verify(rows: Quote[]): Promise<MoverVerification> {
  const quotes = new Map<string, Quote>();
  if (!isUpstoxConfigured()) return { quotes, warning: "Broker quote verification is unavailable. Scanner prices may be delayed." };
  const keys = await instrumentKeys();
  const requested = new Map(rows.flatMap(row => {
    const key = keys.get(row.symbol);
    return key ? [[key, row] as const] : [];
  }));
  if (!requested.size) return { quotes, warning: "These scanner symbols could not be matched to NSE broker instruments." };
  const params = new URLSearchParams({ instrument_key: [...requested.keys()].sort().join(",") });
  const payload = await upstoxFetch<{ status?: string; data?: Record<string, UpstoxQuote & { average_price?: unknown }> }>(`/v2/market-quote/quotes?${params}`);
  if (payload.status !== "success" || !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new Error("Broker quote verification returned an invalid snapshot.");
  for (const raw of Object.values(payload.data)) {
    const key = typeof raw?.instrument_token === "string" ? raw.instrument_token : "";
    const candidate = requested.get(key);
    if (!candidate) continue;
    const quote = normalizeUpstoxQuote(raw);
    if (!quote || quote.changeAvailable === false || !(quote.previousClose > 0)) continue;
    const quoteAt = quote.updatedAt || quote.lastTradeAt || null;
    const average = typeof raw.average_price === "number" && Number.isFinite(raw.average_price) && raw.average_price > 0 ? raw.average_price : null;
    quotes.set(candidate.symbol, {
      ...candidate, instrumentKey: key, price: quote.lastPrice, previousClose: quote.previousClose,
      changeAbs: quote.lastPrice - quote.previousClose,
      change: ((quote.lastPrice - quote.previousClose) / quote.previousClose) * 100,
      high: quote.high, low: quote.low, volume: quote.volume ?? candidate.volume,
      tradedValue: average !== null && quote.volume ? average * quote.volume : null,
      source: "upstox", quoteAt, delayed: moverQuoteDelayed(quoteAt),
    });
  }
  return { quotes, warning: quotes.size < rows.length ? "Some NSE prices could not be verified with the broker. Those rows retain the delayed scanner snapshot." : null };
}

export const loadMarketMovers = createMoverService({ scan, verify });
