import "server-only";
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { GET as getGlobalMarkets } from "@/app/api/global-markets/route";
import { evaluateGlobalAlert, ema21EntrySignal, globalAlertError, isEma21EntryKind, type GlobalAlert } from "./global-alerts";
import { divergenceTitle, emaTitle, notificationPreferences, quietTime, type PushNotice } from "./notification-policy";
import { sendPush } from "./push-admin";
import type { Candle } from "./market";
import type { PerpQuote } from "./global-markets";

export type CloudGlobalRule = GlobalAlert & { delivery: "server" };
export function cloudGlobalRules(value: unknown): CloudGlobalRule[] {
  if (!Array.isArray(value)) throw new Error("Invalid global alert store");
  if (value.some(r => !r || r.delivery !== "server" || typeof r.id !== "string" || globalAlertError(r))) throw new Error("Invalid global alert store");
  return value as CloudGlobalRule[];
}
export function cloudGlobalKind(rule: GlobalAlert) {
  return typeof rule.kind === "string" && (rule.kind === "psbb-divergence" || isEma21EntryKind(rule.kind));
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const url = (symbol: string, frame?: string) => `https://www.papertrade.site/api/global-markets?symbol=${encodeURIComponent(symbol)}${frame ? `&mode=candles&timeframe=${encodeURIComponent(frame)}` : ""}`;
async function feed(symbol: string, frame?: string): Promise<{ quote?: PerpQuote; candles?: Candle[] }> {
  const response = await getGlobalMarkets(new Request(url(symbol, frame)));
  const body = await response.json();
  if (!response.ok || !body.ok || (frame ? !Array.isArray(body.candles) : !body.quote)) throw new Error("Global market feed unavailable");
  return body;
}

/** Called by the already-installed minute-level technical dispatcher, including outside NSE hours. */
export async function dispatchCloudGlobalAlerts(db: Firestore, now = Date.now()) {
  const accounts = await db.collection("globalAlertAccounts").where("active", "==", true).limit(11).get();
  if (accounts.size > 10) throw new Error("Global alert capacity exceeded");
  for (const account of accounts.docs) {
    if (!cloudGlobalRules(account.data().rules ?? []).some(r => !r.cancelled && !r.triggeredAt && r.expiresAt > now)) await account.ref.update({ active: false });
  }
  const entries = accounts.docs.flatMap(account => cloudGlobalRules(account.data().rules ?? []).filter(r => !r.cancelled && !r.triggeredAt && r.expiresAt > now).map(rule => ({ account, rule })));
  const groups = [...new Set(entries.map(({ rule }) => `${rule.symbol}:${rule.timeframe}`))];
  if (groups.length > 12) throw new Error("Global candle group capacity exceeded");
  const market = new Map<string, Promise<{ quote?: PerpQuote; candles?: Candle[] }>>();
  const get = (symbol: string, frame?: string) => {
    const key = `${symbol}:${frame ?? "quote"}`;
    if (!market.has(key)) market.set(key, feed(symbol, frame));
    return market.get(key)!;
  };
  let checked = 0, sent = 0, failed = 0;
  for (const { account, rule } of entries) {
    if (Date.now() - now > 12000) { failed++; break; }
    try {
      const [snapshot, history] = await Promise.all([rule.kind === "psbb-divergence" ? Promise.resolve(null) : get(rule.symbol), get(rule.symbol, rule.timeframe)]);
      const quote = snapshot?.quote;
      const candles = history.candles ?? [];
      const observed = Date.now();
      const triggered = evaluateGlobalAlert(rule, quote, candles, observed);
      const triggerSide = triggered && isEma21EntryKind(rule.kind) && quote
        ? ema21EntrySignal(candles, quote, rule.timeframe as "5m" | "15m", observed) : null;
      await db.runTransaction(async tx => {
        const saved = await tx.get(account.ref);
        const rules = cloudGlobalRules(saved.data()?.rules ?? []);
        const live = rules.find(r => r.id === rule.id && !r.cancelled && !r.triggeredAt && r.expiresAt > observed);
        if (!live) return;
        if (triggered) {
          tx.set(account.ref, { ...saved.data(), rules: rules.map(r => r.id === live.id ? { ...r, triggeredAt: observed, ...(triggerSide ? { triggerSide } : {}) } : r), active: rules.some(r => r.id !== live.id && !r.cancelled && !r.triggeredAt && r.expiresAt > observed) });
          tx.create(db.doc(`globalAlertOutbox/${hash(account.id + live.id)}`), { userId: account.id, ruleId: live.id, status: "pending", createdAt: observed, expiresAt: observed + 180000 });
        }
      });
      checked++;
    } catch { failed++; }
  }
  const outbox = await db.collection("globalAlertOutbox").where("status", "==", "pending").limit(30).get();
  for (const item of outbox.docs) {
    if (Date.now() - now > 17000) { failed++; break; }
    const queued = item.data();
    if (queued.expiresAt < Date.now()) { await item.ref.update({ status: "expired" }); continue; }
    const account = await db.doc(`globalAlertAccounts/${queued.userId}`).get();
    const rule = cloudGlobalRules(account.data()?.rules ?? []).find(r => r.id === queued.ruleId && r.triggeredAt && !r.cancelled);
    if (!rule) { await item.ref.update({ status: "cancelled" }); continue; }
    await item.ref.update({ status: "sending", attemptedAt: Date.now() });
    try {
      const devices = await db.collection("notificationDevices").where("userId", "==", queued.userId).limit(20).get();
      let delivered = 0;
      for (const device of devices.docs) {
        const target = device.data(), prefs = notificationPreferences(target.preferences);
        if (!prefs.trades || prefs.pausedUntil > Date.now() || Date.now() - target.lastActive > 90 * 86400000) continue;
        const isEma = isEma21EntryKind(rule.kind);
        const notice: PushNotice = { id: `global:${queued.userId}:${rule.id}`, kind: "trade", title: isEma ? emaTitle(rule.symbol, rule.timeframe) : divergenceTitle(rule.symbol, rule.timeframe), body: "", url: `/?symbol=${rule.symbol}&timeframe=${rule.timeframe}`, silent: quietTime(Date.now()), expiresAt: queued.expiresAt };
        await sendPush(notice, { token: target.token }); delivered++;
      }
      await item.ref.update({ status: delivered ? "sent" : "no-device", delivered }); sent += delivered;
    } catch { await item.ref.update({ status: "needs-review" }); failed++; }
  }
  await db.doc("globalAlertSystem/health").set({ lastRun: Date.now(), ok: failed === 0, checked, sent, failed });
  return { checked, sent, failed };
}
