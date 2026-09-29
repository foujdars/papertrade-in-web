"use client";

import { useEffect } from "react";
import { playPaperTradeTone } from "@/lib/papertrade-tone";

/** Play the PaperTrade tu when a push arrives in an open tab, where the browser hides its own sound. */
export function PaperTradeToneListener() {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "papertrade-push" || event.data?.type === "papertrade-tone") void playPaperTradeTone();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);
  return null;
}
