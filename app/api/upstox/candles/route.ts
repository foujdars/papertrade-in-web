import type { UTCTimestamp } from "lightweight-charts";
import { ALLOWED_UPSTOX_KEYS } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpstoxCandlePayload = {
  status: string;
  data?: { candles?: Array<[string | number, number, number, number, number, number?, number?]> };
};

const timeframeMap = {
  "1m": { unit: "minutes", interval: "1", lookbackDays: 7 },
  "5m": { unit: "minutes", interval: "5", lookbackDays: 14 },
  "15m": { unit: "minutes", interval: "15", lookbackDays: 30 },
  "1H": { unit: "hours", interval: "1", lookbackDays: 90 },
  "3H": { unit: "hours", interval: "3", lookbackDays: 90 },
  "4H": { unit: "hours", interval: "4", lookbackDays: 90 },
  "1D": { unit: "days", interval: "1", lookbackDays: 365 },
} as const;

function indiaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get("instrumentKey") ?? "";
    const timeframe = url.searchParams.get("timeframe") ?? "5m";
    const config = timeframeMap[timeframe as keyof typeof timeframeMap];

    if (!ALLOWED_UPSTOX_KEYS.has(instrumentKey)) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INSTRUMENT", message: "Unsupported instrument key." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!config) {
      return Response.json(
        { ok: false, error: { code: "INVALID_TIMEFRAME", message: "Unsupported chart timeframe." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const toDate = indiaDate();
    const fromDate = indiaDate(-config.lookbackDays);
    const path = `/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${config.unit}/${config.interval}/${toDate}/${fromDate}`;
    const payload = await upstoxFetch<UpstoxCandlePayload>(path);
    const candles = (payload.data?.candles ?? [])
      .map((item) => ({
        time: Math.floor(new Date(item[0]).getTime() / 1000) as UTCTimestamp,
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
      }))
      .filter((candle) =>
        Number.isFinite(candle.time) &&
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close),
      )
      .sort((a, b) => Number(a.time) - Number(b.time))
      .slice(-500);

    if (!candles.length) {
      return Response.json(
        { ok: false, source: "upstox", error: { code: "NO_CANDLES", message: "Upstox returned no candles for this timeframe." } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { ok: true, source: "upstox", instrumentKey, timeframe, candles, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
