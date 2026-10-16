"use client";

import { useEffect } from "react";

/** Carry the existing terminal preference to welcome, legal pages and body portals. */
export function DocumentTheme() {
  useEffect(() => {
    const sync = () => {
      const terminal = document.querySelector<HTMLElement>(".terminal-shell[data-theme]");
      let theme = terminal?.dataset.theme;
      if (!theme) {
        try { theme = localStorage.getItem("papertrade-theme") ?? "light"; }
        catch { theme = "light"; }
      }
      const next = theme === "neon" ? "neon" : "light";
      if (document.documentElement.dataset.appTheme !== next) document.documentElement.dataset.appTheme = next;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-theme"] });
    const onStorage = (event: StorageEvent) => { if (event.key === "papertrade-theme") sync(); };
    window.addEventListener("storage", onStorage);
    return () => { observer.disconnect(); window.removeEventListener("storage", onStorage); };
  }, []);
  return null;
}
