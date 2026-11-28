import type { FnoUnderlying } from "@/lib/fno";
import type { Instrument } from "@/lib/market";
import { segmentFuture } from "@/lib/indian-futures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Exchange = "NSE" | "BSE";
const CACHE_TTL = 6 * 60 * 60 * 1_000;

type UpstoxDerivative = {
  segment?: string;
  instrument_type?: string;
  underlying_key?: string;
  underlying_symbol?: string;
  underlying_type?: string;
  name?: string;
  instrument_key?: string;
  trading_symbol?: string;
  expiry?: string | number;
  last_trading_date?: string | number;
  qty_multiplier?: number;
  lot_size?: number;
  last_price?: number;
};

type Catalogue = { underlyings: FnoUnderlying[]; segmentFutures: Instrument[] };
const cache = new Map<Exchange, { expiresAt: number; catalogue: Catalogue }>();
const pending = new Map<Exchange, Promise<Catalogue>>();

async function loadMaster(exchange: Exchange) {
  const response = await fetch(`https://assets.upstox.com/market-quote/instruments/exchange/${exchange}.json.gz`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error(`Unable to download the ${exchange} instrument master.`);
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).json() as Promise<UpstoxDerivative[]>;
}

function normalizeIndexSymbol(value: string) {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    "NIFTY 50": "NIFTY",
    "NIFTY BANK": "BANKNIFTY",
    "NIFTY FIN SERVICE": "FINNIFTY",
    "NIFTY MID SELECT": "MIDCPNIFTY",
    "NIFTY NEXT 50": "NIFTYNXT50",
  };
  return aliases[normalized] ?? normalized.replace(/[^A-Z0-9]/g, "");
}

function normalizeExpiry(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1_000;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function groupMaster(exchange: Exchange) {
  const master = await loadMaster(exchange);
  const grouped = new Map<string, FnoUnderlying>();
  const segmentFutures: Instrument[] = [];
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  for (const item of master) {
    if (item.instrument_type === "FUT" && ["NCD_FO","BCD_FO","NSE_COM"].includes(item.segment ?? "")) {
      const expiry = normalizeExpiry(item.last_trading_date ?? item.expiry);
      const future = expiry >= todayIst ? segmentFuture(item, exchange, expiry) : undefined;
      if (future) segmentFutures.push(future);
      continue;
    }
    if (item.segment !== exchange + "_FO" || !item.underlying_key || !item.underlying_symbol) continue;
    if (item.instrument_type !== "CE" && item.instrument_type !== "PE" && item.instrument_type !== "FUT") continue;
    if (exchange === "BSE" && item.instrument_type !== "FUT") continue;
    const underlyingType = item.underlying_type === "INDEX" ? "INDEX" : "EQUITY";
    const symbol = underlyingType === "INDEX"
      ? normalizeIndexSymbol(item.underlying_symbol)
      : item.underlying_symbol.trim().toUpperCase();
    const current = grouped.get(item.underlying_key) ?? {
      symbol,
      name: item.name?.trim() || symbol,
      instrumentKey: item.underlying_key,
      underlyingType,
      optionContracts: 0,
      futureContracts: 0,
      futures: [],
    } satisfies FnoUnderlying;
    if (item.instrument_type === "FUT") {
      const expiry = normalizeExpiry(item.expiry);
      if (item.instrument_key?.startsWith(exchange + "_FO|") && item.trading_symbol && expiry && expiry >= todayIst && Number.isSafeInteger(item.lot_size) && item.lot_size! > 0) {
        current.futureContracts += 1;
        current.futures?.push({
          instrumentKey: item.instrument_key,
          tradingSymbol: item.trading_symbol.trim(),
          expiry,
          lotSize: item.lot_size!,
          lotSizeVerified: true,
          lastPrice: Number(item.last_price) || 0,
        });
      }
    } else current.optionContracts += 1;
    grouped.set(item.underlying_key, current);
  }

  const underlyings = [...grouped.values()].filter(item => item.optionContracts || item.futureContracts)
    .map(item => ({ ...item, futures: item.futures?.sort((a, b) => a.expiry.localeCompare(b.expiry)) }));
  return { underlyings, segmentFutures };
}

async function loadExchange(exchange: Exchange) {
  const hit = cache.get(exchange);
  if (hit && hit.expiresAt > Date.now()) return hit.catalogue;
  const loading = pending.get(exchange);
  if (loading) return loading;
  const job = groupMaster(exchange).then(catalogue => {
    cache.set(exchange, { expiresAt: Date.now() + CACHE_TTL, catalogue });
    return catalogue;
  });
  pending.set(exchange, job);
  try { return await job; } finally { pending.delete(exchange); }
}

export async function GET() {
  const exchanges = ["NSE", "BSE"] as const;
  const results = await Promise.allSettled(exchanges.map(loadExchange));
  const unavailableExchanges = exchanges.filter((_, i) => results[i].status === "rejected");
  if (unavailableExchanges.length === exchanges.length) {
    return Response.json({ ok: false, error: { code: "FNO_MASTER_UNAVAILABLE", message: "Unable to load the Indian F&O instrument masters." } },
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const priority = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"];
  const rank = (symbol: string) => { const i = priority.indexOf(symbol); return i < 0 ? priority.length : i; };
  const catalogues = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  const underlyings = catalogues.flatMap(item => item.underlyings)
    .sort((a, b) => rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol));
  return Response.json({ ok: true, source: "Upstox exchange instrument masters", underlyings, segmentFutures: catalogues.flatMap(item => item.segmentFutures), unavailableExchanges, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": unavailableExchanges.length ? "no-store" : "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
