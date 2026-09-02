import { allotmentLink } from "@/lib/ipo-allotment";

export async function GET(_request: Request, context: { params: Promise<{ registrar: string }> }) {
  const { registrar } = await context.params;
  const destination = allotmentLink(registrar);
  if (!destination) return new Response("Unknown allotment website", { status: 404 });
  return new Response(null, { status: 302, headers: { Location: destination, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
