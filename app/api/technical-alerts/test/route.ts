import { createHash, randomUUID } from "node:crypto";
import { pushServices } from "@/lib/push-admin";
import { notificationPreferences } from "@/lib/notification-policy";
import { technicalUser, technicalHealth, technicalError, technicalServerConfigured } from "@/lib/technical-alerts-server";
import { TechnicalRequestError } from "@/lib/technical-alerts-server-model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!technicalServerConfigured()) throw new TechnicalRequestError("Closed-app monitoring is not activated.", 503);
    const userId = await technicalUser(request), { db } = await pushServices();
    const saved = (await db.doc(`technicalPushTests/${userId}`).get()).data();
    return Response.json({ ok: true, test: saved ? { id: saved.id, status: saved.status, requestedAt: saved.requestedAt, confirmedAt: saved.confirmedAt ?? null } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return technicalError(error); }
}
export async function POST(request: Request) {
  try {
    if (!technicalServerConfigured()) throw new TechnicalRequestError("Closed-app monitoring is not activated.", 503);
    const userId = await technicalUser(request), raw = await request.text();
    if (raw.length > 8192) throw new TechnicalRequestError("Request too large.", 413);
    let body; try { body = JSON.parse(raw); } catch { throw new TechnicalRequestError("Invalid request."); }
    const { db } = await pushServices(), ref = db.doc(`technicalPushTests/${userId}`), now = Date.now();
    if (body?.action === "confirm") {
      await db.runTransaction(async tx => {
        const saved = (await tx.get(ref)).data();
        if (!saved || saved.id !== body.id || !["accepted", "sending", "needs-review"].includes(saved.status)) throw new TechnicalRequestError("No matching sent test to confirm.", 409);
        tx.set(ref, { ...saved, status: "confirmed", confirmedAt: now });
      });
      return Response.json({ ok: true });
    }
    if (body?.action !== "queue" || typeof body.token !== "string" || !/^[\w:.-]{20,4096}$/.test(body.token)) throw new TechnicalRequestError("Connect this Android device before testing.");
    if (!(await technicalHealth()).ready) throw new TechnicalRequestError("A healthy scheduler is required before testing.", 503);
    const deviceId = createHash("sha256").update(body.token).digest("hex");
    const device = (await db.doc(`notificationDevices/${deviceId}`).get()).data(), prefs = notificationPreferences(device?.preferences);
    if (!device || device.userId !== userId || device.platform !== "android" || !prefs.trades || prefs.pausedUntil > now || now - device.lastActive > 300000) throw new TechnicalRequestError("Connect Android trade notifications on this account first.", 403);
    const id = `delivery-test:${randomUUID()}`;
    await db.runTransaction(async tx => {
      const saved = (await tx.get(ref)).data();
      if (saved && now - saved.requestedAt < 300000) throw new TechnicalRequestError("Wait five minutes before another test.", 429);
      tx.set(ref, { id, deviceId, status: "pending", requestedAt: now, notBefore: now + 30000, expiresAt: now + 300000 });
    });
    return Response.json({ ok: true, id, message: "Test queued. Close the app normally now; allow up to two minutes. Do not use Force stop." });
  } catch (error) { return technicalError(error); }
}
