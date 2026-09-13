import "server-only";
import type { PushNotice } from "./notification-policy";
export function firebaseProjectId() {
  try {
    const credential = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}") as Record<string, unknown>;
    return typeof credential.project_id === "string" && typeof credential.client_email === "string" && typeof credential.private_key === "string"
      ? credential.project_id : "";
  } catch { return ""; }
}
export function pushConfigured() { return Boolean(firebaseProjectId() && (process.env.NOTIFICATION_CRON_SECRET?.length ?? 0) >= 32); }
export async function pushServices() {
  // Node-only credentials/SDK are needed only by configured push endpoints,
  // never while rendering the home page or an unconfigured local preview.
  const [{ cert, getApps, initializeApp }, { getMessaging }, { getFirestore, FieldValue, FieldPath }] = await Promise.all([
    import("firebase-admin/app"), import("firebase-admin/messaging"), import("firebase-admin/firestore"),
  ]);
  const existing = getApps().find(app => app.name === "papertrade-push");
  const app = existing ?? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}")) }, "papertrade-push");
  return { db: getFirestore(app), messaging: getMessaging(app), FieldValue, FieldPath };
}
export async function removeUserPushDevices(userId: string) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return;
  const { db, messaging } = await pushServices();
  const devices = await db.collection("notificationDevices").where("userId", "==", userId).get();
  for (const device of devices.docs) {
    for (const topic of ["papertrade-ipo-v3", "papertrade-allotment-v3"]) {
      const result = await messaging.unsubscribeFromTopic(device.data().token, topic);
      if (result.failureCount) throw new Error("Notification removal failed");
    }
    await device.ref.delete();
  }
}
export async function sendPush(notice: PushNotice, target: { token: string } | { topic: string }) {
  const ttl = Math.max(0, Math.min(6 * 3600000, notice.expiresAt - Date.now()));
  if (!ttl) return;
  // Data-only Android messages go through our receiver: expiry, quiet hours,
  // consent, branding and event deduplication are checked on the device too.
  return (await pushServices()).messaging.send({ ...target,
    data: { ...notice, expiresAt: String(notice.expiresAt), silent: String(notice.silent) },
    android: { priority: notice.kind === "allotment" ? "high" : "normal", ttl },
    webpush: { headers: { TTL: String(Math.ceil(ttl / 1000)), Urgency: notice.kind === "allotment" ? "high" : "normal" } },
  });
}
