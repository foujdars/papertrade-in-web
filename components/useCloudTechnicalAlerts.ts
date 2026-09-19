"use client";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { connectPush } from "@/lib/push-client";
import { addPaperTradeNotification, readPaperTradeNotifications } from "@/lib/notification-center";
import { emptyTechnicalStore, parseTechnicalStore, type TechnicalConfig, type TechnicalRule, type TechnicalStore } from "@/lib/technical-alerts";
import type { Instrument } from "@/lib/market";
export function useCloudTechnicalAlerts(ownerId: string) {
  const [store, setStore] = useState<TechnicalStore>(emptyTechnicalStore), [ready, setReady] = useState(false), [message, setMessage] = useState("Checking closed-app availability…");
  const alive = useRef(true), sequence = useRef(0), changing = useRef(false);
  async function request(body?: unknown) {
    const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
    if (!session || session.user.id !== ownerId) throw new Error("Sign in to use closed-app technical alerts.");
    const response = await fetch("/api/technical-alerts", { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(15000) });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Closed-app monitoring is unavailable.");
    return payload;
  }
  function accept(value: TechnicalStore | null) {
    if (!value || !alive.current) return;
    const parsed = parseTechnicalStore(JSON.stringify(value)); setStore(parsed);
    const known = new Set(readPaperTradeNotifications().map(n => n.id));
    for (const event of [...parsed.events].reverse()) if (event.kind === "trigger" && !known.has(event.id) && Date.now() - event.createdAt < 86400000) {
      try { addPaperTradeNotification({ id: event.id, createdAt: event.createdAt, kind: "trade", title: "Technical alert · server", body: `${event.instrument.symbol} · ${event.timeframe} · ${event.description}`, symbol: event.instrument.symbol, instrumentKey: event.instrument.instrumentKey, instrument: event.instrument, timeframe: event.timeframe }); } catch { /* Server Log is retained even if browser storage is full. */ }
    }
  }
  async function refresh() {
    if (changing.current) return;
    const version = ++sequence.current;
    try { const payload = await request(); if (!alive.current || version !== sequence.current) return; setReady(payload.ready === true); setMessage(payload.message ?? "Server monitoring status unavailable"); accept(payload.store); }
    catch (e) { if (alive.current && version === sequence.current) { setReady(false); setMessage(e instanceof Error ? e.message : "Server monitoring unavailable"); } }
  }
  async function change(body: unknown) {
    if (changing.current) return "Please wait for the current alert change to finish.";
    changing.current = true;
    const version = ++sequence.current;
    try { const payload = await request(body); if (alive.current && version === sequence.current) accept(payload.store); return null; }
    catch (e) { return e instanceof Error ? e.message : "Server change could not be confirmed. Refresh before retrying."; }
    finally { changing.current = false; }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive.current = false; ++sequence.current; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [ownerId]);
  return { ...store, ready, message, refresh,
    enablePush: async () => { try { await connectPush(true); await refresh(); return null; } catch (e) { return e instanceof Error ? e.message : "Could not enable notifications."; } },
    save: (config: TechnicalConfig, instrument: Instrument, editing?: TechnicalRule) => change({ action: "save", config, instrument, id: editing?.id, revision: editing?.revision }),
    toggle: (rule: TechnicalRule) => change({ action: rule.status === "paused" ? "resume" : "pause", id: rule.id, revision: rule.revision }),
    remove: (rule: TechnicalRule) => change({ action: "delete", id: rule.id, revision: rule.revision }),
  };
}
