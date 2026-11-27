import { globalReferenceInstrument } from "@/lib/global-reference";
import { referenceCandles, referenceHistoryPlan } from "@/lib/global-reference-data";

export const dynamic = "force-dynamic";

const cache = new Map<string, { expiresAt: number; response: ReturnType<typeof referenceCandles> }>();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol") ?? "";
  const timeframe = params.get("timeframe") ?? "5m";
  if (!globalReferenceInstrument(symbol)) {
    return Response.json({ ok: false, error: "Unsupported reference instrument." }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  let plan;
  try {
    plan = referenceHistoryPlan(timeframe, params, now);
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
  const key = JSON.stringify([symbol, timeframe, params.get("before"), params.get("date"), params.get("years")]);
  let entry = cache.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    entry = { expiresAt: now + 60, response: referenceCandles(symbol, timeframe, plan, now) };
    cache.set(key, entry);
  }
  try {
    return Response.json({ ok: true, ...await entry.response }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (cache.get(key) === entry) cache.delete(key);
    return Response.json({ ok: false, error: (error as Error).message }, { status: 503 });
  }
}
