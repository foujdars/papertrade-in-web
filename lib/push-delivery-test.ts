import "server-only";
import { pushServices, sendPush } from "./push-admin";
import { notificationPreferences, quietTime } from "./notification-policy";

/** The scheduler owns the dispatch lease. A test targets one verified device, never a topic. */
export async function dispatchPushTests() {
  const { db } = await pushServices();
  const pending = await db.collection("technicalPushTests").where("status", "==", "pending").limit(10).get();
  for (const doc of pending.docs) {
    const test = doc.data(), now = Date.now();
    if (test.expiresAt <= now) { await doc.ref.update({ status: "expired" }); continue; }
    if (test.notBefore > now) continue;
    const device = (await db.doc(`notificationDevices/${test.deviceId}`).get()).data();
    const prefs = notificationPreferences(device?.preferences);
    if (!device || device.userId !== doc.id || !prefs.trades || prefs.pausedUntil > now || now - device.lastActive > 90 * 86400000) {
      await doc.ref.update({ status: "cancelled" }); continue;
    }
    // Claim before FCM. An unknown outcome must not produce an automatic duplicate.
    await doc.ref.update({ status: "sending", attemptedAt: now });
    const finish = async (status: string) => db.runTransaction(async tx => {
      const saved = (await tx.get(doc.ref)).data();
      if (!saved || saved.id !== test.id || saved.status === "confirmed") return;
      tx.set(doc.ref, { ...saved, status, ...(status === "accepted" ? { acceptedAt: Date.now() } : {}) });
    });
    try {
      await sendPush({ id: test.id, kind: "trade", title: "PaperTrade · closed-app delivery test", body: "This is a test, not a market signal. Reopen Alerts and confirm receipt.", url: "/?alertTest=1", expiresAt: test.expiresAt, silent: quietTime(now) }, { token: device.token });
      await finish("accepted");
    } catch { await finish("needs-review"); }
  }
}
