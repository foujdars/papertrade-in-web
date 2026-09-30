import { moverScan, presentMovers, quotesFromScan } from "@/lib/market-movers";
import { americaBoardScan, boardQuotes, cryptoBoardScan, splitBoard, type BoardQuote, type SearchBoard } from "@/lib/search-board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (compatible; PaperTrade/1.0)";

type Payload = { in: SearchBoard; us: SearchBoard; crypto: SearchBoard };

let cache: { until: number; value: Payload } | null = null;
let pending: Promise<Payload> | null = null;

async function scan(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.json();
}

function fromMovers(tab: "gainers" | "losers", payload: unknown): BoardQuote[] {
  return presentMovers(tab, quotesFromScan(payload), 8).map(row => ({ symbol: row.symbol, name: row.name, price: row.price, change: row.change, volume: row.volume }));
}

async function load(): Promise<Payload> {
  const [gainers, losers, us, crypto] = await Promise.all([
    scan("https://scanner.tradingview.com/india/scan", moverScan("gainers")).catch(() => null),
    scan("https://scanner.tradingview.com/india/scan", moverScan("losers")).catch(() => null),
    scan("https://scanner.tradingview.com/america/scan", americaBoardScan()).catch(() => null),
    scan("https://scanner.tradingview.com/crypto/scan", cryptoBoardScan()).catch(() => null),
  ]);
  return {
    in: { gainers: gainers ? fromMovers("gainers", gainers) : [], losers: losers ? fromMovers("losers", losers) : [] },
    us: splitBoard(boardQuotes(us, "us")),
    crypto: splitBoard(boardQuotes(crypto, "crypto")),
  };
}

export async function GET() {
  if (cache && cache.until > Date.now()) return Response.json({ ok: true, ...cache.value });
  pending ??= load().finally(() => { pending = null; });
  const value = await pending;
  cache = { until: Date.now() + 60_000, value };
  return Response.json({ ok: true, ...value }, { headers: { "Cache-Control": "public, max-age=30" } });
}
