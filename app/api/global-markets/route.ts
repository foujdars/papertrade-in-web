import {
  normalizeGlobalCandles,
  normalizeDeltaCatalogue,
  normalizePerpQuote,
  normalizePerpSpec,
  isDeltaPerpSymbol,
  type PerpSymbol,
} from "@/lib/global-markets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<any>>();
let catalogue: { until: number; value: ReturnType<typeof normalizeDeltaCatalogue> } | null = null;
let cataloguePending: Promise<ReturnType<typeof normalizeDeltaCatalogue>> | null = null;
async function getCatalogue() {
  if (catalogue && catalogue.until > Date.now()) return catalogue.value;
  if (cataloguePending) return cataloguePending;
  cataloguePending = (async () => {
    const rows: Record<string, any>[] = [];
    let after = "";
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://api.india.delta.exchange/v2/products");
      url.searchParams.set("contract_types", "perpetual_futures");
      url.searchParams.set("states", "live");
      url.searchParams.set("page_size", "1000");
      if (after) url.searchParams.set("after", after);
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Delta catalogue temporarily unavailable.");
      const body = await response.json();
      if (!body.success || !Array.isArray(body.result)) throw new Error("Delta catalogue returned no data.");
      rows.push(...body.result);
      after = typeof body.meta?.after === "string" ? body.meta.after : "";
      if (!after) break;
      if (page === 9) throw new Error("Delta catalogue is incomplete. Try again later.");
    }
    const instruments = normalizeDeltaCatalogue(rows);
    if (!instruments.length) throw new Error("No supported Delta contracts are available.");
    catalogue = { until: Date.now() + 300000, value: instruments };
    return instruments;
  })();
  try { return await cataloguePending; }
  finally { cataloguePending = null; }
}
async function delta(path: string, ttl: number): Promise<any> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.value;
  if (pending.has(path)) return pending.get(path);
  const job = (async () => {
    const r = await fetch(`https://api.india.delta.exchange/v2/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Delta data temporarily unavailable.");
    const body = await r.json();
    if (!body.success) throw new Error("Delta returned no data.");
    if (cache.size > 100) cache.clear();
    cache.set(path, { until: Date.now() + ttl, value: body.result });
    return body.result;
  })();
  pending.set(path, job);
  try {
    return await job;
  } finally {
    pending.delete(path);
  }
}
const resolutions: Record<string, number> = {
  "1m": 60,
  "2m": 120,
  "3m": 180,
  "5m": 300,
  "10m": 600,
  "15m": 900,
  "30m": 1800,
  "1H": 3600,
  "2H": 7200,
  "3H": 10800,
  "4H": 14400,
  "1D": 86400,
};
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    symbol = params.get("symbol") ?? "BTCUSD",
    mode = params.get("mode") ?? "snapshot";
  if (mode === "catalog") {
    try {
      return Response.json({ ok: true, instruments: await getCatalogue() }, { headers: { "Cache-Control": "public, max-age=60" } });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "Catalogue unavailable." }, { status: 503 });
    }
  }
  if (!isDeltaPerpSymbol(symbol))
    return Response.json(
      { ok: false, error: "Unsupported Delta contract symbol." },
      { status: 400 },
    );
  try {
    const product = await delta(`products/${symbol}`, 300000);
    const spec = normalizePerpSpec(product, symbol as PerpSymbol, Date.now());
    if (!spec.operational) throw new Error("Contract is not currently available for trading.");
    if (mode === "candles") {
      const timeframe = params.get("timeframe") ?? "5m",
        seconds = resolutions[timeframe];
      if (!seconds)
        return Response.json(
          { ok: false, error: "Unsupported timeframe." },
          { status: 400 },
        );
      const end = Math.floor(Date.now() / 1000 / seconds) * seconds + seconds,
        start = end - 600 * seconds;
      const rows = await delta(
        `history/candles?symbol=${symbol}&resolution=${timeframe.toLowerCase()}&start=${start}&end=${end}`,
        8000,
      );
      if (!Array.isArray(rows))
        throw new Error("Candle history is unavailable.");
      const candles = normalizeGlobalCandles(rows).filter(
        (c) => c.time <= Date.now() / 1000,
      );
      if (!candles.length) throw new Error("No valid candles.");
      return Response.json(
        {
          ok: true,
          candles,
          source: "Delta Exchange India",
          fetchedAt: Date.now(),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (mode !== "snapshot")
      return Response.json(
        { ok: false, error: "Unsupported request." },
        { status: 400 },
      );
    const ticker = await delta(`tickers/${symbol}`, 2000);
    return Response.json(
      {
        ok: true,
        spec,
        quote: normalizePerpQuote(ticker, symbol as PerpSymbol),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Market data unavailable.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
