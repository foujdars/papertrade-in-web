import { fiiDii, historyFlows, inNseCashSession, indiaVix, istDay, istStamp, mergeFlows, nextData, niftyCloses, putCallRatio, withNifty, type PutCallRatio } from "@/lib/india-pulse";
import { liveNseBreadth, recordNseAdTape } from "@/lib/india-ad-tape";
import { upstoxFetch } from "@/lib/upstox-server";

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
  pcr: PutCallRatio | null;
  vixCheckedAt: number | null;
  sessionLive: boolean;
};

let cache: { until: number; value: Pulse } | null = null;
let pending: Promise<Pulse> | null = null;
let pcrCache: { until: number; value: PutCallRatio | null } | null = null;

async function text(url: string) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Moneycontrol unavailable");
  return response.text();
}

async function niftyPcr(now: number): Promise<PutCallRatio | null> {
  if (pcrCache && pcrCache.until > now) return pcrCache.value;
  let value: PutCallRatio | null = null;
  try {
    const instrument_key = "NSE_INDEX|Nifty 50";
    const params = new URLSearchParams({ instrument_key });
    const contracts = await upstoxFetch<{ data?: { expiry?: string | number }[] }>(`/v2/option/contract?${params}`);
    const expiry = [...new Set((contracts.data ?? []).map(row => {
      const raw = row.expiry;
      if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
      const numeric = Number(raw);
      if (!Number.isFinite(numeric) || numeric < 1_000_000_000) return "";
      return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString().slice(0, 10);
    }).filter(date => date >= istDay(now)))].sort()[0];
    if (expiry) {
      params.set("expiry_date", expiry);
      const chain = await upstoxFetch<{ data?: unknown[] }>(`/v2/option/chain?${params}`);
      value = putCallRatio(chain.data, expiry, new Date().toISOString());
    }
  } catch { /* The card displays unavailable until the option chain responds. */ }
  pcrCache = { until: Date.now() + (inNseCashSession(now) ? 60_000 : 10 * 60_000), value };
  return value;
}

async function load(): Promise<Pulse> {
  const now = Date.now();
  const [breadth, vixResult, scraped, history, nifty, pcr] = await Promise.all([
    liveNseBreadth(),
    fetch(VIX, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => {
      const value = indiaVix(response.ok ? await response.json() : null);
      return { value, checkedAt: value ? Date.now() : null };
    }).catch(() => ({ value: null, checkedAt: null })),
    text(FLOWS).then(html => fiiDii(nextData(html))).catch(() => []),
    fetch(FLOW_HISTORY, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => historyFlows(response.ok ? await response.json() : [])).catch(() => []),
    fetch(NIFTY, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => niftyCloses(response.ok ? await response.json() : null)).catch(() => []),
    niftyPcr(now),
  ]);
  const flows = withNifty(mergeFlows(scraped, history), nifty);
  const tape = await recordNseAdTape(breadth, undefined, now);
  return { breadth, tape, vix: vixResult.value, vixCheckedAt: vixResult.checkedAt, flows, pcr, sessionLive: inNseCashSession(now) };
}

export async function GET() {
  const now = Date.now();
  const live = inNseCashSession(now);
  // Never carry the previous session's cached tape across the 9:15 IST opening.
  const untilOpen = istStamp(istDay(now), 9, 15) - now;
  const freshFor = live ? 20_000 : untilOpen > 0 ? Math.min(10 * 60 * 1000, untilOpen) : 10 * 60 * 1000;
  if (cache && cache.until > now && cache.value.sessionLive === live) return Response.json({ ok: true, ...cache.value }, { headers: { "Cache-Control": "no-store" } });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + freshFor, value };
  return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": "no-store" } });
}
