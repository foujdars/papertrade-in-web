import { inNseCashSession } from "@/lib/india-pulse";
import { quotesFromWatch, watchIndex, watchScan, type WatchQuote } from "@/lib/equity-watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const SCAN = "https://scanner.tradingview.com/india/scan";

const cache = new Map<string, { until: number; rows: WatchQuote[] }>();
const pending = new Map<string, Promise<WatchQuote[]>>();

async function load(indexSymbol: string): Promise<WatchQuote[]> {
  const response = await fetch(SCAN, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(watchScan(indexSymbol)),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  return quotesFromWatch(await response.json());
}

export async function GET(request: Request) {
  const index = watchIndex(new URL(request.url).searchParams.get("index"));
  const freshFor = inNseCashSession() ? 30_000 : 10 * 60 * 1000;
  const hit = cache.get(index.id);
  const headers = { "Cache-Control": `public, max-age=${inNseCashSession() ? 20 : 120}` };
  if (hit && hit.until > Date.now()) return Response.json({ ok: true, index: index.id, label: index.label, rows: hit.rows }, { headers });
  const flight = pending.get(index.id) ?? load(index.symbol).catch(() => [] as WatchQuote[]).finally(() => pending.delete(index.id));
  pending.set(index.id, flight);
  const rows = await flight;
  cache.set(index.id, { until: Date.now() + freshFor, rows });
  return Response.json({ ok: true, index: index.id, label: index.label, rows }, { headers });
}
