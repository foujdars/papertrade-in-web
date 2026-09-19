import "server-only";
import { createClient } from "@supabase/supabase-js";
import { pushConfigured, pushServices } from "./push-admin";
import { TechnicalRequestError } from "./technical-alerts-server-model";
export const technicalServerConfigured = () => process.env.TECHNICAL_ALERTS_ENABLED === "true" && pushConfigured();
export async function technicalUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || authorization.length > 8192) throw new TechnicalRequestError("Sign in to manage closed-app alerts.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new TechnicalRequestError("Sign-in service unavailable.", 503);
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new TechnicalRequestError("Session expired. Sign in again.", 401);
  return data.user.id;
}
export async function technicalHealth() {
  if (!technicalServerConfigured()) return { ready: false, message: "Closed-app setup required: server credentials and scheduler must be configured." };
  const { db } = await pushServices(), status = (await db.doc("technicalSystem/health").get()).data();
  const ready = Number.isFinite(status?.lastRun) && Date.now() - status!.lastRun < 180000 && status?.ok === true;
  return { ready, message: ready ? "Server monitoring online" : "Server scheduler is not reporting healthy checks. Closed-app alerts may be delayed." };
}
export function technicalError(error: unknown) {
  return Response.json({ ok: false, error: error instanceof TechnicalRequestError ? error.message : "Technical alert service unavailable. No successful change is confirmed; refresh before retrying." }, { status: error instanceof TechnicalRequestError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
