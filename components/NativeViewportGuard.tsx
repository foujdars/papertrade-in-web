"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/** Also protects installed older Android shells as they load the updated website. */
export function NativeViewportGuard() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const original = viewport?.content;
    if (viewport) viewport.content = "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
    const preventPagePinch = (event: TouchEvent) => {
      // Canvas chart pinch is its own data-scale gesture, not page zoom.
      if (event.touches.length > 1 && !(event.target instanceof Element && event.target.closest(".lightweight-chart"))) event.preventDefault();
    };
    document.addEventListener("touchmove", preventPagePinch, { passive: false });
    return () => { if (viewport && original !== undefined) viewport.content = original; document.removeEventListener("touchmove", preventPagePinch); };
  }, []);
  return null;
}
