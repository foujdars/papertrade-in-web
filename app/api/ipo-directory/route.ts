import { loadIpoDirectory } from "@/lib/ipo-directory-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await loadIpoDirectory();
  return Response.json(result, { headers: { "Cache-Control": result.partial ? "public, max-age=60" : "public, max-age=600" } });
}
