import { mcxInstruments } from "@/lib/mcx";
import type { Instrument } from "@/lib/market";

export const dynamic = "force-dynamic";
let cache: { fetchedAt: number; instruments: Instrument[] } | null = null;
export async function GET() {
  try {
    if (!cache || Date.now() - cache.fetchedAt > 30 * 60_000) {
      const response = await fetch("https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok || !response.body) throw new Error("MCX catalogue unavailable");
      const master = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
      if (!Array.isArray(master)) throw new Error("Invalid MCX catalogue");
      cache = { fetchedAt: Date.now(), instruments: mcxInstruments(master) };
    }
    return Response.json({ ok: true, instruments: cache.instruments.filter(i => i.expiry! >= new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })), fetchedAt: cache.fetchedAt });
  } catch {
    return Response.json({ ok: false, instruments: [], error: "MCX catalogue unavailable. Please try again." }, { status: 503 });
  }
}
