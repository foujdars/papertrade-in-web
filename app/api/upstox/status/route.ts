import { isUpstoxConfigured } from "@/lib/upstox-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      provider: "upstox",
      configured: isUpstoxConfigured(),
      tokenStorage: "server",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
