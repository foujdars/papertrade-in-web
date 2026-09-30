import { inNseCashSession } from "@/lib/india-pulse";
import { MOVER_TABS, moverScan, presentMovers, quotesFromScan, type Mover, type MoverTab } from "@/lib/market-movers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const SCAN = "https://scanner.tradingview.com/india/scan";

let cache: { until: number; value: Record<MoverTab, Mover[]> } | null = null;
let pending: Promise<Record<MoverTab, Mover[]>> | null = null;

async function one(tab: MoverTab): Promise<Mover[]> {
  const response = await fetch(SCAN, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(moverScan(tab)),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  return presentMovers(tab, quotesFromScan(await response.json()));
}

async function load(): Promise<Record<MoverTab, Mover[]>> {
  const rows = await Promise.all(MOVER_TABS.map(async tab => [tab.id, await one(tab.id).catch(() => [])] as const));
  return Object.fromEntries(rows) as Record<MoverTab, Mover[]>;
}

export async function GET() {
  const freshFor = inNseCashSession() ? 30_000 : 10 * 60 * 1000;
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, lists: cache.value }, { headers: { "Cache-Control": `public, max-age=${inNseCashSession() ? 20 : 120}` } });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + freshFor, value };
  return Response.json({ ok: true, lists: value }, { headers: { "Cache-Control": `public, max-age=${inNseCashSession() ? 20 : 120}` } });
}
