import { isSupportedChartInstrumentKey, normalizeUpstoxQuote, type UpstoxQuote, type NormalizedQuote } from "@/lib/upstox";
import { upstoxErrorResponse, upstoxFetch } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    if (!keys.length || keys.length > 500 || keys.some((key) => !isSupportedChartInstrumentKey(key))) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INSTRUMENTS", message: "Provide between 1 and 500 supported instrument keys." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const params = new URLSearchParams({ instrument_key: keys.join(",") });
    const payload = await upstoxFetch<UpstoxQuotePayload>(`/v2/market-quote/quotes?${params}`);
    const quotes: Record<string, NormalizedQuote> = {};

    for (const quote of Object.values(payload.data ?? {})) {
      const normalized = normalizeUpstoxQuote(quote);
      if (!normalized || !keys.includes(normalized.instrumentKey)) continue;
      quotes[normalized.instrumentKey] = normalized;
      quotes[normalized.symbol] = normalized;
    }

    return Response.json(
      { ok: true, source: "upstox", quotes, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { keys?: unknown };
    if (!Array.isArray(body.keys) || body.keys.some((key) => typeof key !== "string")) {
      return Response.json(
        { ok: false, error: { code: "INVALID_INSTRUMENTS", message: "Provide an array of supported instrument keys." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = new URL(request.url);
    url.searchParams.set("keys", body.keys.join(","));
    return GET(new Request(url, { headers: request.headers }));
  } catch {
    return Response.json(
      { ok: false, error: { code: "INVALID_REQUEST", message: "The quote request body must be valid JSON." } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
