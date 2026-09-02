import { loadAllotments } from "@/lib/ipo-allotment-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return Response.json({ ok: true, ...await loadAllotments() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: { message: "IPO allotment information is temporarily unavailable. Please refresh shortly." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
