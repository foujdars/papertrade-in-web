import { inNseCashSession } from "@/lib/india-pulse";
import { MOVER_TABS, moverScan, presentMovers, quotesFromScan, type Mover, type MoverTab } from "@/lib/market-movers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const SCAN = "https://scanner.tradingview.com/india/scan";

const cache = new Map<string,{until:number;value:Partial<Record<MoverTab,Mover[]>>}>();
const pending = new Map<string,Promise<Partial<Record<MoverTab,Mover[]>>>>();

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

async function load(summary: boolean): Promise<Partial<Record<MoverTab, Mover[]>>> {
  const tabs = summary ? MOVER_TABS.filter(tab => tab.id === "gainers" || tab.id === "losers") : MOVER_TABS;
  const rows = await Promise.all(tabs.map(async tab => [tab.id, await one(tab.id).catch(() => [])] as const));
  return Object.fromEntries(rows) as Partial<Record<MoverTab, Mover[]>>;
}

export async function GET(request: Request) {
  const summary = new URL(request.url).searchParams.get("summary") === "1";
  const key = summary ? "summary" : "all";
  const hit = cache.get(key);
  const freshFor = inNseCashSession() ? (summary ? 10_000 : 30_000) : 10 * 60 * 1000;
  if (hit && hit.until > Date.now()) return Response.json({ ok: true, lists: hit.value }, { headers: { "Cache-Control": "no-store" } });
  const flight = pending.get(key) ?? load(summary).finally(() => pending.delete(key));
  pending.set(key,flight);
  const value = await flight;
  cache.set(key,{until:Date.now()+freshFor,value});
  return Response.json({ ok: true, lists: value }, { headers: { "Cache-Control": "no-store" } });
}
