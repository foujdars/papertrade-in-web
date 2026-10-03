import {
  FUNDAMENTAL_MANIFEST_PATH,
  fundamentalErrorResponse,
  requireSignedInFundamentalUser,
  storageClient,
  type FundamentalManifest,
} from "@/lib/fundamental-data-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireSignedInFundamentalUser(request);
    const { data, error } = await storageClient().download(FUNDAMENTAL_MANIFEST_PATH);
    if (error || !data) return Response.json({ available: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const manifest = JSON.parse(await data.text()) as FundamentalManifest;
    if (!manifest.version || !manifest.generatedAt || !manifest.fileName) {
      return Response.json({ error: "Invalid fundamental data manifest." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ available: true, ...manifest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fundamentalErrorResponse(error);
  }
}

