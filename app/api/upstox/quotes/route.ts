import { isSupportedNseInstrumentKey, UPSTOX_KEY_TO_SYMBOL, type NormalizedQuote } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpstoxQuote = {
  instrument_token?: string;
  symbol?: string;
  last_price?: number;
  net_change?: number;
  timestamp?: string;
  last_trade_time?: string;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
};

type UpstoxQuotePayload = {
  status: string;
  data?: Record<string, UpstoxQuote>;
};

export async function GET(request: Request) {
  try {
    const requestedKeys = (new URL(request.url).searchParams.get("keys") ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
    const keys = [...new Set(requestedKeys)];

    if (!keys.length || keys.length > 100 || keys.some((key) => !isSupportedNseInstrumentKey(key))) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INSTRUMENTS", message: "Provide between 1 and 100 supported instrument keys." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const params = new URLSearchParams({ instrument_key: keys.join(",") });
    const payload = await upstoxFetch<UpstoxQuotePayload>(`/v2/market-quote/quotes?${params}`);
    const quotes: Record<string, NormalizedQuote> = {};

    for (const quote of Object.values(payload.data ?? {})) {
      const instrumentKey = quote.instrument_token ?? "";
      const symbol = quote.symbol?.trim().toUpperCase() || UPSTOX_KEY_TO_SYMBOL[instrumentKey] || instrumentKey;
      const lastPrice = Number(quote.last_price);
      const previousClose = Number(quote.ohlc?.close);
      const netChange = Number.isFinite(Number(quote.net_change))
        ? Number(quote.net_change)
        : lastPrice - previousClose;
      const lastTradeMilliseconds = Number(quote.last_trade_time);
      const lastTradeAt = Number.isFinite(lastTradeMilliseconds)
        ? new Date(lastTradeMilliseconds).toISOString()
        : quote.timestamp ?? new Date().toISOString();
      if (!Number.isFinite(lastPrice)) continue;
      const normalized = {
        instrumentKey,
        symbol,
        lastPrice,
        netChange,
        changePercent: Number.isFinite(previousClose) && previousClose !== 0 ? (netChange / previousClose) * 100 : 0,
        open: Number(quote.ohlc?.open) || lastPrice,
        high: Number(quote.ohlc?.high) || lastPrice,
        low: Number(quote.ohlc?.low) || lastPrice,
        previousClose: Number.isFinite(previousClose) ? previousClose : lastPrice,
        lastTradeAt,
        updatedAt: quote.timestamp ?? new Date().toISOString(),
      };
      quotes[instrumentKey] = normalized;
      quotes[symbol] = normalized;
    }

    return Response.json(
      { ok: true, source: "upstox", quotes, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
