import type { FnoUnderlying } from "@/lib/fno";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NSE_INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const CACHE_TTL = 6 * 60 * 60 * 1_000;

type UpstoxDerivative = {
  segment?: string;
  instrument_type?: string;
  underlying_key?: string;
  underlying_symbol?: string;
  underlying_type?: string;
  name?: string;
};

let cache: { expiresAt: number; underlyings: FnoUnderlying[] } | null = null;

async function loadNseMaster() {
  const response = await fetch(NSE_INSTRUMENTS_URL, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Unable to download the current NSE F&O instrument master.");
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

async function loadUnderlyings() {
  if (cache && cache.expiresAt > Date.now()) return cache.underlyings;
  const master = await loadNseMaster();
  const grouped = new Map<string, FnoUnderlying>();

  for (const item of master) {
    if (item.segment !== "NSE_FO" || !item.underlying_key || !item.underlying_symbol) continue;
    if (item.instrument_type !== "CE" && item.instrument_type !== "PE" && item.instrument_type !== "FUT") continue;
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
    } satisfies FnoUnderlying;
    if (item.instrument_type === "FUT") current.futureContracts += 1;
    else current.optionContracts += 1;
    grouped.set(item.underlying_key, current);
  }

  const priority = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"];
  const underlyings = [...grouped.values()]
    .filter((item) => item.optionContracts > 0)
    .sort((a, b) => {
      const aPriority = priority.indexOf(a.symbol);
      const bPriority = priority.indexOf(b.symbol);
      if (aPriority >= 0 || bPriority >= 0) return (aPriority < 0 ? 999 : aPriority) - (bPriority < 0 ? 999 : bPriority);
      return a.symbol.localeCompare(b.symbol);
    });
  cache = { expiresAt: Date.now() + CACHE_TTL, underlyings };
  return underlyings;
}

export async function GET() {
  try {
    const underlyings = await loadUnderlyings();
    return Response.json(
      { ok: true, source: "Upstox NSE BOD instruments", underlyings, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: { code: "FNO_MASTER_UNAVAILABLE", message: error instanceof Error ? error.message : "Unable to load NSE F&O instruments." } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
