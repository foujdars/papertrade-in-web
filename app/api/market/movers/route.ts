import { loadMarketMovers } from "@/lib/market-movers-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const snapshot = await loadMarketMovers(params.get("summary") === "1", params.get("refresh") === "1");
  return Response.json(snapshot, { status: snapshot.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
