import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { pushConfigured, pushServices } from "@/lib/push-admin";
import { notificationPreferences, indiaClock } from "@/lib/notification-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!pushConfigured()) return Response.json({ error: "Background delivery setup is pending." }, { status: 503 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Sign-in service unavailable." }, { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(authorization.slice(7));
  if (error || !data.user) return Response.json({ error: "Session expired." }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 8192) return Response.json({ error: "Request too large." }, { status: 413 });
  let body; try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body?.token !== "string" || !/^[\w:.-]{20,4096}$/.test(body.token)) return Response.json({ error: "Invalid device token." }, { status: 400 });
  try {
    const { db, messaging } = await pushServices(), id = createHash("sha256").update(body.token).digest("hex"), ref = db.collection("notificationDevices").doc(id);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.userId !== data.user.id) return Response.json({error:"This device registration belongs to another session. Sign out and reconnect."},{status:403});
    const preferences = notificationPreferences(body.preferences), paused = preferences.pausedUntil > Date.now();
    for (const [topic, on] of [["papertrade-ipo-v3", preferences.ipo], ["papertrade-allotment-v3", preferences.allotment]] as const) {
      const result = !body.remove && on && !paused
        ? await messaging.subscribeToTopic(body.token, topic)
        : await messaging.unsubscribeFromTopic(body.token, topic);
      if (result.failureCount) throw new Error("Topic registration failed");
    }
    if (body.remove) { await ref.delete(); return Response.json({ ok: true }); }
    const count = Math.min(10000, Math.max(0, Math.floor(Number(body.reviewCount) || 0)));
    // Store no holdings, PAN, P&L amount, names or credentials with push tokens.
    await ref.set({ userId: data.user.id, token: body.token, preferences, lastActive: Date.now(), reviewDate: indiaClock(Date.now()).day, reviewCount: count, expiresAt: new Date(Date.now() + 90 * 86400000) }, { merge: true });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: "Could not register background delivery. Please retry." }, { status: 503 }); }
}
