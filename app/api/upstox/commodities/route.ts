import { mcxInstruments } from "@/lib/mcx";
import { isMcxSpreadRoot, mcxSpreadDirectory, mcxSpreadQuote, type McxOptionMasterRow, type McxOptionQuote, type McxSpreadRoot } from "@/lib/mcx-spread-chain";
import { upstoxFetch } from "@/lib/upstox-server";
import { positiveQuote, type SpreadChain } from "@/lib/vertical-spread";
import type { Instrument } from "@/lib/market";

export const dynamic = "force-dynamic";
type Catalogue = { fetchedAt: number; instruments: Instrument[]; master: McxOptionMasterRow[] };
let cache: Catalogue | null = null;
let pending: Promise<Catalogue> | null = null;

async function getCatalogue() {
  if (cache && Date.now() - cache.fetchedAt <= 30 * 60_000) return cache;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !response.body) throw new Error("MCX catalogue unavailable");
    const master = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json() as McxOptionMasterRow[];
    if (!Array.isArray(master)) throw new Error("Invalid MCX catalogue");
    cache = { fetchedAt: Date.now(), instruments: mcxInstruments(master), master };
    return cache;
  })();
  try { return await pending; }
  finally { pending = null; }
}

async function mcxOptionChain(master: McxOptionMasterRow[], root: McxSpreadRoot, seriesId: string) {
  const directory = mcxSpreadDirectory(master, root);
  const headers = { "Cache-Control": "no-store" };
  if (!seriesId) {
    const series = directory.series.map(({ id, expiry, detail }) => ({ id, expiry, detail }));
    return Response.json({ ok: true, series }, { headers });
  }
  const found = directory.series.find(item => item.id === seriesId);
  if (!found) return Response.json({ ok: false, error: "This MCX option expiry is no longer available." }, { status: 404, headers });

  const contracts = directory.contracts.filter(contract => contract.series === seriesId);
  const keys = [...contracts.map(contract => contract.id), ...(found.futureKey ? [found.futureKey] : [])];
  const jobs = [];
  for (let index = 0; index < keys.length; index += 200) {
    const params = new URLSearchParams({ instrument_key: keys.slice(index, index + 200).join(",") });
    jobs.push(upstoxFetch<{ data?: Record<string, McxOptionQuote> }>(`/v2/market-quote/quotes?${params}`));
  }
  const results = await Promise.allSettled(jobs);
  const quotes = new Map<string, McxOptionQuote>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const quote of Object.values(result.value.data ?? {})) {
      if (quote.instrument_token) quotes.set(quote.instrument_token, quote);
    }
  }
  const chain: SpreadChain = {
    contracts: contracts.map(contract => mcxSpreadQuote(contract, quotes.get(contract.id))),
    reference: found.futureKey ? positiveQuote(quotes.get(found.futureKey)?.last_price) : null,
  };
  if (!chain.contracts.some(leg => leg.bid !== null || leg.ask !== null || leg.last !== null)) {
    chain.quoteWarning = "MCX option quotes are unavailable. You can enter premiums manually.";
  } else if (results.some(result => result.status === "rejected")) {
    chain.quoteWarning = "Some MCX quotes are unavailable. You can enter missing premiums manually.";
  }
  return Response.json({ ok: true, ...chain }, { headers });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const root = params.get("optionRoot");
  if (root !== null && !isMcxSpreadRoot(root)) {
    return Response.json({ ok: false, error: "Select a supported MCX gold or silver product." }, { status: 400 });
  }
  try {
    const catalogue = await getCatalogue();
    if (root !== null && isMcxSpreadRoot(root)) return await mcxOptionChain(catalogue.master, root, params.get("series") ?? "");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    return Response.json({ ok: true, instruments: catalogue.instruments.filter(i => i.expiry! >= today), fetchedAt: catalogue.fetchedAt });
  } catch {
    return Response.json({ ok: false, instruments: [], error: "MCX catalogue unavailable. Please try again." }, { status: 503 });
  }
}
