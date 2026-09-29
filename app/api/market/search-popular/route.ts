import { FALLBACK_POPULAR, moneycontrolCryptoSymbols, moneycontrolEquitySymbols, moneycontrolTrendingSymbols, moneycontrolUsSymbols, nextData, tradingViewLeaders, type PopularLists } from "@/lib/search-shelf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";
const TRENDING = "https://www.moneycontrol.com/mc-apis/trending-stocks/limit-30";
const INDIAN = "https://www.moneycontrol.com/stocks/market-stats/most-active-stocks-nse/";
const CRYPTO = "https://www.moneycontrol.com/cryptocurrency/";
const US = "https://www.moneycontrol.com/us-markets/market-movers/top-companies-by-market-cap?index=Dow";
let cache: { until: number; value: PopularLists } | null = null;
let pending: Promise<PopularLists> | null = null;

async function text(url: string) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Moneycontrol unavailable");
  return response.text();
}

async function json(url: string) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Moneycontrol unavailable");
  return response.json();
}

async function load(): Promise<PopularLists> {
  const [trending, indian, crypto, us, leaders] = await Promise.all([
    json(TRENDING).then(moneycontrolTrendingSymbols).catch(() => [] as string[]),
    text(INDIAN).then(html => moneycontrolEquitySymbols(nextData(html))).catch(() => [] as string[]),
    text(CRYPTO).then(html => moneycontrolCryptoSymbols(nextData(html))).catch(() => [] as string[]),
    text(US).then(html => moneycontrolUsSymbols(nextData(html))).catch(() => [] as string[]),
    fetch("https://scanner.tradingview.com/america/scan", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ preset: "volume_leaders", columns: ["name"], range: [0, 30] }),
      signal: AbortSignal.timeout(8000),
    }).then(async response => tradingViewLeaders(response.ok ? await response.json() : null)).catch(() => [] as string[]),
  ]);
  return {
    in: trending.length >= 8 ? trending : indian.length >= 8 ? indian : FALLBACK_POPULAR.in,
    us: us.length >= 8 ? us : leaders.length >= 8 ? leaders : FALLBACK_POPULAR.us,
    crypto: crypto.length >= 4 ? crypto : FALLBACK_POPULAR.crypto,
    sources: {
      in: trending.length >= 8 ? "moneycontrol" : indian.length >= 8 ? "moneycontrol-active" : "fallback",
      us: us.length >= 8 ? "moneycontrol" : leaders.length >= 8 ? "tradingview" : "fallback",
      crypto: crypto.length >= 4 ? "moneycontrol" : "fallback",
    },
  };
}

export async function GET() {
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, ...cache.value }, { headers: { "Cache-Control": "public, max-age=300" } });
  pending ??= load().finally(() => { pending = null; });
  try {
    const value = await pending;
    cache = { until: Date.now() + 15 * 60 * 1000, value };
    return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ ok: true, ...FALLBACK_POPULAR }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
