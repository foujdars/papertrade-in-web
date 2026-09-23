import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch, upstoxFreshFetch } from "@/lib/upstox-server";

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
    .slice(-5_000);
}

function aggregateAnnualCandles(candles: ChartCandle[]) {
  const byYear = new Map<number, ChartCandle>();
  for (const candle of candles.sort((a, b) => a.time - b.time)) {
    // Upstox month bars begin at 00:00 IST, still the previous UTC date.
    const year = new Date(candle.time * 1_000 + 19_800_000).getUTCFullYear();
    const existing = byYear.get(year);
    if (!existing) {
      byYear.set(year, { ...candle, time: Date.UTC(year, 0, 1) / 1_000 });
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
    const readCandles = url.searchParams.get("strict") === "1" ? upstoxFreshFetch : upstoxFetch;
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

    const years = Number(url.searchParams.get("years") ?? 0);
    const targetDate = url.searchParams.get("date");
    const target = targetDate ? Date.parse(targetDate) : null;
    if ((years && (![3, 5, 10].includes(years) || timeframe !== "1D")) ||
      (target !== null && (!Number.isFinite(target) || target < 0 || target > Date.now()))) {
      return Response.json({ ok: false, error: { message: "Choose a valid past date or a daily history range." } }, { status: 400 });
    }
    const requestedHistory = years > 0 || target !== null;
    const dateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const toDate = target !== null ? dateOnly(Math.min(Date.now(), target + config.lookbackDays * 43200000)) : indiaDate();
    const rangeStart = new Date(`${toDate}T00:00:00Z`);
    if (years) rangeStart.setUTCFullYear(rangeStart.getUTCFullYear() - years);
    else rangeStart.setUTCDate(rangeStart.getUTCDate() - config.lookbackDays);
    // Upstox only publishes daily-or-longer history from January 2000. A
    // 30-year annual request before that date is rejected rather than clipped.
    if (["days", "weeks", "months"].includes(config.unit) && rangeStart < new Date("2000-01-01T00:00:00Z")) {
      rangeStart.setTime(Date.parse("2000-01-01T00:00:00Z"));
    }
    const fromDate = dateOnly(rangeStart.getTime());
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

    if (config.historicalOnly || requestedHistory) {
      const historical = await readCandles<UpstoxCandlePayload>(historicalPath);
      candles = mergeCandles([normalizeCandles(historical)]);
      if (config.aggregateYears) candles = aggregateAnnualCandles(candles);
      segments = ["historical"];
    } else if (scope === "intraday") {
      const intraday = await readCandles<UpstoxCandlePayload>(intradayPath);
      candles = mergeCandles([normalizeCandles(intraday)]);
      segments = ["intraday"];
    } else {
      const results = await Promise.allSettled([
        readCandles<UpstoxCandlePayload>(historicalPath),
        readCandles<UpstoxCandlePayload>(intradayPath),
      ]);
      const successful = results
        .map((result, index) => result.status === "fulfilled"
          ? { payload: result.value, segment: index === 0 ? "historical" : "intraday" }
          : null)
        .filter((result): result is { payload: UpstoxCandlePayload; segment: string } => Boolean(result));
      if (url.searchParams.get("strict") === "1" && successful.length !== 2) throw new Error("Complete fresh candle history is unavailable");
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
