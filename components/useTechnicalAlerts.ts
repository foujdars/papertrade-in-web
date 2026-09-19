"use client";
import { useEffect, useRef, useState } from "react";
import { useCloudTechnicalAlerts } from "./useCloudTechnicalAlerts";
import type { Candle, Instrument } from "@/lib/market";
import { addPaperTradeNotification } from "@/lib/notification-center";
import { advanceTechnical, emptyTechnicalStore, evaluateTechnical, parseTechnicalStore, technicalCheckDue, technicalConfigError, technicalDescription, technicalGroup, technicalLimitError, validTechnicalCandles, type TechnicalConfig, type TechnicalEvent, type TechnicalRule, type TechnicalStore } from "@/lib/technical-alerts";

export function useTechnicalAlerts(ownerId: string, marketOpen: boolean, onNotice: (message: string) => void) {
  const cloud = useCloudTechnicalAlerts(ownerId);
  const key = `papertrade-technical-alerts-v1:${ownerId}`;
  const [store, setStore] = useState<TechnicalStore>(emptyTechnicalStore);
  const [states, setStates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const current = useRef({ marketOpen, onNotice }); current.current = { marketOpen, onNotice };
  const read = () => parseTechnicalStore(localStorage.getItem(key));
  function write(next: TechnicalStore) { localStorage.setItem(key, JSON.stringify(next)); setStore(next); }
  async function change(update: (latest: TechnicalStore) => TechnicalStore) {
    try {
      const work = () => write(update(read()));
      if (navigator.locks) await navigator.locks.request(key, work); else work();
      setError(""); return null;
    } catch (e) { const message = e instanceof Error ? e.message : "Device storage is unavailable. Nothing was changed."; setError(message); return message; }
  }
  async function save(config: TechnicalConfig, instrument: Instrument, editing?: TechnicalRule) {
    const invalid = technicalConfigError(config);
    if (invalid) return invalid;
    if (["vwap", "volume"].includes(config.family) && (instrument.assetType === "INDEX" || instrument.instrumentKey.startsWith("NSE_INDEX|"))) return "Indices have no traded volume. Choose an equity or derivative for volume-based alerts.";
    if (editing && (config.delivery ?? "device") !== (editing.delivery ?? "device")) return "Monitoring mode cannot change while editing. Delete the old rule before creating one in another mode.";
    if (config.delivery === "server") return cloud.save(config, instrument, editing);
    return change(latest => {
      if (editing && !latest.rules.some(r => r.id === editing.id && r.revision === editing.revision)) throw new Error("This alert changed in another tab. Reopen it before editing.");
      const now = Date.now();
      const rule: TechnicalRule = { ...config, instrument, id: editing?.id ?? crypto.randomUUID(), revision: crypto.randomUUID(), createdAt: editing?.createdAt ?? now, armedAt: now, expiresAt: now + config.days * 86400000, status: "active", lastBar: undefined, lastTriggeredAt: undefined };
      const limit = technicalLimitError(latest.rules, rule); if (limit) throw new Error(limit);
      return { ...latest, rules: [rule, ...latest.rules.filter(r => r.id !== rule.id)] };
    });
  }
  async function toggle(rule: TechnicalRule) {
    if (rule.delivery === "server") { const failure = await cloud.toggle(rule); if (failure) setError(failure); return failure; }
    return change(latest => ({ ...latest, rules: latest.rules.map(r => {
      if (r.id !== rule.id) return r;
      if (r.revision !== rule.revision) throw new Error("This alert changed in another tab. Refresh its controls before changing it.");
      if (r.expiresAt <= Date.now()) throw new Error("This alert has expired. Edit it to create a fresh monitoring window.");
      if (!["active", "paused"].includes(r.status)) return r;
      return { ...r, status: r.status === "active" ? "paused" : "active", armedAt: Date.now(), revision: crypto.randomUUID(), lastBar: undefined };
    }) }));
  }
  async function remove(id: string) { const remote = cloud.rules.find(r => r.id === id); if (remote) { const failure = await cloud.remove(remote); if (failure) setError(failure); return failure; } return change(latest => ({ ...latest, rules: latest.rules.filter(r => r.id !== id) })); }
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const controllers = new Set<AbortController>();
    const cache = new Map<string, { at: number; candles: Candle[] }>();
    const refresh = () => { try { setStore(read()); setError(""); } catch { setError("Saved technical alerts could not be read. Monitoring is paused; your stored data has not been overwritten."); } };
    const storage = (event: StorageEvent) => { if (event.key === key) refresh(); };
    refresh(); window.addEventListener("storage", storage);
    async function candles(instrumentKey: string, timeframe: string) {
      const cacheKey = `${instrumentKey}:${timeframe}`, cached = cache.get(cacheKey), now = Date.now();
      const combined = !cached || now - cached.at > 600000 || timeframe === "1D";
      const controller = new AbortController(); controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(`/api/upstox/candles?instrumentKey=${encodeURIComponent(instrumentKey)}&timeframe=${timeframe}&scope=${combined ? "combined" : "intraday"}&strict=1`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.candles) || !payload.candles.length) throw new Error("Waiting for candle data · retrying automatically");
        const clean = validTechnicalCandles(payload.candles);
        if (clean.length !== payload.candles.length) throw new Error("Waiting for valid candle data");
        const merged = validTechnicalCandles(combined ? clean : [...cached!.candles, ...clean]).slice(-1600);
        cache.set(cacheKey, { at: combined ? now : cached!.at, candles: merged }); return merged;
      } finally { clearTimeout(timeout); controllers.delete(controller); }
    }
    async function cycle() {
      try {
        if (!navigator.locks) { setError("Technical monitoring needs a browser with Web Locks support. Update your browser or Android WebView."); return; }
        // Only one tab polls this account. UI writes use a separate, short transaction lock.
        await navigator.locks.request(`${key}:monitor`, { ifAvailable: true }, async lock => {
          if (!lock || stopped) return;
          await navigator.locks.request(key, () => {
            if (stopped) return;
            const latest = read(), now = Date.now(), expired = latest.rules.filter(r => ["active", "paused"].includes(r.status) && r.expiresAt <= now);
            if (expired.length) write({ ...latest, rules: latest.rules.map(r => expired.some(e => e.id === r.id) ? { ...r, status: "expired" } : r), events: [...expired.map(r => ({ id: `expired:${r.id}:${r.revision}`, ruleId: r.id, instrument: r.instrument, timeframe: r.timeframe, description: technicalDescription(r), barTime: 0, createdAt: now, price: 0, detail: "Monitoring period ended", kind: "expired" as const })), ...latest.events].slice(0, 200) });
          });
          const rules = read().rules.filter(r => r.status === "active" && r.delivery !== "server");
          const now = new Date(Date.now() + 19800000), minute = now.getUTCHours() * 60 + now.getUTCMinutes();
          const closeGrace = now.getUTCDay() > 0 && now.getUTCDay() < 6 && minute >= 930 && minute < 934;
          if (document.hidden || !navigator.onLine || (!current.current.marketOpen && !closeGrace)) {
            const state = document.hidden ? "Waiting · app not visible" : !navigator.onLine ? "Waiting · offline" : "Waiting for market session";
            setStates(Object.fromEntries(rules.map(r => [r.id, state]))); return;
          }
          const groups = new Map<string, TechnicalRule[]>();
          for (const rule of rules) { const g = technicalGroup(rule); groups.set(g, [...(groups.get(g) ?? []), rule]); }
          const daily = new Map<string, Promise<Candle[]>>();
          for (const group of [...groups.values()].slice(0, 6)) {
            if (stopped) return;
            if (!technicalCheckDue(group[0].timeframe, Date.now())) { setStates(previous => ({ ...previous, ...Object.fromEntries(group.map(r => [r.id, `Waiting for ${r.timeframe} candle close`])) })); continue; }
            try {
              const first = group[0], history = await candles(first.instrument.instrumentKey, first.timeframe);
              let prior: Candle[] = [];
              if (group.some(r => r.family === "previousDay")) {
                if (first.timeframe === "1D") prior = history;
                else { if (!daily.has(first.instrument.instrumentKey)) daily.set(first.instrument.instrumentKey, candles(first.instrument.instrumentKey, "1D")); prior = await daily.get(first.instrument.instrumentKey)!; }
              }
              if (stopped) return;
              const evaluations = group.map(rule => ({ rule, result: evaluateTechnical(rule, history, prior, Date.now()) }));
              setStates(previous => ({ ...previous, ...Object.fromEntries(evaluations.map(e => [e.rule.id, e.result.state])) }));
              const deliveries: TechnicalEvent[] = [];
              await navigator.locks.request(key, () => {
                if (stopped || document.hidden || !navigator.onLine) return;
                const latest = read(); let changed = false;
                const updated = latest.rules.map(rule => {
                  const evaluation = evaluations.find(e => e.rule.id === rule.id && e.rule.revision === rule.revision);
                  if (!evaluation) return rule;
                  const next = advanceTechnical(rule, evaluation.result, Date.now());
                  if (next.rule !== rule) changed = true;
                  if (next.event && !latest.events.some(e => e.id === next.event!.id)) deliveries.push(next.event);
                  return next.rule;
                });
                if (changed) write({ ...latest, rules: updated, events: [...deliveries, ...latest.events].slice(0, 200) });
              });
              for (const event of deliveries) {
                const body = `${event.instrument.symbol} · ${event.timeframe} · ${event.description} · close ₹${event.price.toFixed(2)}`;
                try { addPaperTradeNotification({ id: event.id, kind: "trade", title: "Technical alert · confirmed close", body, symbol: event.instrument.symbol, instrumentKey: event.instrument.instrumentKey, timeframe: event.timeframe, instrument: event.instrument }); } catch { /* The durable alert log remains available if notification storage fails. */ }
                current.current.onNotice(body);
              }
            } catch (e) { if (!stopped) setStates(previous => ({ ...previous, ...Object.fromEntries(group.map(r => [r.id, e instanceof Error ? e.message : "Waiting for candle data"])) })); }
          }
        });
      } catch { if (!stopped) setError("Technical monitoring paused: saved data or storage unavailable. Retrying automatically."); }
      finally { if (!stopped) timer = setTimeout(cycle, 30000); }
    }
    void cycle();
    return () => { stopped = true; clearTimeout(timer); controllers.forEach(c => c.abort()); window.removeEventListener("storage", storage); };
  }, [key]); // The monitor outlives chart navigation; callbacks are read through a ref.
  return { rules: [...cloud.rules, ...store.rules], events: [...cloud.events, ...store.events].sort((a, b) => b.createdAt - a.createdAt), states: { ...states, ...Object.fromEntries(cloud.rules.map(r => [r.id, cloud.message])) }, error, save, toggle, remove, cloudReady: cloud.ready, cloudMessage: cloud.message, enablePush: cloud.enablePush };
}
