"use client";
import { useEffect, useState } from "react";
import type { NseSession } from "@/lib/market-hours";

export function useExchangeSessions(exchangeList: string) {
  const [sessions, setSessions] = useState<Record<string, NseSession | null>>({});
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const entries = await Promise.all(exchangeList.split(",").map(async exchange => {
          try {
            const path = exchange === "NSE" ? "/api/market/session" : "/api/market/session?exchange=" + encodeURIComponent(exchange);
            const response = await fetch(path, {cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12_000)])});
            const payload = await response.json();
            if (!response.ok || !Array.isArray(payload.session?.sessions)) throw new Error("No exchange session");
            return [exchange,payload.session as NseSession] as const;
          } catch { return [exchange,null] as const; }
        }));
        if (!controller.signal.aborted) setSessions(Object.fromEntries(entries));
      } finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [exchangeList]);
  return sessions;
}

export function useNseSession(exchange: "NSE" | "BSE" | "MCX" = "NSE") {
  return useExchangeSessions(exchange)[exchange] ?? null;
}
