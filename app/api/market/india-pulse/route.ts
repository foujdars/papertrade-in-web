import { fiiDii, inNseCashSession, indiaVix, nextData } from "@/lib/india-pulse";
import { liveNseBreadth, recordNseAdTape } from "@/lib/india-ad-tape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const VIX = "https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/in%3BIDXN";
const FLOWS = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/homebody.php";

type Pulse = {
  breadth: Awaited<ReturnType<typeof liveNseBreadth>>;
  tape: Awaited<ReturnType<typeof recordNseAdTape>>;
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
  const now = Date.now();
  const [breadth, vix, flows] = await Promise.all([
    liveNseBreadth(),
    fetch(VIX, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => indiaVix(response.ok ? await response.json() : null)).catch(() => null),
    text(FLOWS).then(html => fiiDii(nextData(html))).catch(() => []),
  ]);
  const tape = await recordNseAdTape(breadth, undefined, now);
  return { breadth, tape, vix, flows };
}

export async function GET() {
  const freshFor = inNseCashSession() ? 20_000 : 10 * 60 * 1000;
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, ...cache.value }, { headers: { "Cache-Control": `public, max-age=${inNseCashSession() ? 15 : 120}` } });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + freshFor, value };
  return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": `public, max-age=${inNseCashSession() ? 15 : 120}` } });
}
