"use client";
import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

/** Also protects installed older Android shells as they load the updated website. */
export function NativeViewportGuard() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    // Android's default follows the device theme, which can differ from the
    // dashboard theme. DARK means a dark background with light system icons.
    let appliedStyle: SystemBarsStyle | undefined;
    const syncSystemBars = () => {
      const dark = document.querySelector('.terminal-shell')?.getAttribute('data-theme') === 'neon';
      const style = dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
      if (appliedStyle === style) return;
      appliedStyle = style;
      void SystemBars.setStyle({ style }).catch(() => { appliedStyle = undefined; });
      void SystemBars.show().catch(() => { /* Older shells may lack this API. */ });
    };
    const themeObserver = new MutationObserver(syncSystemBars);
    themeObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme'] });
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      appliedStyle = undefined;
      syncSystemBars();
    };
    document.addEventListener('visibilitychange', onResume);
    syncSystemBars();
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const original = viewport?.content;
    if (viewport) viewport.content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
    const preventPagePinch = (event: TouchEvent) => {
      // Canvas chart pinch is its own data-scale gesture, not page zoom.
      if (event.touches.length > 1 && !(event.target instanceof Element && event.target.closest(".lightweight-chart"))) event.preventDefault();
    };
    document.addEventListener("touchmove", preventPagePinch, { passive: false });
    return () => { themeObserver.disconnect(); document.removeEventListener('visibilitychange', onResume); if (viewport && original !== undefined) viewport.content = original; document.removeEventListener("touchmove", preventPagePinch); };
  }, []);
  return null;
}
