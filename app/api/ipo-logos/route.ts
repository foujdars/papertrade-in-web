import { loadSupplementalIpoLogo } from "@/lib/ipo-logos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!name || name.length > 160 || !/^[\w\s&().,'-]+$/.test(name)) return Response.json({ error: "Invalid issuer" }, { status: 400 });
  const logoUrl = await loadSupplementalIpoLogo(name);
  return Response.json({ name, logoUrl: logoUrl ?? null }, { headers: { "Cache-Control": `public, max-age=${logoUrl ? 86400 : 300}` } });
}
