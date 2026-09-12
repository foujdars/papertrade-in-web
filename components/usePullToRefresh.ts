"use client";
import { useEffect, useRef, type RefObject } from "react";

export const PULL_REFRESH_THRESHOLD = 58;
export function pullResistance(distance: number) { return 86 * (1 - Math.exp(-Math.max(0, distance) / 140)); }

/** Move one composited layer; never rerender every stock or resize a grid on touchmove. */
export function usePullToRefresh(container: RefObject<HTMLElement | null>, stage: RefObject<HTMLDivElement | null>, disabled: boolean, refresh: () => Promise<void>) {
  const latest = useRef({ disabled, refresh });
  useEffect(() => { latest.current = { disabled, refresh }; }, [disabled, refresh]);
  useEffect(() => {
    const host = container.current, layer = stage.current;
    if (!host || !layer) return;
    let origin: { x: number; y: number } | null = null, distance = 0, frame = 0, refreshing = false, disposed = false;
    const paint = () => {
      frame = 0;
      layer.style.setProperty("--pull-distance", `${distance.toFixed(2)}px`);
      layer.dataset.pull = refreshing ? "refreshing" : distance >= PULL_REFRESH_THRESHOLD ? "ready" : distance > 0 ? "pulling" : "idle";
    };
    const draw = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const reset = () => { origin = null; distance = 0; layer.dataset.dragging = "false"; draw(); };
    const start = (event: TouchEvent) => {
      if (refreshing || latest.current.disabled || host.scrollTop > 0 || event.touches.length !== 1 || (event.target as HTMLElement).closest(".trend-tabs, .market-section-tabs, input, select")) return;
      origin = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!origin) return;
      if (event.touches.length !== 1 || host.scrollTop > 0) { reset(); return; }
      const dx = event.touches[0].clientX - origin.x, dy = event.touches[0].clientY - origin.y;
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) { reset(); return; }
      if (dy < 6) return;
      if (event.cancelable) event.preventDefault();
      layer.dataset.dragging = "true";
      distance = pullResistance(dy); draw();
    };
    const end = () => {
      if (!origin) return;
      const ready = distance >= PULL_REFRESH_THRESHOLD;
      origin = null; layer.dataset.dragging = "false";
      if (!ready) { reset(); return; }
      refreshing = true; distance = 42; draw();
      void latest.current.refresh().catch(() => undefined).finally(() => { if (!disposed) { refreshing = false; reset(); } });
    };
    host.addEventListener("touchstart", start, { passive: true });
    host.addEventListener("touchmove", move, { passive: false });
    host.addEventListener("touchend", end);
    host.addEventListener("touchcancel", reset);
    return () => { disposed = true; cancelAnimationFrame(frame); host.removeEventListener("touchstart", start); host.removeEventListener("touchmove", move); host.removeEventListener("touchend", end); host.removeEventListener("touchcancel", reset); };
  }, [container, stage]);
}
