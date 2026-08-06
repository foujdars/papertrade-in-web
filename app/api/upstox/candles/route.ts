import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpstoxCandlePayload = {
  status: string;
  data?: { candles?: Array<[string | number, number, number, number, number, number?, number?]> };
};

type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type TimeframeConfig = {
  unit: "minutes" | "hours" | "days" | "weeks" | "months";
  interval: string;
  lookbackDays: number;
  historicalOnly?: boolean;
  aggregateYears?: boolean;
};

const timeframeMap: Record<string, TimeframeConfig> = {
  "1m": { unit: "minutes", interval: "1", lookbackDays: 7 },
  "2m": { unit: "minutes", interval: "2", lookbackDays: 7 },
  "3m": { unit: "minutes", interval: "3", lookbackDays: 10 },
  "5m": { unit: "minutes", interval: "5", lookbackDays: 14 },
  "10m": { unit: "minutes", interval: "10", lookbackDays: 20 },
  "15m": { unit: "minutes", interval: "15", lookbackDays: 30 },
  "30m": { unit: "minutes", interval: "30", lookbackDays: 45 },
  "1H": { unit: "hours", interval: "1", lookbackDays: 90 },
  "2H": { unit: "hours", interval: "2", lookbackDays: 90 },
  "3H": { unit: "hours", interval: "3", lookbackDays: 90 },
  "4H": { unit: "hours", interval: "4", lookbackDays: 90 },
  "1D": { unit: "days", interval: "1", lookbackDays: 365 },
  "1W": { unit: "weeks", interval: "1", lookbackDays: 3_650, historicalOnly: true },
  "1M": { unit: "months", interval: "1", lookbackDays: 7_300, historicalOnly: true },
  "1Y": { unit: "months", interval: "1", lookbackDays: 10_950, historicalOnly: true, aggregateYears: true },
};

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

function normalizeCandles(payload: UpstoxCandlePayload): ChartCandle[] {
  return (payload.data?.candles ?? [])
    .map((item) => ({
      time: Math.floor(new Date(item[0]).getTime() / 1000),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5] ?? 0),
    }))
    .filter((candle) =>
      Number.isFinite(candle.time) &&
      Number.isFinite(candle.open) &&
      Number.isFinite(candle.high) &&
      Number.isFinite(candle.low) &&
      Number.isFinite(candle.close) &&
      Number.isFinite(candle.volume),
    );
}

function mergeCandles(groups: ChartCandle[][]) {
  const candlesByTime = new Map<number, ChartCandle>();
  for (const candle of groups.flat()) {
    candlesByTime.set(Number(candle.time), candle);
  }
  return [...candlesByTime.values()]
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-1_600);
}

function aggregateAnnualCandles(candles: ChartCandle[]) {
  const byYear = new Map<number, ChartCandle>();
  for (const candle of candles.sort((a, b) => a.time - b.time)) {
    const year = new Date(candle.time * 1_000).getUTCFullYear();
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, { ...candle });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }
  return [...byYear.values()].sort((a, b) => a.time - b.time);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const instrumentKey = url.searchParams.get("instrumentKey") ?? "";
    const timeframe = url.searchParams.get("timeframe") ?? "5m";
    const scope = url.searchParams.get("scope") ?? "combined";
    const config = timeframeMap[timeframe as keyof typeof timeframeMap];

    if (!isSupportedNseInstrumentKey(instrumentKey)) {
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
    if (scope !== "combined" && scope !== "intraday") {
      return Response.json(
        { ok: false, error: { code: "INVALID_SCOPE", message: "Unsupported candle scope." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const toDate = indiaDate();
    const fromDate = indiaDate(-config.lookbackDays);
    const encodedKey = encodeURIComponent(instrumentKey);
    const historicalPath = `/v3/historical-candle/${encodedKey}/${config.unit}/${config.interval}/${toDate}/${fromDate}`;
    const intradayPath = `/v3/historical-candle/intraday/${encodedKey}/${config.unit}/${config.interval}`;
    let candles: ChartCandle[];
    let segments: string[];

    if (config.historicalOnly && scope === "intraday") {
      return Response.json(
        { ok: false, error: { code: "INTRADAY_NOT_AVAILABLE", message: "Weekly, monthly and yearly candles use historical data." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (config.historicalOnly) {
      const historical = await upstoxFetch<UpstoxCandlePayload>(historicalPath);
      candles = mergeCandles([normalizeCandles(historical)]);
      if (config.aggregateYears) candles = aggregateAnnualCandles(candles);
      segments = ["historical"];
    } else if (scope === "intraday") {
      const intraday = await upstoxFetch<UpstoxCandlePayload>(intradayPath);
      candles = mergeCandles([normalizeCandles(intraday)]);
      segments = ["intraday"];
    } else {
      const results = await Promise.allSettled([
        upstoxFetch<UpstoxCandlePayload>(historicalPath),
        upstoxFetch<UpstoxCandlePayload>(intradayPath),
      ]);
      const successful = results
        .map((result, index) => result.status === "fulfilled"
          ? { payload: result.value, segment: index === 0 ? "historical" : "intraday" }
          : null)
        .filter((result): result is { payload: UpstoxCandlePayload; segment: string } => Boolean(result));
      if (!successful.length) {
        const failure = results.find((result) => result.status === "rejected");
        throw failure && failure.status === "rejected" ? failure.reason : new Error("Upstox candles are unavailable.");
      }
      candles = mergeCandles(successful.map((result) => normalizeCandles(result.payload)));
      segments = successful.map((result) => result.segment);
    }

    if (!candles.length) {
      return Response.json(
        { ok: false, source: "upstox", error: { code: "NO_CANDLES", message: "Upstox returned no candles for this timeframe." } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      { ok: true, source: "upstox", segments, instrumentKey, timeframe, candles, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
