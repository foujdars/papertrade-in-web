import { firebaseProjectId, pushConfigured, pushServices } from "@/lib/push-admin";
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
  const monitoring: Record<string, "online" | "delayed" | "unknown"> = { updates: "unknown", trades: "unknown" };
  if (enabled) {
    try {
      const { db } = await pushServices();
      const [updates, trades] = await Promise.all([db.doc("notificationSystem/health").get(), db.doc("technicalSystem/health").get()]);
      for (const [key, snapshot] of [["updates", updates], ["trades", trades]] as const) {
        const data = snapshot.data();
        if (Number.isFinite(data?.lastRun)) monitoring[key] = data?.ok === true && Date.now() - data.lastRun < 180000 ? "online" : "delayed";
      }
    } catch { /* Configuration still works when monitoring status cannot be read. */ }
  }
  return Response.json({ enabled, webEnabled, monitoring, config: { apiKey, authDomain, projectId, messagingSenderId, appId }, vapidKey }, { headers: { "Cache-Control": "no-store" } });
}
