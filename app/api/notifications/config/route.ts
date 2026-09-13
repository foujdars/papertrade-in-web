import { pushConfigured } from "@/lib/push-admin";
export const dynamic = "force-dynamic";
export async function GET() {
  let config: Record<string, string> = {};
  try { config = JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON || "{}"); } catch { /* Setup is not complete. */ }
  const { apiKey, authDomain, projectId, messagingSenderId, appId } = config;
  const vapidKey = process.env.FIREBASE_WEB_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
  const enabled = pushConfigured();
  const webEnabled = enabled && [apiKey, authDomain, projectId, messagingSenderId, appId, vapidKey].every(value => typeof value === "string" && value.length > 0);
  return Response.json({ enabled, webEnabled, config: { apiKey, authDomain, projectId, messagingSenderId, appId }, vapidKey }, { headers: { "Cache-Control": "no-store" } });
}
