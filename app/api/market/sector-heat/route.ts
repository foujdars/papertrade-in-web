import { inNseCashSession } from "@/lib/india-pulse";
import { SECTORS, sectorChartUrl, sectorQuote, type SectorTile } from "@/lib/sector-heat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";

let cache: { until: number; sectors: SectorTile[] } | null = null;
let pending: Promise<SectorTile[]> | null = null;

async function one(sector: (typeof SECTORS)[number]): Promise<SectorTile | null> {
  const response = await fetch(sectorChartUrl(sector.symbol), {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const quote = sectorQuote(await response.json());
  if (!quote) return null;
  return { id: sector.id, label: sector.label, symbol: sector.symbol, watch: "watch" in sector ? sector.watch : null, chart: "chart" in sector ? sector.chart : null, price: quote.price, change: quote.change };
}

async function load() {
  const rows = await Promise.all(SECTORS.map(sector => one(sector).catch(() => null)));
  return rows.filter((row): row is SectorTile => row !== null);
}

export async function GET() {
  const freshFor = inNseCashSession() ? 30_000 : 10 * 60 * 1000;
  const headers = { "Cache-Control": `public, max-age=${inNseCashSession() ? 20 : 120}` };
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, sectors: cache.sectors }, { headers });
  pending ??= load().finally(() => { pending = null; });
  const sectors = await pending;
  cache = { until: Date.now() + freshFor, sectors };
  return Response.json({ ok: true, sectors }, { headers });
}
