import { fiiDii, indexBreadth, indiaVix, nextData, nseBreadth } from "@/lib/india-pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const HOME = "https://www.moneycontrol.com/";
const VIX = "https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/in%3BIDXN";
const BREADTH = "https://www.moneycontrol.com/stocksmarketsindia/heat-map-advance-decline-ratio-nse-bse";
const FLOWS = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/homebody.php";

type Pulse = {
  breadth: ReturnType<typeof nseBreadth>;
  indices: ReturnType<typeof indexBreadth>;
  vix: ReturnType<typeof indiaVix>;
  flows: ReturnType<typeof fiiDii>;
};

let cache: { until: number; value: Pulse } | null = null;
let pending: Promise<Pulse> | null = null;

async function text(url: string) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Moneycontrol unavailable");
  return response.text();
}

async function load(): Promise<Pulse> {
  const [home, vix, breadth, flows] = await Promise.all([
    text(HOME).then(nseBreadth).catch(() => null),
    fetch(VIX, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => indiaVix(response.ok ? await response.json() : null)).catch(() => null),
    text(BREADTH).then(html => indexBreadth(nextData(html))).catch(() => []),
    text(FLOWS).then(html => fiiDii(nextData(html))).catch(() => []),
  ]);
  return { breadth: home, indices: breadth, vix, flows };
}

export async function GET() {
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, ...cache.value }, { headers: { "Cache-Control": "public, max-age=120" } });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + 10 * 60 * 1000, value };
  return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": "public, max-age=120" } });
}
