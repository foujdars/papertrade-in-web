"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { advanceGlobalAccount, readGlobalAccount } from "@/lib/global-order-engine";
import type { PerpAccount, PerpQuote, PerpSpec, PerpSymbol } from "@/lib/global-markets";

export type GlobalSnapshot = { quote: PerpQuote; spec: PerpSpec };
export function useGlobalTrading(owner: string, selected: PerpSymbol | null) {
  const key = `papertrade-perpetual-wallet-v1:${owner}`;
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<PerpSymbol, GlobalSnapshot>>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(0);
  const activeKey = useRef("");
  const snapshotsRef = useRef(snapshots);
  const inFlight = useRef(false);
  snapshotsRef.current = snapshots;
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
  const transact = useCallback(async (fn: (a: PerpAccount, data: Partial<Record<PerpSymbol, GlobalSnapshot>>) => PerpAccount, quiet = false) => {
    if (!quiet && inFlight.current) return false;
    if (!quiet) { inFlight.current = true; setBusy(true); }
    try {
      if (!navigator.locks) throw new Error("Safe order storage is unavailable.");
      return await navigator.locks.request(key, () => {
        if (activeKey.current !== key) return false;
        const current = readGlobalAccount(localStorage.getItem(key));
        const next = fn(current, snapshotsRef.current);
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
    ...(account?.positions.map(position => position.symbol) ?? []),
    ...(account?.orders.map(order => order.symbol) ?? []),
  ].filter((symbol): symbol is PerpSymbol => !!symbol))].sort().join(","), [selected, account?.positions, account?.orders]);
  useEffect(() => {
    if (!monitorSymbols) return;
    const controller = new AbortController();
    let running = false;
    const poll = async () => {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      try {
        const next: Partial<Record<PerpSymbol, GlobalSnapshot>> = {};
        const results = await Promise.allSettled(monitorSymbols.split(",").map(async symbol => {
          const r = await fetch(`/api/global-markets?symbol=${symbol}`, { cache: "no-store", signal: controller.signal });
          const data = await r.json();
          if (!r.ok || !data.ok || data.spec?.symbol !== symbol || data.quote?.symbol !== symbol) throw new Error(data.error ?? "Delta market data unavailable.");
          next[symbol] = { spec: data.spec, quote: data.quote };
        }));
        if (controller.signal.aborted) return;
        if (results.every(r => r.status === "rejected")) return; // Existing timestamps expire and disable orders.
        snapshotsRef.current = { ...snapshotsRef.current, ...next };
        setSnapshots(snapshotsRef.current);
        const quotes: Partial<Record<PerpSymbol, PerpQuote>> = {};
        const specs: Partial<Record<PerpSymbol, PerpSpec>> = {};
        for (const [symbol, snapshot] of Object.entries(next)) {
          if (snapshot) { quotes[symbol] = snapshot.quote; specs[symbol] = snapshot.spec; }
        }
        await transact(a => advanceGlobalAccount(a, quotes, specs, Date.now()), true);
      } finally { running = false; }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [monitorSymbols, transact]);
  return { account, snapshots, clock, busy, error, transact };
}
export type GlobalTrading = ReturnType<typeof useGlobalTrading>;
