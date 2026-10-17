import { loadMarketMovers } from "@/lib/market-movers-server";
import { americaBoardScan, boardQuotes, cryptoBoardScan, splitBoard, type BoardMetadata, type SearchBoard } from "@/lib/search-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GlobalBoard = { board: SearchBoard; metadata: BoardMetadata };
const cache = new Map<"us" | "crypto", { fetchedAt: number; board: SearchBoard }>();
const pending = new Map<"us" | "crypto", Promise<GlobalBoard>>();
const DELAY_WARNING = "Scanner prices may be delayed; their exchange quote time is unavailable.";

async function globalBoard(market: "us" | "crypto"): Promise<GlobalBoard> {
  const hit = cache.get(market);
  if (hit && Date.now() - hit.fetchedAt < 10_000) return { board: hit.board, metadata: { fetchedAt: new Date(hit.fetchedAt).toISOString(), status: "delayed", source: "tradingview", warning: DELAY_WARNING } };
  const flight = pending.get(market);
  if (flight) return flight;
  const request = (async (): Promise<GlobalBoard> => {
    try {
      const response = await fetch(`https://scanner.tradingview.com/${market === "us" ? "america" : "crypto"}/scan`, {
        method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (compatible; PaperTrade/1.0)" },
        body: JSON.stringify(market === "us" ? americaBoardScan() : cryptoBoardScan()),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error("Market scan unavailable.");
      const payload = await response.json() as { data?: unknown };
      if (!Array.isArray(payload?.data)) throw new Error("Market scan unavailable.");
      const rows = boardQuotes(payload, market);
      if (payload.data.length && !rows.length) throw new Error("Market scan contains no usable quotes.");
      const fetchedAt = Date.now();
      const board = splitBoard(rows);
      cache.set(market, { fetchedAt, board });
      return { board, metadata: { fetchedAt: new Date(fetchedAt).toISOString(), status: "delayed", source: "tradingview", warning: DELAY_WARNING } };
    } catch {
      if (hit && Date.now() - hit.fetchedAt <= 10 * 60_000) return { board: hit.board, metadata: { fetchedAt: new Date(hit.fetchedAt).toISOString(), status: "stale", source: "tradingview", warning: "Refresh failed. Showing the last successful scanner snapshot." } };
      return { board: { gainers: [], losers: [] }, metadata: { fetchedAt: null, status: "unavailable", source: "tradingview", warning: "Market prices are unavailable. Please retry." } };
    }
  })().finally(() => pending.delete(market));
  pending.set(market, request);
  return request;
}

export async function GET() {
  const [india, us, crypto] = await Promise.all([loadMarketMovers(true), globalBoard("us"), globalBoard("crypto")]);
  const { lists, ok: indiaOk, ...indiaMetadata } = india;
  const ok = indiaOk || us.metadata.status !== "unavailable" || crypto.metadata.status !== "unavailable";
  const times = [india.fetchedAt, us.metadata.fetchedAt, crypto.metadata.fetchedAt].filter((time): time is string => Boolean(time));
  return Response.json({
    ok, in: { gainers: lists.gainers ?? [], losers: lists.losers ?? [] }, us: us.board, crypto: crypto.board,
    fetchedAt: times.sort()[0] ?? null, metadata: { in: indiaMetadata, us: us.metadata, crypto: crypto.metadata },
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
