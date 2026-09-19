import { randomUUID } from "node:crypto";
import { pushServices } from "@/lib/push-admin";
import { notificationPreferences } from "@/lib/notification-policy";
import { technicalGroup } from "@/lib/technical-alerts";
import { applyTechnicalCommand, readServerTechnicalStore, TechnicalRequestError, type TechnicalCommand } from "@/lib/technical-alerts-server-model";
import { technicalError, technicalHealth, technicalServerConfigured, technicalUser } from "@/lib/technical-alerts-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!technicalServerConfigured()) return Response.json({ ok: true, ready: false, message: "Closed-app technical monitoring is not activated. Server setup and a verified minute-level scheduler are required.", store: null }, { headers: { "Cache-Control": "no-store" } });
    const userId = await technicalUser(request), { db } = await pushServices();
    const [health, document] = await Promise.all([technicalHealth(), db.doc(`technicalAccounts/${userId}`).get()]);
    return Response.json({ ok: true, ...health, store: readServerTechnicalStore(document.data()?.store) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return technicalError(e); }
}
export async function POST(request: Request) {
  try {
    if (!technicalServerConfigured()) throw new TechnicalRequestError("Closed-app monitoring is not configured. Use in-app alerts for now.", 503);
    const userId = await technicalUser(request);
    if (Number(request.headers.get("content-length")) > 8192) throw new TechnicalRequestError("Request too large.", 413);
    const raw = await request.text(); if (raw.length > 8192) throw new TechnicalRequestError("Request too large.", 413);
    let command: TechnicalCommand; try { command = JSON.parse(raw); } catch { throw new TechnicalRequestError("Invalid request."); }
    const { db } = await pushServices();
    if (command?.action === "save" || command?.action === "resume") {
      if (!(await technicalHealth()).ready) throw new TechnicalRequestError("Wait for a healthy server scheduler before enabling this alert.", 503);
      const devices = await db.collection("notificationDevices").where("userId", "==", userId).limit(20).get();
      if (!devices.docs.some(d => { const p = notificationPreferences(d.data().preferences); return p.trades && p.pausedUntil <= Date.now() && Date.now() - d.data().lastActive < 90 * 86400000; })) throw new TechnicalRequestError("Enable trade notifications on a signed-in device first.");
    }
    const ref = db.doc(`technicalAccounts/${userId}`), registry = db.doc("technicalSystem/registry"), revision = randomUUID(), now = Date.now();
    const store = await db.runTransaction(async tx => {
      const [saved, registryDoc] = await Promise.all([tx.get(ref), tx.get(registry)]);
      if (now - (saved.data()?.lastMutation ?? 0) < 1000) throw new TechnicalRequestError("Please wait a second before another change.", 429);
      const next = applyTechnicalCommand(readServerTechnicalStore(saved.data()?.store), command, now, revision);
      const groups = [...new Set(next.rules.filter(r => ["active", "paused"].includes(r.status) && r.expiresAt > now).map(technicalGroup))];
      const users: Record<string, { groups: string[]; until: number }> = Object.fromEntries(Object.entries(registryDoc.data()?.users ?? {}).filter(([, v]) => (v as { until: number }).until > now)) as Record<string, { groups: string[]; until: number }>;
      if (groups.length) users[userId] = { groups, until: Math.max(...next.rules.filter(r => ["active", "paused"].includes(r.status)).map(r => r.expiresAt)) }; else delete users[userId];
      if (Object.keys(users).length > 10 || new Set(Object.values(users).flatMap(v => v.groups)).size > 24) throw new TechnicalRequestError("Server monitoring capacity reached. Use in-app alerts until capacity is expanded.", 409);
      tx.set(registry, { users });
      tx.set(ref, { store: next, active: next.rules.some(r => r.status === "active" && r.expiresAt > now), lastMutation: now, updatedAt: now });
      return next;
    });
    return Response.json({ ok: true, store }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return technicalError(e); }
}
