import { upstoxFreshFetch, upstoxErrorResponse } from '@/lib/upstox-server';
import { buildTodayDivergenceReport, buildTradingReport, indiaMonth, psbbHistoryPlan, TRADING_TIMEFRAMES, PSBB_SCAN_VERSION, LIVE_DIVERGENCE_VERSION, type TradingTimeframe, type TradingReport, type TodayDivergenceReport } from '@/lib/psbb-watchlist';
import type { Candle } from '@/lib/market';
import { isTradingInstrument } from '@/lib/trading-universes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Payload = { status?: string; data?: { candles?: Array<[string | number, number, number, number, number, number?]> } };
const cache = new Map<string, { until: number; report: TradingReport | TodayDivergenceReport }>();
const pending = new Map<string, Promise<TradingReport | TodayDivergenceReport>>();
const historical = new Map<string, { until: number; candles: Candle[] }>();
const historicalPending = new Map<string, Promise<Candle[]>>();
async function todayHistory(path: string, currentDay: boolean) {
  const cached = historical.get(path);
  if (cached && cached.until > Date.now()) return cached.candles;
  const inFlight = historicalPending.get(path);
  if (inFlight) return inFlight;
  const work = (async () => {
    const candles = normalize(await upstoxFreshFetch<Payload>(path));
    if (historical.size >= 1000) historical.delete(historical.keys().next().value!);
    historical.set(path, { candles, until: Date.now() + (currentDay ? 55000 : 6 * 3600000) });
    return candles;
  })();
  historicalPending.set(path, work);
  try { return await work; } finally { historicalPending.delete(path); }
}

function normalize(payload: Payload): Candle[] {
  if (payload.status !== 'success' || !Array.isArray(payload.data?.candles)) throw new Error('Candle history unavailable.');
  return payload.data.candles.map(([stamp, open, high, low, close, volume]) => ({
    time: typeof stamp === 'number' ? Math.floor(stamp > 1e12 ? stamp / 1000 : stamp) : Date.parse(stamp) / 1000,
    open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume ?? 0),
  })).filter((bar) => Object.values(bar).every(Number.isFinite) && bar.high >= bar.low && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close));
}
export async function GET(request: Request) {
  const url = new URL(request.url), instrumentKey = url.searchParams.get('instrumentKey') ?? '', todayOnly = url.searchParams.get('today') === '1', month = todayOnly ? indiaMonth() : url.searchParams.get('month') ?? '';
  const timeframe = url.searchParams.get('timeframe') as TradingTimeframe;
  if (!isTradingInstrument(instrumentKey) || !TRADING_TIMEFRAMES.includes(timeframe)) return Response.json({ ok: false, error: { message: 'Choose an NSE stock, Nifty 50, Bank Nifty or Sensex and 1m, 5m, 15m, 1H or 4H.' } }, { status: 400 });
  let plan: ReturnType<typeof psbbHistoryPlan>;
  try { plan = psbbHistoryPlan(month, timeframe); } catch (error) { return Response.json({ ok: false, error: { message: (error as Error).message } }, { status: 400 }); }
  const inputs = { length: Number(url.searchParams.get('length') ?? 14), left: Number(url.searchParams.get('left') ?? 3), oversold: Number(url.searchParams.get('oversold') ?? 30), overbought: Number(url.searchParams.get('overbought') ?? 70) };
  if (!Number.isInteger(inputs.length) || inputs.length < 2 || inputs.length > 200 || !Number.isInteger(inputs.left) || inputs.left < 1 || inputs.left > 30 || !(inputs.oversold >= 1 && inputs.oversold <= 50) || !(inputs.overbought >= 50 && inputs.overbought <= 99)) return Response.json({ ok: false, error: { message: 'Invalid PSBB settings.' } }, { status: 400 });
  const key = JSON.stringify([todayOnly ? LIVE_DIVERGENCE_VERSION : PSBB_SCAN_VERSION, instrumentKey, timeframe, month, inputs]);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return Response.json({ ok: true, report: cached.report }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    let work = pending.get(key);
    if (!work) {
      work = (async () => {
        const encoded = encodeURIComponent(instrumentKey);
        // Each request scans one stock; clients limit concurrent stock requests.
        // Any failed segment fails this stock, rather than publishing false zeros.
        const groups: Candle[][] = [];
        for (const chunk of plan.chunks) {
          const path = `/v3/historical-candle/${encoded}/${plan.unit}/${plan.interval}/${chunk.to}/${chunk.from}`;
          groups.push(todayOnly ? await todayHistory(path, chunk.to === new Date(Date.now() + 19800000).toISOString().slice(0, 10)) : normalize(await upstoxFreshFetch<Payload>(path)));
        }
        if (plan.currentMonth) groups.push(normalize(await upstoxFreshFetch<Payload>(`/v3/historical-candle/intraday/${encoded}/${plan.unit}/${plan.interval}`)));
        const report = todayOnly ? buildTodayDivergenceReport(instrumentKey, timeframe, groups.flat(), inputs) : buildTradingReport(instrumentKey, timeframe, month, groups.flat(), inputs);
        if (cache.size >= 500) cache.delete(cache.keys().next().value!);
        cache.set(key, { until: Date.now() + (plan.currentMonth ? 55000 : 3600000), report });
        return report;
      })();
      pending.set(key, work);
      void work.finally(() => pending.delete(key)).catch(() => undefined);
    }
    return Response.json({ ok: true, report: await work }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return upstoxErrorResponse(error); }
}
