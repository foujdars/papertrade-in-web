import { createHash, timingSafeEqual } from "node:crypto";
import { pushConfigured, pushServices, sendPush } from "@/lib/push-admin";
import { allotmentNotice, indiaClock, ipoDigest, notificationPreferences, reviewNotice, type PushNotice } from "@/lib/notification-policy";
import { loadAllotments } from "@/lib/ipo-allotment-server";
import { GET as getIpos } from "@/app/api/upstox/ipos/route";
import type { IpoListResponse } from "@/lib/ipo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET || "", provided = request.headers.get("authorization") || "";
  if (secret.length < 32 || !pushConfigured()) return Response.json({ error: "Notification service is not configured." }, { status: 503 });
  const expected = `Bearer ${secret}`;
  if (Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { db, messaging, FieldValue, FieldPath } = await pushServices(), lock = db.doc("notificationSystem/dispatchLock"), now = Date.now();
  const lease = await db.runTransaction(async tx => { const saved = await tx.get(lock); if ((saved.data()?.until || 0) > now) return false; tx.set(lock, { until: now + 65000 }); return true; });
  if (!lease) return Response.json({ ok: true, busy: true });
  let sent = 0;
  try {
    const [response, allotments] = await Promise.all([
      getIpos(new Request("https://www.papertrade.site/api/upstox/ipos?status=open,closed,listed&details=1")).then(res => res.json() as Promise<IpoListResponse>),
      loadAllotments(),
    ]);
    if (!response.ok) throw new Error("IPO feed unavailable");
    const stateRef = db.doc("notificationSystem/observations"), saved = await stateRef.get();
    const previous = saved.data()?.allotments || {}, day = indiaClock(now).day;
    const ipos = response.ipos || [], events: PushNotice[] = [];
    const digest = ipoDigest(ipos, now); if (digest) events.push(digest);
    // First deployment records a baseline: it must not broadcast old results.
    const newResults = saved.exists ? allotments.allotments.filter(item => previous[item.id] !== "published" && item.state === "published" && item.evidenceUrl && (previous[item.id] || item.allotmentDate === day)) : [];
    const released = allotmentNotice(newResults, now); if (released) events.push(released);
    const listings = ipos.filter(ipo => saved.exists && ipo.status === "listed" && ipo.details?.listingDate === day && ipo.details.listingPrice && ipo.details.issuePrice && !saved.data()?.listed?.[ipo.id]);
    if (listings.length) events.push({ id: `listing-${listings.map(ipo=>ipo.id).sort().join("-")}`, kind: "ipo", title: "From GMP to reality: today’s listings", body: listings.slice(0,3).map(ipo => `${ipo.name}: ₹${ipo.details!.listingPrice}, ${((ipo.details!.listingPrice! / ipo.details!.issuePrice! - 1) * 100).toFixed(2)}% vs issue price`).join("; "), url: "/?screen=ipo", expiresAt: now + 2 * 3600000, silent: true });
    const refs = events.map(event => db.collection("notificationOutbox").doc(hash(event.id)));
    await db.runTransaction(async tx => {
      const existing = await Promise.all(refs.map(ref => tx.get(ref)));
      events.forEach((event,index) => { if (!existing[index].exists) tx.create(refs[index], { notice: event, status: "pending", createdAt: now, expiresAt: new Date(now + 7 * 86400000) }); });
      tx.set(stateRef, { allotments: { ...previous, ...Object.fromEntries(allotments.allotments.map(item => [item.id, previous[item.id] === "published" ? "published" : item.state])) }, listed: { ...saved.data()?.listed, ...Object.fromEntries(listings.map(ipo=>[ipo.id,true])) } });
    });
    const queued = await db.collection("notificationOutbox").where("status","==","pending").limit(50).get();
    for (const doc of queued.docs) {
      const notice = doc.data().notice as PushNotice;
      if (notice.expiresAt <= Date.now()) { await doc.ref.update({status:"expired"}); continue; }
      // An ambiguous network outcome is not blindly resent. Device IDs also dedupe.
      await doc.ref.update({ status: "sending", attemptedAt: Date.now() });
      try {
        await sendPush(notice, { topic: notice.kind === "allotment" ? "papertrade-allotment-v3" : "papertrade-ipo-v3" });
        await doc.ref.update({ status:"sent" }); sent++;
        if (notice.id.startsWith("ipo-")) await db.doc(`notificationCalendar/${day}`).set({ count: FieldValue.increment(1) }, { merge:true });
      } catch { await doc.ref.update({status:"needs-review"}); }
    }
    // Rotate the device page so opt-in summaries do not depend on opening the app.
    const cursorRef = db.doc("notificationSystem/deviceCursor"), cursor = (await cursorRef.get()).data()?.after;
    let query = db.collection("notificationDevices").orderBy(FieldPath.documentId()).limit(250);
    if (cursor) query = query.startAfter(cursor);
    const devices = await query.get(), calendarCount = (await db.doc(`notificationCalendar/${day}`).get()).data()?.count || 0;
    const clock = indiaClock(now);
    for (const device of devices.docs) {
      const data = device.data(), preferences = notificationPreferences(data.preferences);
      if (now - data.lastActive > 90 * 86400000) {
        for (const topic of ["papertrade-ipo-v3","papertrade-allotment-v3"]) {
          const result = await messaging.unsubscribeFromTopic(data.token,topic);
          if (result.failureCount) throw new Error("Device cleanup failed");
        }
        await device.ref.delete(); continue;
      }
      if (preferences.pausedUntil > now) continue;
      if (data.preferences?.pausedUntil > 0 && data.preferences.pausedUntil <= now) {
        for (const [topic,on] of [["papertrade-ipo-v3",preferences.ipo],["papertrade-allotment-v3",preferences.allotment]] as const) if(on) {
          const result = await messaging.subscribeToTopic(data.token,topic);
          if (result.failureCount) throw new Error("Could not resume notifications");
        }
        await device.ref.update({ "preferences.pausedUntil":0 });
      }
      if (preferences.ipo && calendarCount >= 2) continue;
      let notice = preferences.reviews ? reviewNotice(data.reviewCount, data.reviewDate, now) : null;
      if (!notice && preferences.practice && clock.weekday === 0 && clock.minutes >= 1080 && clock.minutes < 1090 && now-data.lastActive >= 3*86400000) notice = { id:`practice-${day}`,kind:"practice",title:"No catch-up needed. Just one candle.",body:"Pick a past chart and practise your next decision in replay.",url:"/?screen=pnl",expiresAt:now+30*60000,silent:false };
      if (!notice || data.lastNotice === notice.id || now-data.lastActive < 10*60000) continue;
      // Claim before sending, preventing repeated notifications on overlapping runs.
      await device.ref.update({lastNotice:notice.id});
      try { await sendPush(notice,{token:data.token}); sent++; }
      catch(error) { if ((error as {code?:string}).code === "messaging/registration-token-not-registered") await device.ref.delete(); }
    }
    await cursorRef.set({after:devices.size===250 ? devices.docs.at(-1)!.id : null});
    return Response.json({ok:true,sent}, {headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Notification dispatch could not complete. Check service configuration and feed availability."},{status:503}); }
  finally { await lock.set({until:0}); }
}
