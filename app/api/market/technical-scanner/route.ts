import { analyzeNimbleCandles, NIMBLE_STRATEGIES, type NimbleCandle, type NimbleStrategy, type ScannerTimeframe, type TechnicalScannerRow } from "@/lib/nimble-scanner";
import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { UpstoxServerError, upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestedInstrument = { symbol: string; name: string; instrumentKey: string };
type UpstoxQuote = {
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  net_change?: number;
  volume?: number;
  ohlc?: { close?: number };
};
type QuotePayload = { status: string; data?: Record<string, UpstoxQuote> };
type CandlePayload = { status: string; data?: { candles?: Array<[string | number, number, number, number, number, number?, number?]> } };
type LiquidInstrument = RequestedInstrument & { lastPrice: number; changePercent: number; volume: number };

const MAX_CANDLE_SCANS = 45;
const scannerCache = new Map<NimbleStrategy, { expiresAt: number; payload: Record<string, unknown> }>();

function indiaDateKey(value: Date | number | string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

function parseCandles(payload: CandlePayload, timeframe: ScannerTimeframe) {
  const completedBefore = timeframe === "1D" ? Number.POSITIVE_INFINITY : Date.now() - timeframe * 60_000;
  const currentIndiaDate = indiaDateKey(Date.now());
  return (payload.data?.candles ?? []).flatMap((candle): NimbleCandle[] => {
    const parsed = {
      timestamp: new Date(candle[0]).getTime(),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5] ?? 0),
    };
    const isComplete = timeframe === "1D"
      ? indiaDateKey(parsed.timestamp) < currentIndiaDate
      : parsed.timestamp <= completedBefore;
    return Object.values(parsed).every(Number.isFinite) && isComplete ? [parsed] : [];
  }).sort((left, right) => left.timestamp - right.timestamp);
}

function mergeCandles(...groups: NimbleCandle[][]) {
  const byTimestamp = new Map<number, NimbleCandle>();
  groups.flat().forEach((candle) => byTimestamp.set(candle.timestamp, candle));
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = Array<R>(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function loadLiquidUniverse(instruments: RequestedInstrument[], strategy: NimbleStrategy) {
  const requestedByKey = new Map(instruments.map((item) => [item.instrumentKey, item]));
  const requestedBySymbol = new Map(instruments.map((item) => [item.symbol, item]));
  const batches = Array.from({ length: Math.ceil(instruments.length / 500) }, (_, index) => instruments.slice(index * 500, index * 500 + 500));
  const payloads = await Promise.all(batches.map((batch) => {
    const params = new URLSearchParams({ instrument_key: batch.map((item) => item.instrumentKey).join(",") });
    return upstoxFetch<QuotePayload>(`/v2/market-quote/quotes?${params}`);
  }));
  const liquid: LiquidInstrument[] = [];
  for (const quote of payloads.flatMap((payload) => Object.values(payload.data ?? {}))) {
    const instrumentKey = quote.instrument_token ?? "";
    const symbol = quote.symbol?.trim().toUpperCase() ?? "";
    const requested = requestedByKey.get(instrumentKey) ?? requestedBySymbol.get(symbol);
    const lastPrice = Number(quote.last_price);
    const netChange = Number(quote.net_change);
    const previousClose = Number.isFinite(netChange) ? lastPrice - netChange : Number(quote.ohlc?.close);
    if (!requested || !Number.isFinite(lastPrice) || !Number.isFinite(previousClose) || previousClose <= 0) continue;
    liquid.push({ ...requested, lastPrice, changePercent: ((lastPrice - previousClose) / previousClose) * 100, volume: Math.max(0, Number(quote.volume) || 0) });
  }
  // Historical-candle requests are the expensive part of a scan. For the
  // buy-side daily RSI strategy, scanning only the highest-volume shares
  // systematically misses the weak/oversold NIFTY 500 shares where a bullish
  // divergence is most likely to form. Start with the day's weakest shares;
  // other strategies continue to favour liquid names.
  const ranked = strategy === "rsi-divergence-daily"
    ? liquid.sort((left, right) => left.changePercent - right.changePercent || right.volume - left.volume)
    : liquid.sort((left, right) => right.volume - left.volume);
  return ranked.slice(0, MAX_CANDLE_SCANS);
}

async function loadCandles(item: LiquidInstrument, strategy: NimbleStrategy) {
  const { timeframe } = NIMBLE_STRATEGIES[strategy];
  const encodedKey = encodeURIComponent(item.instrumentKey);
  if (timeframe === "1D") {
    const toDate = indiaDateKey(Date.now());
    const fromDate = indiaDateKey(Date.now() - 1_100 * 86_400_000);
    const history = await upstoxFetch<CandlePayload>(`/v3/historical-candle/${encodedKey}/days/1/${toDate}/${fromDate}`);
    return analyzeNimbleCandles(parseCandles(history, timeframe), strategy, timeframe);
  }
  const intraday = await upstoxFetch<CandlePayload>(`/v3/historical-candle/intraday/${encodedKey}/minutes/${timeframe}`);
  let candles = parseCandles(intraday, timeframe);
  if (strategy === "weekly-fakeout-mtf" || candles.length < 25) {
    const lookbackDays = strategy === "weekly-fakeout-mtf" ? 22 : 8;
    const toDate = indiaDateKey(Date.now());
    const fromDate = indiaDateKey(Date.now() - lookbackDays * 86_400_000);
    const history = await upstoxFetch<CandlePayload>(`/v3/historical-candle/${encodedKey}/minutes/${timeframe}/${toDate}/${fromDate}`);
    candles = mergeCandles(parseCandles(history, timeframe), candles);
  }
  return analyzeNimbleCandles(candles, strategy, timeframe);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { strategy?: unknown; instruments?: unknown; force?: unknown };
    const strategy = typeof body.strategy === "string" && body.strategy in NIMBLE_STRATEGIES ? body.strategy as NimbleStrategy : null;
    if (!strategy) return Response.json({ ok: false, error: { code: "INVALID_STRATEGY", message: "Choose a supported NimbleScan strategy." } }, { status: 400 });
    const cached = scannerCache.get(strategy);
    if (body.force !== true && cached && cached.expiresAt > Date.now()) return Response.json(cached.payload, { headers: { "Cache-Control": "private, max-age=30" } });
    if (!Array.isArray(body.instruments) || body.instruments.length < 1 || body.instruments.length > 3_000) {
      return Response.json({ ok: false, error: { code: "INVALID_INSTRUMENTS", message: "Provide between 1 and 3,000 NSE cash instruments." } }, { status: 400 });
    }
    const instruments = body.instruments.filter((item): item is RequestedInstrument => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RequestedInstrument>;
      return typeof candidate.symbol === "string" && typeof candidate.name === "string" && typeof candidate.instrumentKey === "string" && isSupportedNseInstrumentKey(candidate.instrumentKey);
    });
    if (instruments.length !== body.instruments.length) return Response.json({ ok: false, error: { code: "INVALID_INSTRUMENTS", message: "The NSE instrument list contains an unsupported entry." } }, { status: 400 });

    const liquid = await loadLiquidUniverse(instruments, strategy);
    let rateLimitError: UpstoxServerError | null = null;
    const scanned = await mapWithConcurrency(liquid, 5, async (item) => {
      try {
        return { item, match: await loadCandles(item, strategy), failed: false };
      } catch (error) {
        if (error instanceof UpstoxServerError && error.code === "RATE_LIMITED") rateLimitError = error;
        return { item, match: null, failed: true };
      }
    });
    const successfulScans = scanned.filter((result) => !result.failed).length;
    if (rateLimitError && successfulScans === 0) throw rateLimitError;
    const rows: TechnicalScannerRow[] = scanned.flatMap(({ item, match }) => match ? [{
      symbol: item.symbol,
      name: item.name,
      instrumentKey: item.instrumentKey,
      lastPrice: item.lastPrice,
      changePercent: item.changePercent,
      signal: match.signal,
      timeframe: NIMBLE_STRATEGIES[strategy].timeframe,
      setupStatus: match.setupStatus,
      entry: match.entry,
      stopLoss: match.stopLoss,
      target1: match.target1,
      indicatorValue: match.indicatorValue,
    }] : []);
    rows.sort((left, right) => Number(right.setupStatus === "triggered") - Number(left.setupStatus === "triggered") || Math.abs(right.changePercent) - Math.abs(left.changePercent));
    const responsePayload = {
      ok: true,
      source: "Upstox live quotes + completed candles",
      strategy,
      label: NIMBLE_STRATEGIES[strategy].label,
      timeframe: NIMBLE_STRATEGIES[strategy].timeframe,
      rows: rows.slice(0, 15),
      scanned: liquid.length,
      universeSize: instruments.length,
      partial: Boolean(rateLimitError),
      fetchedAt: new Date().toISOString(),
    };
    scannerCache.set(strategy, { expiresAt: Date.now() + 2 * 60_000, payload: responsePayload });
    return Response.json(responsePayload, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
