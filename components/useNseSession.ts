"use client";
import { useEffect, useState } from "react";
import type { NseSession } from "@/lib/market-hours";

export function useNseSession(exchange: "NSE" | "MCX" = "NSE") {
  const [session, setSession] = useState<NseSession | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const response = await fetch(exchange === "NSE" ? "/api/market/session" : "/api/market/session?exchange=MCX", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        const payload = await response.json();
        if (!response.ok || !payload.session || !Array.isArray(payload.session.sessions)) throw new Error("No exchange session");
        if (!controller.signal.aborted) setSession(payload.session);
      } catch { if (!controller.signal.aborted) setSession(null); }
      finally { pending = false; }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { controller.abort(); window.clearInterval(interval); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [exchange]);
  return session;
}
