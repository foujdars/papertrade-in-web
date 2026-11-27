import {
  normalizeGlobalCandles,
  normalizeDeltaCatalogue,
  normalizePerpQuote,
  normalizePerpSpec,
  isDeltaPerpSymbol,
  type PerpSymbol,
} from "@/lib/global-markets";
import { isSafeDeltaContractSymbol, normalizeDeltaOptionQuote, normalizeDeltaOptionSpec, normalizeDeltaSettlement } from "@/lib/global-contracts";
import { aggregateChartCandles, deltaHistoryPlan } from "@/lib/chart-history";
import { bookPrices, positiveQuote, type SpreadContract, type SpreadSeries } from "@/lib/vertical-spread";
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
      url.searchParams.set("contract_types", "perpetual_futures,futures,call_options,put_options");
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
async function spreadChain(params: URLSearchParams) {
  const root = params.get("underlying") ?? "";
  const seriesId = params.get("series") ?? "";
  if (!["BTC", "ETH"].includes(root)) {
    return Response.json({ ok: false, error: "Select BTC or ETH." }, { status: 400 });
  }
  const contracts = (await getCatalogue()).filter(item =>
    item.underlyingSymbol === root && item.assetType === "OPTION" && item.expiry &&
    Date.parse(item.expiry) > Date.now() && item.optionType && item.contractMultiplier && item.strikePrice);
  const seriesById = new Map<string, SpreadSeries>();
  for (const item of contracts) {
    const expiry = item.symbol.match(/(\d{2})(\d{2})(\d{2})$/);
    if (expiry) {
      const [, day, month, year] = expiry;
      seriesById.set(item.expiry!, { id: item.expiry!, expiry: `20${year}-${month}-${day}` });
    }
  }
  if (!seriesId) {
    const series = [...seriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({ ok: true, series }, { headers: { "Cache-Control": "no-store" } });
  }
  const selected = seriesById.get(seriesId);
  if (!selected) return Response.json({ ok: false, error: "This option expiry is no longer available." }, { status: 404 });
  const [year, month, day] = selected.expiry.split("-");
  const query = new URLSearchParams({
    contract_types: "call_options,put_options",
    underlying_asset_symbols: root,
    expiry_date: `${day}-${month}-${year}`,
  });
  let tickers: Record<string, any>[] = [];
  let quoteWarning: string | undefined;
  try {
    const response = await delta(`tickers?${query}`, 2000);
    if (!Array.isArray(response) || !response.length) throw new Error("Missing quotes");
    tickers = response;
  } catch {
    quoteWarning = "Delta option quotes are unavailable. You can enter premiums manually.";
  }
  const tickerBySymbol = new Map(tickers.map(ticker => [ticker.symbol, ticker]));
  let reference: number | null = null;
  const chain: SpreadContract[] = contracts.filter(item => item.expiry === seriesId).map(item => {
    const ticker = tickerBySymbol.get(item.symbol);
    const quotes = ticker?.quotes;
    reference ??= positiveQuote(ticker?.spot_price);
    return {
      id: item.symbol, series: seriesId, kind: item.optionType!, strike: item.strikePrice!,
      multiplier: item.contractMultiplier!,
      ...bookPrices(quotes?.best_bid, quotes?.best_ask, quotes?.bid_size, quotes?.ask_size),
      last: positiveQuote(ticker?.close),
    };
  });
  if (!quoteWarning && !chain.some(leg => leg.bid !== null || leg.ask !== null || leg.last !== null)) {
    quoteWarning = "No premiums were returned for this expiry. You can enter them manually.";
  }
  return Response.json({ ok: true, contracts: chain, reference, quoteWarning }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    symbol = params.get("symbol") ?? "BTCUSD",
    mode = params.get("mode") ?? "snapshot";
  if (mode === "spread-chain") {
    try { return await spreadChain(params); }
    catch { return Response.json({ ok: false, error: "Delta option contracts are temporarily unavailable." }, { status: 503 }); }
  }
  if (mode === "catalog") {
    try {
      return Response.json({ ok: true, instruments: await getCatalogue() }, { headers: { "Cache-Control": "public, max-age=60" } });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : "Catalogue unavailable." }, { status: 503 });
    }
  }
  if (!isSafeDeltaContractSymbol(symbol))
    return Response.json(
      { ok: false, error: "Unsupported Delta contract symbol." },
      { status: 400 },
    );
  try {
    const product = await delta(`products/${symbol}`, 300000);
    const kind = product.contract_type;
    if (!["perpetual_futures", "futures", "call_options", "put_options"].includes(kind) || product.quoting_asset?.symbol !== "USD" || product.settling_asset?.symbol !== "USD") throw new Error("Unsupported Delta contract.");
    if (mode === "candles") {
      const timeframe = params.get("timeframe") ?? "5m";
      let plan;
      try { plan = deltaHistoryPlan(timeframe, params); }
      catch (error) { return Response.json({ ok: false, error: (error as Error).message }, { status: 400 }); }
      const pages = await Promise.all(plan.windows.map(async ({ start, end }) => {
        const rows = await delta(`history/candles?symbol=${encodeURIComponent(symbol)}&resolution=${plan.resolution}&start=${start}&end=${end}`, end < Date.now() / 1000 - 86400 ? 300000 : 8000);
        if (!Array.isArray(rows)) throw new Error("Candle history is unavailable.");
        return normalizeGlobalCandles(rows);
      }));
      const unique = new Map(pages.flat().filter(c => c.time >= plan.start && c.time <= Math.min(plan.end, Date.now() / 1000) && (plan.before === null || c.time < plan.before)).map(c => [c.time, c]));
      const raw = [...unique.values()].sort((a, b) => a.time - b.time);
      const candles = plan.aggregate ? aggregateChartCandles(raw, timeframe) : raw;
      if (!candles.length && plan.before === null) throw new Error("No history is available for this contract on the selected date.");
      return Response.json(
        {
          ok: true,
          candles,
          history: { nextBefore: plan.start, hasMore: plan.start > 0 && candles.length > 0 },
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
    if (kind === "call_options" || kind === "put_options") {
      const settlement = normalizeDeltaSettlement(product, symbol);
      if (settlement !== null) return Response.json({ ok: true, kind: "option", settlement }, { headers: { "Cache-Control": "no-store" } });
      const spec = normalizeDeltaOptionSpec(product, symbol, Date.now());
      if (!spec.operational) throw new Error("Option is not open for trading.");
      const ticker = await delta(`tickers/${symbol}`, 2000);
      return Response.json({ ok: true, kind: "option", spec, quote: normalizeDeltaOptionQuote(ticker, symbol) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (kind === "futures") {
      if (product.state !== "live" || product.trading_status !== "operational") throw new Error("Dated future is not live.");
      const ticker = await delta(`tickers/${symbol}`, 2000);
      return Response.json({ ok: true, kind: "dated-future", quote: normalizeDeltaOptionQuote(ticker, symbol) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!isDeltaPerpSymbol(symbol)) throw new Error("Unsupported perpetual symbol.");
    const spec = normalizePerpSpec(product, symbol as PerpSymbol, Date.now());
    if (!spec.operational) throw new Error("Contract is not currently available for trading.");
    const ticker = await delta(`tickers/${symbol}`, 2000);
    return Response.json(
      {
        ok: true,
        kind: "perpetual",
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
