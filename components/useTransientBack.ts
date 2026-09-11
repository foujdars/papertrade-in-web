"use client";
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export const TRANSIENT_BACK_EVENT = "papertrade:dismiss-layer";
const layers: string[] = [];
let returningFromDismiss = false;
/** A transient screen consumes one Back action without leaving its parent. */
export function useTransientBack(open: boolean, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!open) return;
    const token = `layer-${Date.now()}-${Math.random()}`;
    const native = Capacitor.isNativePlatform();
    layers.push(token);
    let disposed = false;
    // Delay the entry so React's development setup/cleanup probe cannot leave a ghost entry.
    queueMicrotask(() => { if (!native && !disposed) window.history.pushState({ ...window.history.state, papertradeLayer: token }, ""); });
    const back = (event: Event) => {
      if (layers.at(-1) !== token) return;
      event.preventDefault(); event.stopImmediatePropagation(); dismiss.current();
    };
    const pop = (event: PopStateEvent) => {
      if (returningFromDismiss) return;
      back(event);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) back(event); };
    window.addEventListener(TRANSIENT_BACK_EVENT, back);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("keydown", key);
    return () => {
      disposed = true;
      window.removeEventListener(TRANSIENT_BACK_EVENT, back);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("keydown", key);
      layers.splice(layers.indexOf(token), 1);
      if (!native && window.history.state?.papertradeLayer === token) {
        returningFromDismiss = true;
        const swallow = (event: PopStateEvent) => { returningFromDismiss = false; event.stopImmediatePropagation(); };
        window.addEventListener("popstate", swallow, { capture: true, once: true });
        window.history.back();
      }
    };
  }, [open]);
}
