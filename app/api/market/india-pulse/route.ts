import { fiiDii, historyFlows, inNseCashSession, indiaVix, mergeFlows, nextData, niftyCloses, withNifty } from "@/lib/india-pulse";
import { liveNseBreadth, recordNseAdTape } from "@/lib/india-ad-tape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const VIX = "https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/in%3BIDXN";
const FLOWS = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/homebody.php";
const FLOW_HISTORY = "https://raw.githubusercontent.com/MrChartist/fii-dii-data/main/data/history.json";
const NIFTY = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=1y";

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
  const [breadth, vix, scraped, history, nifty] = await Promise.all([
    liveNseBreadth(),
    fetch(VIX, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => indiaVix(response.ok ? await response.json() : null)).catch(() => null),
    text(FLOWS).then(html => fiiDii(nextData(html))).catch(() => []),
    fetch(FLOW_HISTORY, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => historyFlows(response.ok ? await response.json() : [])).catch(() => []),
    fetch(NIFTY, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => niftyCloses(response.ok ? await response.json() : null)).catch(() => []),
  ]);
  const flows = withNifty(mergeFlows(scraped, history), nifty);
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
