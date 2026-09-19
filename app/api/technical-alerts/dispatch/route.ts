import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { pushServices, sendPush } from "@/lib/push-admin";
import { technicalServerConfigured } from "@/lib/technical-alerts-server";
import { readServerTechnicalStore } from "@/lib/technical-alerts-server-model";
import { advanceTechnical, evaluateTechnical, technicalCheckDue, technicalDescription, technicalGroup, validTechnicalCandles, type TechnicalRule } from "@/lib/technical-alerts";
import { notificationPreferences, quietTime, type PushNotice } from "@/lib/notification-policy";
import { GET as getCandles } from "@/app/api/upstox/candles/route";
import { GET as getSession } from "@/app/api/market/session/route";
import type { Candle } from "@/lib/market";
import type { NseSession } from "@/lib/market-hours";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export async function GET(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET ?? "", given = request.headers.get("authorization") ?? "", expected = `Bearer ${secret}`;
  if (!technicalServerConfigured()) return Response.json({ error: "Technical monitoring setup required." }, { status: 503 });
  if (Buffer.byteLength(given) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { db } = await pushServices(), lease = db.doc("technicalSystem/lease"), health = db.doc("technicalSystem/health"), owner = randomUUID(), started = Date.now();
  const acquired = await db.runTransaction(async tx => { const saved = await tx.get(lease); if ((saved.data()?.until ?? 0) > started) return false; tx.set(lease, { owner, until: started + 90000 }); return true; });
  if (!acquired) return Response.json({ ok: true, busy: true });
  let checked = 0, sent = 0, failed = 0;
  try {
    const accounts = await db.collection("technicalAccounts").where("active", "==", true).limit(11).get();
    if (accounts.size > 10) throw new Error("Capacity requires a sharded scheduler");
    const sessionPayload = await (await getSession(new Request("https://www.papertrade.site/api/market/session"))).json();
    const session = sessionPayload.session as NseSession;
    if (!session || session.status === "UNAVAILABLE") throw new Error("Exchange session unavailable");
    // Current evaluator supports the regular NSE session only; do not misalign special sessions.
    const regular = session.sessions.some(s => { const open = new Date(s.start + 19800000), close = new Date(s.end + 19800000); return open.getUTCHours() === 9 && open.getUTCMinutes() === 15 && close.getUTCHours() === 15 && close.getUTCMinutes() === 30; });
    const canEvaluate = regular && session.sessions.some(s => started >= s.start && started <= s.end + 180000);
    const data = new Map<string, Promise<Candle[]>>();
    const load = (rule: TechnicalRule, timeframe = rule.timeframe) => {
      const key = `${rule.instrument.instrumentKey}:${timeframe}`;
      if (!data.has(key)) data.set(key, (async () => {
        const response = await getCandles(new Request(`https://www.papertrade.site/api/upstox/candles?instrumentKey=${encodeURIComponent(rule.instrument.instrumentKey)}&timeframe=${timeframe}&strict=1`));
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.candles) || !payload.candles.length) throw new Error("Candle feed unavailable");
        const candles = validTechnicalCandles(payload.candles);
        if (candles.length !== payload.candles.length) throw new Error("Invalid candle history");
        return candles;
      })());
      return data.get(key)!;
    };
    const entries = accounts.docs.flatMap(account => readServerTechnicalStore(account.data().store).rules.filter(r => r.status === "active").map(rule => ({ ref: account.ref, userId: account.id, rule })));
    if (new Set(entries.map(e => technicalGroup(e.rule))).size > 24) throw new Error("Monitoring group capacity exceeded");
    let cursor = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < entries.length && Date.now() - started < 38000) {
        const entry = entries[cursor++], rule = entry.rule;
        try {
          const now = Date.now(), expired = rule.expiresAt <= now;
          if (!expired && (!canEvaluate || !technicalCheckDue(rule.timeframe, now))) continue;
          const evaluation = expired ? null : evaluateTechnical(rule, await load(rule), rule.family === "previousDay" ? await load(rule, "1D") : [], Date.now());
          await db.runTransaction(async tx => {
            const saved = await tx.get(entry.ref), store = readServerTechnicalStore(saved.data()?.store), live = store.rules.find(r => r.id === rule.id && r.revision === rule.revision && r.status === "active");
            if (!live) return;
            const result = expired ? { rule: { ...live, status: "expired" as const }, event: { id: `expired:${live.id}:${live.revision}`, ruleId: live.id, instrument: live.instrument, timeframe: live.timeframe, description: technicalDescription(live), barTime: 0, createdAt: now, price: 0, detail: "Server monitoring period ended", kind: "expired" as const } } : advanceTechnical(live, evaluation!, Date.now());
            const events = result.event ? [result.event, ...store.events.filter(e => e.id !== result.event!.id)].slice(0, 200) : store.events;
            const rules = store.rules.map(r => r.id === live.id ? result.rule : r);
            tx.set(entry.ref, { ...saved.data(), store: { ...store, rules, events }, active: rules.some(r => r.status === "active" && r.expiresAt > now), checkedAt: now, state: evaluation?.state ?? "Expired" });
            if (result.event?.kind === "trigger") tx.create(db.doc(`technicalOutbox/${digest(entry.userId + result.event.id)}`), { userId: entry.userId, event: result.event, status: "pending", expiresAt: now + 180000 });
          }); checked++;
        } catch { failed++; }
      }
    }));
    if (cursor < entries.length) failed++;
    const outbox = await db.collection("technicalOutbox").where("status", "==", "pending").limit(50).get();
    for (const doc of outbox.docs) {
      if (Date.now() - started > 50000) break;
      const queued = doc.data();
      if (queued.expiresAt <= Date.now()) { await doc.ref.update({ status: "expired" }); continue; }
      const account = await db.doc(`technicalAccounts/${queued.userId}`).get(), store = readServerTechnicalStore(account.data()?.store);
      const rule = store.rules.find(r => r.id === queued.event.ruleId);
      if (!rule || rule.status === "paused" || queued.event.id !== `technical:${rule.id}:${rule.revision}:${queued.event.barTime}` || !store.events.some(e => e.id === queued.event.id)) { await doc.ref.update({ status: "cancelled" }); continue; }
      // Claim before send; unknown transport outcomes are retained for review, not blindly resent.
      await doc.ref.update({ status: "sending", attemptedAt: Date.now() });
      try {
        const devices = await db.collection("notificationDevices").where("userId", "==", queued.userId).limit(20).get();
        let delivered = 0;
        for (const device of devices.docs) {
          const target = device.data(), prefs = notificationPreferences(target.preferences);
          if (!prefs.trades || prefs.pausedUntil > Date.now() || Date.now() - target.lastActive > 90 * 86400000) continue;
          const event = queued.event;
          const notice: PushNotice = { id: event.id, kind: "trade", title: `${event.instrument.symbol} · technical alert`, body: prefs.hideAmounts ? "A technical condition was confirmed at candle close. Open your alert log to review." : `${event.timeframe} · ${event.description} · close ₹${event.price.toFixed(2)}`, url: `/?symbol=${encodeURIComponent(event.instrument.symbol)}&timeframe=${event.timeframe}`, silent: quietTime(Date.now()), expiresAt: queued.expiresAt };
          await sendPush(notice, { token: target.token }); delivered++;
        }
        await doc.ref.update({ status: delivered ? "sent" : "no-device", delivered }); sent += delivered;
      } catch { await doc.ref.update({ status: "needs-review" }); failed++; }
    }
    await health.set({ lastRun: Date.now(), ok: failed === 0, checked, sent, failed });
    return Response.json({ ok: failed === 0, checked, sent, failed }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch { await health.set({ lastRun: Date.now(), ok: false }); return Response.json({ error: "Server monitoring check failed. Review service configuration, capacity and feed availability." }, { status: 503 }); }
  finally { await db.runTransaction(async tx => { const saved = await tx.get(lease); if (saved.data()?.owner === owner) tx.set(lease, { owner, until: 0 }); }); }
}
