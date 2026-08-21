import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";
import { rankOpenHighStocks, rankVolumeBreakouts, type HistoricalVolumePoint, type OpenHighCandidate, type VolumeBreakoutCandidate } from "@/lib/volume-breakout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestedInstrument = {
  symbol: string;
  name: string;
  instrumentKey: string;
};

type UpstoxQuote = {
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  net_change?: number;
  volume?: number;
  timestamp?: string;
  last_trade_time?: string;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
};

type UpstoxQuotePayload = {
  status: string;
  data?: Record<string, UpstoxQuote>;
};

type UpstoxCandlePayload = {
  status: string;
  data?: { candles?: Array<[string | number, number, number, number, number, number?, number?]> };
};

const HISTORY_BATCH_SIZE = 15;
const MAX_HISTORY_SCANS = 120;
const scannerCache = new Map<"VOLUME" | "OPEN_HIGH", { expiresAt: number; payload: Record<string, unknown> }>();
const volumeHistoryCache = new Map<string, { sessionDate: string; expiresAt: number; points: HistoricalVolumePoint[] }>();

function indiaDateKey(value: Date | number | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadAdjustedVolumeHistory(candidate: VolumeBreakoutCandidate) {
  const toDate = indiaDateKey(Date.now());
  const cached = volumeHistoryCache.get(candidate.instrumentKey);
  if (cached && cached.sessionDate === toDate && cached.expiresAt > Date.now()) return cached.points;
  const fromDate = indiaDateKey(Date.now() - 50 * 86_400_000);
  const encodedKey = encodeURIComponent(candidate.instrumentKey);
  const payload = await upstoxFetch<UpstoxCandlePayload>(`/v3/historical-candle/${encodedKey}/days/1/${toDate}/${fromDate}`);
  const points = (payload.data?.candles ?? []).flatMap((candle): HistoricalVolumePoint[] => {
    const volume = Number(candle[5]);
    if (!Number.isFinite(volume) || volume < 0) return [];
    return [{ date: indiaDateKey(candle[0]), volume }];
  });
  volumeHistoryCache.set(candidate.instrumentKey, { sessionDate: toDate, expiresAt: Date.now() + 6 * 60 * 60_000, points });
  return points;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { instruments?: unknown; mode?: unknown };
    const mode = payload.mode === "OPEN_HIGH" ? "OPEN_HIGH" : "VOLUME";
    const cached = scannerCache.get(mode);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.payload, { headers: { "Cache-Control": "private, max-age=30" } });
    }
    if (!Array.isArray(payload.instruments) || payload.instruments.length < 1 || payload.instruments.length > 3_000) {
      return Response.json({ ok: false, error: { code: "INVALID_INSTRUMENTS", message: "Provide between 1 and 3,000 NSE cash instruments." } }, { status: 400 });
    }
    const instruments = payload.instruments.filter((item): item is RequestedInstrument => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RequestedInstrument>;
      return typeof candidate.symbol === "string" && typeof candidate.name === "string" && typeof candidate.instrumentKey === "string" && isSupportedNseInstrumentKey(candidate.instrumentKey);
    });
    if (instruments.length !== payload.instruments.length) {
      return Response.json({ ok: false, error: { code: "INVALID_INSTRUMENTS", message: "The NSE instrument list contains an unsupported entry." } }, { status: 400 });
    }

    const batches = Array.from({ length: Math.ceil(instruments.length / 500) }, (_, index) => instruments.slice(index * 500, index * 500 + 500));
    const quotePayloads = await Promise.all(batches.map((batch) => {
      const params = new URLSearchParams({ instrument_key: batch.map((item) => item.instrumentKey).join(",") });
      return upstoxFetch<UpstoxQuotePayload>(`/v2/market-quote/quotes?${params}`);
    }));
    const requestedByKey = new Map(instruments.map((item) => [item.instrumentKey, item]));
    const requestedBySymbol = new Map(instruments.map((item) => [item.symbol, item]));
    const candidates: VolumeBreakoutCandidate[] = [];
    const openHighCandidates: OpenHighCandidate[] = [];
    for (const quote of quotePayloads.flatMap((item) => Object.values(item.data ?? {}))) {
      const instrumentKey = quote.instrument_token ?? "";
      const symbol = quote.symbol?.trim().toUpperCase() ?? "";
      const requested = requestedByKey.get(instrumentKey) ?? requestedBySymbol.get(symbol);
      const lastPrice = Number(quote.last_price);
      const netChange = Number(quote.net_change);
      const previousClose = Number.isFinite(netChange) ? lastPrice - netChange : Number(quote.ohlc?.close);
      const todayVolume = Number(quote.volume);
      if (!requested || !Number.isFinite(lastPrice) || !Number.isFinite(previousClose)) continue;
      const open = Number(quote.ohlc?.open);
      const high = Number(quote.ohlc?.high);
      const low = Number(quote.ohlc?.low);
      if (Number.isFinite(open) && Number.isFinite(high)) {
        openHighCandidates.push({
          ...requested,
          lastPrice,
          previousClose,
          open,
          high,
          low: Number.isFinite(low) ? low : lastPrice,
          volume: Number.isFinite(todayVolume) ? todayVolume : 0,
        });
      }
      if (!Number.isFinite(todayVolume)) continue;
      const quoteTimestamp = quote.timestamp || (Number.isFinite(Number(quote.last_trade_time)) ? Number(quote.last_trade_time) : Date.now());
      candidates.push({
        ...requested,
        lastPrice,
        previousClose,
        todayVolume,
        sessionDate: indiaDateKey(quoteTimestamp),
      });
    }
    if (mode === "OPEN_HIGH") {
      const openHighRows = rankOpenHighStocks(openHighCandidates);
      const responsePayload = {
        ok: true,
        source: "Upstox live quotes",
        rule: "Session Open = Session High",
        rows: openHighRows,
        openHighRows,
        scanned: openHighCandidates.length,
        historiesScanned: 0,
        fetchedAt: new Date().toISOString(),
      };
      scannerCache.set(mode, { expiresAt: Date.now() + 60_000, payload: responsePayload });
      return Response.json(responsePayload, { headers: { "Cache-Control": "private, max-age=20" } });
    }
    const rankedCandidates = candidates
      .sort((a, b) => {
        const aChange = a.previousClose > 0 ? (a.lastPrice - a.previousClose) / a.previousClose : 0;
        const bChange = b.previousClose > 0 ? (b.lastPrice - b.previousClose) / b.previousClose : 0;
        return bChange - aChange;
      })
      .slice(0, MAX_HISTORY_SCANS);
    const history = new Map<string, HistoricalVolumePoint[]>();
    let rows = rankVolumeBreakouts(rankedCandidates, history);
    let historiesScanned = 0;
    for (let offset = 0; offset < rankedCandidates.length && rows.length < 15; offset += HISTORY_BATCH_SIZE) {
      const batch = rankedCandidates.slice(offset, offset + HISTORY_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((candidate) => loadAdjustedVolumeHistory(candidate)));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") history.set(batch[index].symbol, result.value);
      });
      historiesScanned += batch.length;
      rows = rankVolumeBreakouts(rankedCandidates.slice(0, historiesScanned), history);
      if (rows.length < 15 && offset + HISTORY_BATCH_SIZE < rankedCandidates.length) await delay(1_050);
    }
    const responsePayload = {
      ok: true,
      source: "Upstox live quotes + adjusted daily candles",
      rule: "Daily Volume > 5 × SMA(Volume, 20)",
      rows,
      openHighRows: rankOpenHighStocks(openHighCandidates),
      scanned: candidates.length,
      historiesScanned,
      fetchedAt: new Date().toISOString(),
    };
    scannerCache.set(mode, { expiresAt: Date.now() + 2 * 60_000, payload: responsePayload });
    return Response.json(responsePayload, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
