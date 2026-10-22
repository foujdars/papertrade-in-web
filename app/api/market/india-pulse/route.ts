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
  breadthCheckedAt: number | null;
};

type Part = "breadth" | "vix" | "flows" | "gauges";
type Snapshot = Partial<Pulse>;
const cache = new Map<Part, { until: number; live: boolean; value: Snapshot }>();
const pending = new Map<Part, Promise<Snapshot>>();
let pcrCache: { until: number; value: PutCallRatio | null } | null = null;

async function text(url: string) {
  const response = await fetch(url, { cache: "no-store", headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
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

async function loadPart(part: Part, now: number): Promise<Snapshot> {
  if (part === "breadth") {
    // Hydrate history while the source is loading, not after it finishes.
    const [breadth] = await Promise.all([liveNseBreadth(), recordNseAdTape(null, undefined, now)]);
    // Sample as soon as breadth arrives; daily flows and option chains cannot hold it up.
    const sampledAt = Date.now();
    const tape = await recordNseAdTape(breadth, undefined, sampledAt);
    return { breadth, breadthCheckedAt: breadth ? sampledAt : null, tape, sessionLive: inNseCashSession(sampledAt) };
  }
  if (part === "vix") {
    try {
      const response = await fetch(VIX, { cache: "no-store", headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const vix = indiaVix(response.ok ? await response.json() : null);
      return { vix, vixCheckedAt: vix ? Date.now() : null };
    } catch { return { vix: null, vixCheckedAt: null }; }
  }
  if (part === "gauges") {
    const [vix, pcr] = await Promise.all([getPart("vix", now), niftyPcr(now)]);
    return { ...vix, pcr };
  }
  const [scraped, history, nifty] = await Promise.all([
    text(FLOWS).then(html => fiiDii(nextData(html))).catch(() => []),
    fetch(FLOW_HISTORY, { cache: "no-store", headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => historyFlows(response.ok ? await response.json() : [])).catch(() => []),
    fetch(NIFTY, { cache: "no-store", headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).then(async response => niftyCloses(response.ok ? await response.json() : null)).catch(() => []),
  ]);
  return { flows: withNifty(mergeFlows(scraped, history), nifty) };
}

async function getPart(part: Part, now: number): Promise<Snapshot> {
  const live = inNseCashSession(now);
  const hit = cache.get(part);
  if (hit && hit.until > now && hit.live === live) return hit.value;
  const existing = pending.get(part);
  if (existing) return existing;
  const request = loadPart(part, now).then(value => {
    const untilOpen = istStamp(istDay(now), 9, 15);
    const ttl = part === "breadth" ? (live ? 10_000 : 60_000) : part === "flows" ? 5 * 60_000 : live ? 20_000 : 60_000;
    // Do not carry the previous session through the opening, even across a slow request.
    const until = Math.min(now + ttl, untilOpen > now ? untilOpen : Infinity);
    cache.set(part, { until, live, value });
    return value;
  }).finally(() => pending.delete(part));
  pending.set(part, request);
  return request;
}

export async function GET(request: Request) {
  const now = Date.now();
  const part = new URL(request.url).searchParams.get("part");
  const value = part === "breadth" || part === "vix" || part === "flows" || part === "gauges"
    ? await getPart(part, now)
    : Object.assign({}, ...await Promise.all([getPart("breadth", now), getPart("gauges", now), getPart("flows", now)]));
  return Response.json({ ok: true, sessionLive: inNseCashSession(), ...value }, { headers: { "Cache-Control": "no-store" } });
}
