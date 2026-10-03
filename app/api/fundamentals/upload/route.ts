import { createHash } from "node:crypto";
import {
  FUNDAMENTAL_CSV_PATH,
  FUNDAMENTAL_MANIFEST_PATH,
  fundamentalErrorResponse,
  requireFundamentalUploadToken,
  storageClient,
  type FundamentalManifest,
} from "@/lib/fundamental-data-server";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const REQUIRED_HEADERS = ["name", "isin code", "nse code", "bse code", "industry"];

function normalizedHeaders(csv: string) {
  const firstLine = (csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "").toLowerCase();
  return new Set(firstLine.split(",").map(value => value.replace(/^"|"$/g, "").trim()));
}

export async function POST(request: Request) {
  try {
    requireFundamentalUploadToken(request);
    const csv = await request.text();
    if (!csv.trim()) return Response.json({ error: "The uploaded CSV is empty." }, { status: 400 });
    if (Buffer.byteLength(csv, "utf8") > MAX_BYTES) return Response.json({ error: "The uploaded CSV is too large." }, { status: 413 });
    const headers = normalizedHeaders(csv);
    const missing = REQUIRED_HEADERS.filter(header => !headers.has(header));
    if (missing.length) return Response.json({ error: `CSV is missing required columns: ${missing.join(", ")}` }, { status: 400 });

    const version = createHash("sha256").update(csv, "utf8").digest("hex");
    const generatedAt = new Date().toISOString();
    const fileName = request.headers.get("x-fundamental-file-name")?.trim() || "screener_results_merged.csv";
    const dataAsOf = request.headers.get("x-fundamental-data-as-of")?.trim() || undefined;
    const rowCount = Math.max(0, csv.split(/\r?\n/).filter(line => line.trim()).length - 1);
    const manifest: FundamentalManifest = { version, generatedAt, fileName, rowCount, ...(dataAsOf ? { dataAsOf } : {}) };
    const storage = storageClient();
    const csvUpload = await storage.upload(FUNDAMENTAL_CSV_PATH, new Blob([csv], { type: "text/csv; charset=utf-8" }), {
      upsert: true,
      contentType: "text/csv; charset=utf-8",
      cacheControl: "60",
    });
    if (csvUpload.error) throw csvUpload.error;
    const manifestUpload = await storage.upload(FUNDAMENTAL_MANIFEST_PATH, new Blob([JSON.stringify(manifest)], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
      cacheControl: "60",
    });
    if (manifestUpload.error) throw manifestUpload.error;
    return Response.json({ ok: true, ...manifest }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fundamentalErrorResponse(error);
  }
}

