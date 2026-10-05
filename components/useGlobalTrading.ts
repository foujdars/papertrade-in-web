"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceGlobalAccount, readGlobalAccount, type ChartExtreme } from "@/lib/global-order-engine";
import { advanceOptions, type OptionObservation, type OptionSnapshot } from "@/lib/global-option-orders";
import { advancePaperBots, type BotObservation } from "@/lib/paper-bot-engine";
import { BOT_ASSETS, botFrames, botScope, type BotFrame } from "@/lib/paper-bot-state";
import type { PerpAccount, PerpQuote, PerpSpec, PerpSymbol } from "@/lib/global-markets";

export type GlobalSnapshot = { quote: PerpQuote; spec: PerpSpec };
export function useGlobalTrading(owner: string, selected: PerpSymbol | null, selectedOption: string | null = null, botVisible = false) {
  const key = `papertrade-perpetual-wallet-v1:${owner}`;
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<PerpSymbol, GlobalSnapshot>>>({});
  const [optionSnapshots, setOptionSnapshots] = useState<Record<string, OptionSnapshot>>({});
  const [error, setError] = useState("");
  const [marketError, setMarketError] = useState("");
  const [lastChecked, setLastChecked] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const observationsRef = useRef<Record<string, BotObservation>>({});
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const activeKey = useRef("");
  const snapshotsRef = useRef(snapshots);
  const optionSnapshotsRef = useRef(optionSnapshots);
  const inFlight = useRef(false);
  const extremesRef = useRef<Partial<Record<string, ChartExtreme>>>({});
  const noteCandle = useCallback((symbol: string, candle: ChartExtreme | null | undefined) => {
    if (!symbol || !candle || !(candle.time > 0) || !(candle.high > 0) || !(candle.low > 0) || candle.high < candle.low) return;
    const prev = extremesRef.current[symbol];
    if (prev && prev.time === candle.time && prev.high === candle.high && prev.low === candle.low && prev.frame === candle.frame) return;
    extremesRef.current = { ...extremesRef.current, [symbol]: { time: candle.time, high: candle.high, low: candle.low, frame: candle.frame } };
  }, []);
  useEffect(() => {
    activeKey.current = key;
    const load = async () => {
      await Promise.resolve();
      if (activeKey.current !== key) return;
      setAccount(null); setError(""); setMarketError(""); setLastChecked(0); setBusy(false); setClock(Date.now());
      snapshotsRef.current = {}; optionSnapshotsRef.current = {};
      setSnapshots({}); setOptionSnapshots({});
      try {
        if (!navigator.locks) throw new Error("This WebView cannot safely save orders. Update Android System WebView.");
        await navigator.locks.request(key, () => {
          if (activeKey.current !== key) return;
          const a = readGlobalAccount(localStorage.getItem(key));
          localStorage.setItem(key, JSON.stringify(a));
          setAccount(a);
        });
      } catch (e) { if (activeKey.current === key) setError(e instanceof Error ? e.message : "Global wallet could not load."); }
    };
    void load();
    const storage = (e: StorageEvent) => {
      if (e.key !== key) return;
      try { setAccount(readGlobalAccount(e.newValue)); } catch { setAccount(null); setError("Global wallet is unreadable. Saved data has been preserved."); }
    };
    window.addEventListener("storage", storage);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { activeKey.current = ""; window.clearInterval(timer); window.removeEventListener("storage", storage); };
  }, [key]);
  const transact = useCallback(async (fn: (a: PerpAccount, data: Partial<Record<PerpSymbol, GlobalSnapshot>>, options: Record<string, OptionSnapshot>) => PerpAccount, quiet = false) => {
    if (!quiet && inFlight.current) return false;
    if (!quiet) { inFlight.current = true; setBusy(true); }
    try {
      if (!navigator.locks) throw new Error("Safe order storage is unavailable.");
      return await navigator.locks.request(key, () => {
        if (activeKey.current !== key) return false;
        const current = readGlobalAccount(localStorage.getItem(key));
        const next = fn(current, snapshotsRef.current, optionSnapshotsRef.current);
        localStorage.setItem(key, JSON.stringify(next));
        setAccount(next);
        if (!quiet) setError("");
        return true;
      });
    } catch (e) { if (activeKey.current === key) setError(e instanceof Error ? e.message : "Could not save this action."); return false; }
    finally { if (!quiet) { inFlight.current = false; if (activeKey.current === key) setBusy(false); } }
  }, [key]);
  const monitorSymbols = useMemo(() => [...new Set([
    selected,
    selectedOption,
    ...(botVisible ? Object.keys(BOT_ASSETS) : []),
    ...(account?.bots?.filter(bot => bot.enabled).map(bot => bot.symbol) ?? []),
    ...(account?.positions.map(position => position.symbol) ?? []),
    ...(account?.orders.map(order => order.symbol) ?? []),
    ...(account?.optionPositions?.map(position => position.symbol) ?? []),
    ...(account?.optionOrders?.map(order => order.symbol) ?? []),
  ].filter((symbol): symbol is string => !!symbol))].sort().join(","), [selected, selectedOption, botVisible, account?.bots, account?.positions, account?.orders, account?.optionPositions, account?.optionOrders]);
  const botScopes = (account?.bots ?? []).filter(b => b.enabled).flatMap(b => [...botFrames(b), ...(b.trendTimeframe && b.trendTimeframe !== "off" ? [b.trendTimeframe] : [])].map(frame => `${b.symbol}:${frame}:${b.startedAt}`)).join(",");
  // Candle history must never hold up live quotes or protective exits.
  useEffect(() => {
    observationsRef.current = {};
    if (!botScopes) return;
    const controller = new AbortController();
    let running = false;
    const pollHistory = async () => {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      try {
        const observations: Record<string, BotObservation> = {};
        await Promise.allSettled(botScopes.split(",").map(async scope => {
          const [symbol, frame] = scope.split(":") as [string, BotFrame];
          const key = botScope(symbol, frame);
          try {
            const response = await fetch(`/api/global-markets?mode=candles&symbol=${symbol}&timeframe=${frame}`, {
              cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
            });
            const history = await response.json();
            if (!response.ok || !history.ok || !Array.isArray(history.candles)) throw new Error("History unavailable");
            if (!controller.signal.aborted && !document.hidden) observations[key] = { candles: history.candles, fetchedAt: history.fetchedAt };
          } catch { /* A failed timeframe never borrows another history. */ }
        }));
        if (!controller.signal.aborted && !document.hidden) observationsRef.current = observations;
      } finally { running = false; }
    };
    void pollHistory();
    const timer = window.setInterval(() => void pollHistory(), 10000);
    document.addEventListener("visibilitychange", pollHistory);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", pollHistory); };
  }, [botScopes, key, refreshTick]);
  useEffect(() => {
    if (!monitorSymbols) return;
    const controller = new AbortController();
    let running = false;
    const poll = async () => {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      try {
        const next: Partial<Record<PerpSymbol, GlobalSnapshot>> = {};
        const nextOptions: Record<string, OptionSnapshot> = {};
        const observedOptions: Record<string, OptionObservation> = {};
        const results = await Promise.allSettled(monitorSymbols.split(",").map(async symbol => {
          const r = await fetch(`/api/global-markets?symbol=${symbol}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
          const data = await r.json();
          if (!r.ok || !data.ok) throw new Error(data.error ?? "Delta market data unavailable.");
          if (data.kind === "option") {
            if (typeof data.settlement === "number") { observedOptions[symbol] = { settlement: data.settlement }; return; }
            if (data.spec?.symbol !== symbol || data.quote?.symbol !== symbol) throw new Error("Delta option quote unavailable.");
            nextOptions[symbol] = { spec: data.spec, quote: data.quote };
            observedOptions[symbol] = { snapshot: nextOptions[symbol] };
          } else {
            if (data.spec?.symbol !== symbol || data.quote?.symbol !== symbol) throw new Error("Delta perpetual quote unavailable.");
            next[symbol] = { spec: data.spec, quote: data.quote };

          }
        }));
        if (controller.signal.aborted || document.hidden) return;
        setMarketError(results.some(r => r.status === "rejected") ? "Some live prices are unavailable. Retrying automatically." : "");
        if (results.every(r => r.status === "rejected")) return; // Stale quotes cannot fill orders.
        setLastChecked(Date.now());
        snapshotsRef.current = { ...snapshotsRef.current, ...next };
        setSnapshots(snapshotsRef.current);
        optionSnapshotsRef.current = { ...optionSnapshotsRef.current, ...nextOptions };
        setOptionSnapshots(optionSnapshotsRef.current);
        const quotes: Partial<Record<PerpSymbol, PerpQuote>> = {};
        const specs: Partial<Record<PerpSymbol, PerpSpec>> = {};
        for (const [symbol, snapshot] of Object.entries(next)) {
          if (snapshot) { quotes[symbol] = snapshot.quote; specs[symbol] = snapshot.spec; }
        }
        await transact(a => {
          if (document.hidden || controller.signal.aborted) return a;
          const now = Date.now();
          const advanced = advanceOptions(advanceGlobalAccount(a, quotes, specs, now, extremesRef.current), observedOptions, now);
          return advancePaperBots(advanced, next, observationsRef.current, now);
        }, true);
      } finally { running = false; }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [monitorSymbols, transact, refreshTick]);
  return { account, snapshots, optionSnapshots, clock, busy, error, marketError, lastChecked, refresh: () => setRefreshTick(tick => tick + 1), transact, noteCandle };
}
export type GlobalTrading = ReturnType<typeof useGlobalTrading>;
