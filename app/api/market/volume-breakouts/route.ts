import { isSupportedNseInstrumentKey } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";
import { rankVolumeBreakouts, type HistoricalVolumePoint, type VolumeBreakoutCandidate } from "@/lib/volume-breakout";

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
  volume?: number;
  timestamp?: string;
  last_trade_time?: string;
  ohlc?: { close?: number };
};

type UpstoxQuotePayload = {
  status: string;
  data?: Record<string, UpstoxQuote>;
};

type BhavcopySession = {
  date: string;
  volumes: Map<string, number>;
};

let historyCache: { expiresAt: number; sessions: BhavcopySession[] } | null = null;

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

function archiveDate(offsetDays: number) {
  const timestamp = Date.now() - offsetDays * 86_400_000;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const record = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { iso: `${record.year}-${record.month}-${record.day}`, file: `${record.day}${record.month}${record.year}` };
}

function parseBhavcopy(text: string) {
  const lines = text.trim().split(/\r?\n/);
  const headers = (lines.shift() ?? "").split(",").map((value) => value.trim().toUpperCase());
  const symbolIndex = headers.indexOf("SYMBOL");
  const seriesIndex = headers.indexOf("SERIES");
  const volumeIndex = headers.indexOf("TTL_TRD_QNTY");
  const volumes = new Map<string, number>();
  if (symbolIndex < 0 || seriesIndex < 0 || volumeIndex < 0) return volumes;
  for (const line of lines) {
    const fields = line.split(",").map((value) => value.trim());
    if (fields[seriesIndex] !== "EQ") continue;
    const symbol = fields[symbolIndex]?.toUpperCase();
    const volume = Number(fields[volumeIndex]);
    if (symbol && Number.isFinite(volume) && volume >= 0) volumes.set(symbol, volume);
  }
  return volumes;
}

async function loadBhavcopyHistory() {
  if (historyCache && historyCache.expiresAt > Date.now()) return historyCache.sessions;
  const candidates = Array.from({ length: 35 }, (_, offset) => archiveDate(offset));
  const results = await Promise.all(candidates.map(async ({ iso, file }) => {
    const response = await fetch(`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${file}.csv`, {
      headers: { Accept: "text/csv" },
      cache: "force-cache",
    });
    if (!response.ok) return null;
    const volumes = parseBhavcopy(await response.text());
    return volumes.size ? { date: iso, volumes } : null;
  }));
  const sessions = results
    .filter((session): session is BhavcopySession => Boolean(session))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 24);
  if (sessions.length < 19) throw new Error("NSE volume history is temporarily incomplete.");
  historyCache = { expiresAt: Date.now() + 30 * 60 * 1_000, sessions };
  return sessions;
}

function historyBySymbol(sessions: BhavcopySession[]) {
  const history = new Map<string, HistoricalVolumePoint[]>();
  for (const session of sessions) {
    for (const [symbol, volume] of session.volumes) {
      const points = history.get(symbol) ?? [];
      points.push({ date: session.date, volume });
      history.set(symbol, points);
    }
  }
  return history;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { instruments?: unknown };
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
    const [sessions, quotePayloads] = await Promise.all([
      loadBhavcopyHistory(),
      Promise.all(batches.map((batch) => {
        const params = new URLSearchParams({ instrument_key: batch.map((item) => item.instrumentKey).join(",") });
        return upstoxFetch<UpstoxQuotePayload>(`/v2/market-quote/quotes?${params}`);
      })),
    ]);
    const requestedByKey = new Map(instruments.map((item) => [item.instrumentKey, item]));
    const requestedBySymbol = new Map(instruments.map((item) => [item.symbol, item]));
    const candidates: VolumeBreakoutCandidate[] = [];
    for (const quote of quotePayloads.flatMap((item) => Object.values(item.data ?? {}))) {
      const instrumentKey = quote.instrument_token ?? "";
      const symbol = quote.symbol?.trim().toUpperCase() ?? "";
      const requested = requestedByKey.get(instrumentKey) ?? requestedBySymbol.get(symbol);
      const lastPrice = Number(quote.last_price);
      const previousClose = Number(quote.ohlc?.close);
      const todayVolume = Number(quote.volume);
      if (!requested || !Number.isFinite(lastPrice) || !Number.isFinite(previousClose) || !Number.isFinite(todayVolume)) continue;
      const quoteTimestamp = quote.timestamp || (Number.isFinite(Number(quote.last_trade_time)) ? Number(quote.last_trade_time) : Date.now());
      candidates.push({
        ...requested,
        lastPrice,
        previousClose,
        todayVolume,
        sessionDate: indiaDateKey(quoteTimestamp),
      });
    }
    const rows = rankVolumeBreakouts(candidates, historyBySymbol(sessions));
    return Response.json({
      ok: true,
      source: "Upstox live volume + NSE daily bhavcopy",
      rule: "Daily Volume > 5 × SMA(Volume, 20)",
      rows,
      scanned: candidates.length,
      historySessions: sessions.length,
      fetchedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
