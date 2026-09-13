import { firebaseProjectId, pushConfigured } from "@/lib/push-admin";
export const dynamic = "force-dynamic";
export async function GET() {
  let config: Record<string, string> = {};
  try { config = JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON || "{}"); } catch { /* Setup is not complete. */ }
  const { apiKey, authDomain, projectId, messagingSenderId, appId } = config;
  const vapidKey = process.env.FIREBASE_WEB_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
  const enabled = pushConfigured();
  const webEnabled = enabled
    && projectId === firebaseProjectId()
    && typeof apiKey === "string" && /^AIza[A-Za-z0-9_-]{20,}$/.test(apiKey)
    && typeof authDomain === "string" && /^[A-Za-z0-9.-]+$/.test(authDomain) && !authDomain.includes("YOUR_")
    && typeof messagingSenderId === "string" && /^\d{6,20}$/.test(messagingSenderId)
    && typeof appId === "string" && /^1:\d{6,20}:web:[A-Za-z0-9]+$/.test(appId)
    && /^[A-Za-z0-9_-]{60,120}$/.test(vapidKey);
  return Response.json({ enabled, webEnabled, config: { apiKey, authDomain, projectId, messagingSenderId, appId }, vapidKey }, { headers: { "Cache-Control": "no-store" } });
}
