import { authorizeUpstoxMarketFeed, upstoxErrorResponse } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authorizedRedirectUri = await authorizeUpstoxMarketFeed();
    return Response.json(
      { ok: true, source: "upstox", authorizedRedirectUri },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return upstoxErrorResponse(error);
  }
}
