import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export const FUNDAMENTAL_BUCKET = "fundamental-data";
export const FUNDAMENTAL_CSV_PATH = "latest.csv";
export const FUNDAMENTAL_MANIFEST_PATH = "manifest.json";

export type FundamentalManifest = {
  version: string;
  generatedAt: string;
  dataAsOf?: string;
  fileName: string;
  rowCount?: number;
};

export class FundamentalDataError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FundamentalDataError";
    this.status = status;
  }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new FundamentalDataError("Supabase server storage is not configured.", 503);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function requireSignedInFundamentalUser(request: Request) {
  const token = bearer(request);
  if (!token || token.length > 8192) throw new FundamentalDataError("Sign in to view fundamental data.", 401);
  const client = serviceClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new FundamentalDataError("Sign in to view fundamental data.", 401);
  return data.user;
}

export function requireFundamentalUploadToken(request: Request) {
  const expected = process.env.FUNDAMENTAL_UPLOAD_TOKEN ?? "";
  const provided = bearer(request);
  if (!expected) throw new FundamentalDataError("Fundamental upload is not configured.", 503);
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (!provided || expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    throw new FundamentalDataError("Unauthorized fundamental upload.", 401);
  }
}

export function storageClient() {
  return serviceClient().storage.from(FUNDAMENTAL_BUCKET);
}

export function fundamentalErrorResponse(error: unknown) {
  if (error instanceof FundamentalDataError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ error: "Fundamental data service failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

