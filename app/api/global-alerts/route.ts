import { randomUUID } from "node:crypto";
import { cloudGlobalKind, cloudGlobalRules } from "@/lib/global-alerts-server";
import { globalAlertError, type GlobalAlert } from "@/lib/global-alerts";
import { pushServices } from "@/lib/push-admin";
import { technicalError, technicalServerConfigured, technicalUser } from "@/lib/technical-alerts-server";
import { TechnicalRequestError } from "@/lib/technical-alerts-server-model";
import { notificationPreferences } from "@/lib/notification-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!technicalServerConfigured()) return Response.json({ ok: true, ready: false, message: "Closed-app monitoring is not configured.", rules: [] });
    const userId = await technicalUser(request);
    const { db } = await pushServices();
    const [heartbeat, saved] = await Promise.all([db.doc("globalAlertSystem/health").get(), db.doc(`globalAlertAccounts/${userId}`).get()]);
    const status = heartbeat.data();
    const ready = Number.isFinite(status?.lastRun) && Date.now() - status!.lastRun < 180000 && status?.ok === true;
    return Response.json({ ok: true, ready, message: ready ? "Global server monitoring online" : "Global scheduler has not reported a healthy check.", rules: cloudGlobalRules(saved.data()?.rules ?? []) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return technicalError(error); }
}
export async function POST(request: Request) {
  try {
    if (!technicalServerConfigured()) throw new TechnicalRequestError("Closed-app monitoring is not configured.", 503);
    const userId = await technicalUser(request);
    if (Number(request.headers.get("content-length")) > 4096) throw new TechnicalRequestError("Request too large.", 413);
    const raw = await request.text();
    if (raw.length > 4096) throw new TechnicalRequestError("Request too large.", 413);
    let command: { action: "create" | "cancel"; rule?: GlobalAlert; id?: string };
    try { command = JSON.parse(raw); } catch { throw new TechnicalRequestError("Invalid alert request."); }
    if (!command || !["create", "cancel"].includes(command.action)) throw new TechnicalRequestError("Unknown alert action.");
    const { db } = await pushServices(), ref = db.doc(`globalAlertAccounts/${userId}`), now = Date.now();
    let rule: GlobalAlert | undefined;
    if (command.action === "create") {
      const input = command.rule;
      if (!input || !cloudGlobalKind(input)) throw new TechnicalRequestError("Only BTC, ETH and gold PSBB or 21 EMA alerts support closed-app monitoring.");
      rule = { id: randomUUID(), symbol: input.symbol, kind: input.kind, value: 0, length: input.length, timeframe: input.timeframe, ...(input.kind === "psbb-divergence" ? { psbbInputs: input.psbbInputs } : {}), createdAt: now, expiresAt: now + 7 * 86400000 };
      const error = globalAlertError(rule); if (error) throw new TechnicalRequestError(error);
      const globalHealth = (await db.doc("globalAlertSystem/health").get()).data();
      if (!globalHealth?.ok || now - globalHealth.lastRun > 180000) throw new TechnicalRequestError("Wait for a healthy global server scheduler before saving.", 503);
      const devices = await db.collection("notificationDevices").where("userId", "==", userId).limit(20).get();
      if (!devices.docs.some(d => { const p = notificationPreferences(d.data().preferences); return p.trades && p.pausedUntil <= now && now - d.data().lastActive < 90 * 86400000; })) throw new TechnicalRequestError("Connect trade notifications on this device first.");
      const accounts = await db.collection("globalAlertAccounts").where("active", "==", true).limit(11).get();
      if (accounts.size >= 10 && !accounts.docs.some(d => d.id === userId)) throw new TechnicalRequestError("Server monitoring capacity reached. Use app-open alerts for now.", 409);
      const groups = new Set(accounts.docs.flatMap(d => cloudGlobalRules(d.data().rules ?? []).filter(r => !r.cancelled && !r.triggeredAt && r.expiresAt > now).map(r => `${r.symbol}:${r.timeframe}`)));
      groups.add(`${rule.symbol}:${rule.timeframe}`);
      if (groups.size > 12) throw new TechnicalRequestError("Global timeframe capacity reached. Use app-open alerts for now.", 409);
    } else if (typeof command.id !== "string" || !/^[\w-]{1,80}$/.test(command.id)) throw new TechnicalRequestError("Invalid alert ID.");
    const result = await db.runTransaction(async tx => {
      const saved = await tx.get(ref), current = cloudGlobalRules(saved.data()?.rules ?? []);
      if (command.action === "cancel" && !current.some(r => r.id === command.id)) throw new TechnicalRequestError("Alert not found.", 404);
      if (rule && current.filter(r => !r.cancelled && !r.triggeredAt && r.expiresAt > now).length >= 12) throw new TechnicalRequestError("Maximum 12 active closed-app global alerts.", 409);
      const rules = rule ? [{ ...rule, delivery: "server" as const }, ...current].slice(0, 40) : current.map(r => r.id === command.id ? { ...r, cancelled: true } : r);
      tx.set(ref, { rules, active: rules.some(r => !r.cancelled && !r.triggeredAt && r.expiresAt > now), updatedAt: now });
      return rules;
    });
    return Response.json({ ok: true, rules: result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return technicalError(error); }
}
