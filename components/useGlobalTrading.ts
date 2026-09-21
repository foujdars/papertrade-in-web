"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceGlobalAccount, readGlobalAccount } from "@/lib/global-order-engine";
import { advanceOptions, type OptionObservation, type OptionSnapshot } from "@/lib/global-option-orders";
import type { PerpAccount, PerpQuote, PerpSpec, PerpSymbol } from "@/lib/global-markets";

export type GlobalSnapshot = { quote: PerpQuote; spec: PerpSpec };
export function useGlobalTrading(owner: string, selected: PerpSymbol | null, selectedOption: string | null = null) {
  const key = `papertrade-perpetual-wallet-v1:${owner}`;
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<PerpSymbol, GlobalSnapshot>>>({});
  const [optionSnapshots, setOptionSnapshots] = useState<Record<string, OptionSnapshot>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const activeKey = useRef("");
  const snapshotsRef = useRef(snapshots);
  const optionSnapshotsRef = useRef(optionSnapshots);
  const inFlight = useRef(false);
  useEffect(() => {
    activeKey.current = key;
    setAccount(null); setError(""); setBusy(false);
    const load = async () => {
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
    setClock(Date.now());
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
    ...(account?.positions.map(position => position.symbol) ?? []),
    ...(account?.orders.map(order => order.symbol) ?? []),
    ...(account?.optionPositions?.map(position => position.symbol) ?? []),
    ...(account?.optionOrders?.map(order => order.symbol) ?? []),
  ].filter((symbol): symbol is string => !!symbol))].sort().join(","), [selected, selectedOption, account?.positions, account?.orders, account?.optionPositions, account?.optionOrders]);
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
          const r = await fetch(`/api/global-markets?symbol=${symbol}`, { cache: "no-store", signal: controller.signal });
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
        if (controller.signal.aborted) return;
        if (results.every(r => r.status === "rejected")) return; // Existing timestamps expire and disable orders.
        snapshotsRef.current = { ...snapshotsRef.current, ...next };
        setSnapshots(snapshotsRef.current);
        optionSnapshotsRef.current = { ...optionSnapshotsRef.current, ...nextOptions };
        setOptionSnapshots(optionSnapshotsRef.current);
        const quotes: Partial<Record<PerpSymbol, PerpQuote>> = {};
        const specs: Partial<Record<PerpSymbol, PerpSpec>> = {};
        for (const [symbol, snapshot] of Object.entries(next)) {
          if (snapshot) { quotes[symbol] = snapshot.quote; specs[symbol] = snapshot.spec; }
        }
        await transact(a => advanceOptions(advanceGlobalAccount(a, quotes, specs, Date.now()), observedOptions, Date.now()), true);
      } finally { running = false; }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [monitorSymbols, transact]);
  return { account, snapshots, optionSnapshots, clock, busy, error, transact };
}
export type GlobalTrading = ReturnType<typeof useGlobalTrading>;
