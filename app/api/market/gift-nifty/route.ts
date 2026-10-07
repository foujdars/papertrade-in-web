import { upstoxFetch } from '@/lib/upstox-server';
import { completedFutureClose, type GiftSnapshot } from '@/lib/home-derivatives';
import { nseDate, type NseSession } from '@/lib/market-hours';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const cache = new Map<string, { until: number; value: GiftSnapshot }>();
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('futureKey') ?? '';
  if (key && !/^NSE_FO\|[A-Z0-9]+$/.test(key)) return Response.json({ ok: false }, { status: 400 });
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return Response.json({ ok: true, ...hit.value }, { headers: { 'Cache-Control': 'no-store' } });
  const now = new Date(), date = nseDate(now), from = nseDate(new Date(+now - 20 * 86400_000));
  const giftTask = upstoxFetch<{ data?: Record<string, { last_price?: number; timestamp?: string; last_trade_time?: string }> }>(`/v2/market-quote/quotes?${new URLSearchParams({ instrument_key: 'GLOBAL_INDEX|SGX NIFTY' })}`).then(payload => {
    const quote = Object.values(payload.data ?? {})[0];
    const price = quote?.last_price, time = quote?.timestamp || quote?.last_trade_time || '';
    const numeric = Number(time);
    const epoch = /^\d+$/.test(time) ? numeric > 10_000_000_000 ? numeric : numeric * 1000 : Date.parse(time);
    return typeof price === 'number' && Number.isFinite(price) && price > 0 && Number.isFinite(epoch) && epoch > 0 ? { price, asOf: new Date(epoch).toISOString() } : null;
  }).catch(() => null);
  const closeTask = key ? Promise.all([
    fetch(`https://api.upstox.com/v2/market/timings/${date}`, { signal: AbortSignal.timeout(8000) }).then(async r => {
      if (!r.ok) return null;
      const p = await r.json();
      if (p.status !== 'success' || !Array.isArray(p.data)) return null;
      return { date, checkedAt: +now, status: 'NORMAL_CLOSE', source: 'Upstox dated calendar', sessions: p.data.filter((r: { exchange: string }) => r.exchange === 'NSE').map((r: { start_time: number; end_time: number }) => ({ start: r.start_time, end: r.end_time })) } as NseSession;
    }).catch(() => null),
    upstoxFetch<{ data?: { candles?: unknown[] } }>(`/v3/historical-candle/${encodeURIComponent(key)}/days/1/${date}/${from}`).then(p => p.data?.candles ?? []).catch(() => []),
    upstoxFetch<{ data?: { candles?: unknown[] } }>(`/v3/historical-candle/intraday/${encodeURIComponent(key)}/days/1`).then(p => p.data?.candles ?? []).catch(() => []),
  ]).then(([session, history, intraday]) => completedFutureClose([...intraday, ...history], now, session)) : Promise.resolve(null);
  const [gift, futureClose] = await Promise.all([giftTask, closeTask]);
  const value = { gift, futureClose, checkedAt: now.toISOString(), futureKey: key };
  if (cache.size > 20) cache.clear();
  cache.set(key, { until: Date.now() + 30_000, value });
  return Response.json({ ok: true, ...value }, { headers: { 'Cache-Control': 'no-store' } });
}
