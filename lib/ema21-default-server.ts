import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { GET as getGlobalMarkets } from "@/app/api/global-markets/route";
import { ema21EntrySignal, GLOBAL_EMA21_FRAMES } from "./global-alerts";
import { EMA21_DEFAULT_MARKETS, ema21AlertNotice, type Ema21DefaultFrame } from "./ema21-default-alerts";
import { notificationPreferences, type PushNotice } from "./notification-policy";
import { sendPush } from "./push-admin";
import type { Candle } from "./market";
import type { PerpQuote } from "./global-markets";

async function loadMarket(symbol: string, frame?: Ema21DefaultFrame) {
  const response = await getGlobalMarkets(new Request(`https://www.papertrade.site/api/global-markets?symbol=${encodeURIComponent(symbol)}${frame ? `&mode=candles&timeframe=${frame}` : ""}`));
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error("Global market feed unavailable");
  return body as { quote?: PerpQuote; candles?: Candle[] };
}

/** Closed-app EMA 21 arrow alerts for BTC, ETH and gold. One notice per trigger candle. */
export async function dispatchDefaultEma21Alerts(db: Firestore, now = Date.now()) {
  const found: PushNotice[] = [];
  for (const market of EMA21_DEFAULT_MARKETS) {
    for (const frame of ["5m", "15m"] as const) {
      try {
        const [quoteBody, candleBody] = await Promise.all([loadMarket(market.symbol), loadMarket(market.symbol, frame)]);
        if (!quoteBody.quote || !candleBody.candles?.length) continue;
        const side = ema21EntrySignal(candleBody.candles, quoteBody.quote, frame, now);
        if (!side) continue;
        const candleTime = Math.floor(now / 1000 / GLOBAL_EMA21_FRAMES[frame]) * GLOBAL_EMA21_FRAMES[frame];
        found.push(ema21AlertNotice({ symbol: market.symbol, label: market.label, frame, side, candleTime, now }));
      } catch { /* One symbol must not block the other EMA 21 alerts. */ }
    }
  }
  if (!found.length) return { signals: 0, sent: 0 };
  const devices = await db.collection("notificationDevices").limit(40).get();
  if (devices.empty) return { signals: found.length, sent: 0 };
  const stateRef = db.doc("notificationSystem/ema21Default");
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
      if (typeof data.token !== "string" || preferences.pausedUntil > now || !preferences.ema21 || now - Number(data.lastActive || 0) > 90 * 86400000) continue;
      try {
        await sendPush(notice, { token: data.token });
        sent += 1;
      } catch { /* Claimed ids are not retried. A bad token must not ping every minute. */ }
    }
  }
  return { signals: fresh.length, sent };
}
