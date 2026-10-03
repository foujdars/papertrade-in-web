import {
  FUNDAMENTAL_CSV_PATH,
  fundamentalErrorResponse,
  requireSignedInFundamentalUser,
  storageClient,
} from "@/lib/fundamental-data-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSignedInFundamentalUser(request);
    const { data, error } = await storageClient().download(FUNDAMENTAL_CSV_PATH);
    if (error || !data) return Response.json({ error: "No fundamental CSV has been uploaded yet." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(data, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": "inline; filename=latest.csv",
      },
    });
  } catch (error) {
    return fundamentalErrorResponse(error);
  }
}

