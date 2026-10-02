import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { GET as getGlobalMarkets } from "@/app/api/global-markets/route";
import { ema5AlertNotice, ema5ReversalSignal, type Ema5Frame } from "./ema5-reversal";
import { notificationPreferences, type PushNotice } from "./notification-policy";
import { sendPush } from "./push-admin";
import type { Candle } from "./market";

async function loadCandles(frame: Ema5Frame) {
  const response = await getGlobalMarkets(new Request(`https://www.papertrade.site/api/global-markets?symbol=BTCUSD&mode=candles&timeframe=${frame}`));
  const body = await response.json() as { ok?: boolean; candles?: Candle[] };
  if (!response.ok || !body.ok || !Array.isArray(body.candles)) throw new Error("BTC candle feed unavailable");
  return body.candles;
}

/** Closed-app 5 EMA reversal alerts for BTC. One notice per alert candle. */
export async function dispatchEma5ReversalAlerts(db: Firestore, now = Date.now()) {
  const found: PushNotice[] = [];
  for (const frame of ["5m", "15m"] as const) {
    try {
      const candleTime = ema5ReversalSignal(await loadCandles(frame), frame, now);
      if (candleTime == null) continue;
      found.push(ema5AlertNotice({ frame, candleTime, now }));
    } catch { /* One timeframe must not block the other. */ }
  }
  if (!found.length) return { signals: 0, sent: 0 };
  const devices = await db.collection("notificationDevices").limit(40).get();
  if (devices.empty) return { signals: found.length, sent: 0 };
  const stateRef = db.doc("notificationSystem/ema5Reversal");
  const saved = await stateRef.get();
  const previous = (saved.exists ? saved.data()?.sent : {}) as Record<string, number> | undefined;
  const sentMap = previous && typeof previous === "object" ? { ...previous } : {};
  const fresh = found.filter((notice) => !sentMap[notice.id]);
  if (!fresh.length) return { signals: found.length, sent: 0 };
  for (const notice of fresh) sentMap[notice.id] = now;
  const pruned = Object.fromEntries(Object.entries(sentMap).filter(([, at]) => typeof at === "number" && now - at < 2 * 86400000).slice(-80));
  await stateRef.set({ sent: pruned, updatedAt: now });
  let sent = 0;
  for (const notice of fresh) {
    for (const device of devices.docs) {
      if (sent >= 40) return { signals: fresh.length, sent };
      const data = device.data();
      const preferences = notificationPreferences(data.preferences);
      if (typeof data.token !== "string" || preferences.pausedUntil > now || !preferences.ema5 || now - Number(data.lastActive || 0) > 90 * 86400000) continue;
      try {
        await sendPush(notice, { token: data.token });
        sent += 1;
      } catch { /* Claimed ids are not retried. A bad token must not ping every minute. */ }
    }
  }
  return { signals: fresh.length, sent };
}
