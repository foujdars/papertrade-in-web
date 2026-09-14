import { upstoxFetch } from "@/lib/upstox-server";
import { getNseMarketStatus, nseDate, type NseSession } from "@/lib/market-hours";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const now = new Date();
  const requested = new URL(request.url).searchParams.get("date");
  if (requested && (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || !Number.isFinite(Date.parse(`${requested}T00:00:00Z`)))) return Response.json({ ok: false }, { status: 400 });
  const date = requested || nseDate(now);
  let session: NseSession = { date, checkedAt: now.getTime(), status: "UNAVAILABLE", sessions: [], source: "NSE via Upstox" };
  try {
    const [statusResult, timingResult] = await Promise.allSettled([
      date === nseDate(now) ? upstoxFetch<{ status: string; data: { exchange: string; status: string; last_updated: number } }>("/v2/market/status/NSE") : Promise.resolve(null),
      fetch(`https://api.upstox.com/v2/market/timings/${date}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000), next: { revalidate: 60 } }).then(async response => {
        if (!response.ok) throw new Error("Session calendar unavailable");
        return await response.json() as { status: string; data: Array<{ exchange: string; start_time: number; end_time: number }> };
      }),
    ]);
    if (timingResult.status !== "fulfilled") throw new Error("No dated exchange calendar");
    const timings = timingResult.value;
    const status = statusResult.status === "fulfilled" ? statusResult.value : null;
    if (timings.status !== "success" || !Array.isArray(timings.data)) throw new Error("Invalid session response");
    const sessions = timings.data.filter(s => s.exchange === "NSE" && Number.isFinite(s.start_time) && s.end_time > s.start_time && nseDate(new Date(s.start_time)) === date).map(s => ({ start: s.start_time, end: s.end_time }));
    // last_updated is the last exchange transition, so closed holidays may carry Friday's timestamp.
    // An OPEN status, however, must come from today's exchange session.
    const liveStatus = status?.status === "success" && status.data?.exchange === "NSE" ? status.data : null;
    const validOpen = liveStatus?.status !== "NORMAL_OPEN" || (Number.isFinite(liveStatus.last_updated) && nseDate(new Date(liveStatus.last_updated)) === date);
    const scheduledOpen = sessions.some(s => now.getTime() >= s.start && now.getTime() < s.end);
    session = { ...session, status: liveStatus ? validOpen ? liveStatus.status : "UNAVAILABLE" : scheduledOpen ? "NORMAL_OPEN" : "NORMAL_CLOSE", sessions, source: liveStatus ? "NSE exchange status via Upstox" : "NSE dated session calendar via Upstox" };
  } catch { /* Never enable orders from a guessed weekday session after a feed failure. */ }
  return Response.json({ ok: true, session, market: getNseMarketStatus(now, session) }, { headers: { "Cache-Control": "no-store" } });
}
