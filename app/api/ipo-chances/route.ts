import { loadIpoChances } from "@/lib/ipo-chances-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!name || name.length > 160 || !/^[\w\s&().,'-]+$/.test(name)) return Response.json({ error: "Invalid issuer" }, { status: 400 });
  try { return Response.json({ name, estimates: await loadIpoChances(name) }, { headers: { "Cache-Control": "public, max-age=60" } }); }
  catch { return Response.json({ error: "Could not refresh application estimates. Retrying shortly." }, { status: 503 }); }
}
