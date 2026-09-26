"use client";
import { useEffect, useRef } from 'react';
import { hasTransientBackLayer } from './useTransientBack';

/** Real browser entries for the Watchlist journey, also used by Android Back. */
export function useWatchlistHistory<T>(restore: (snapshot: T) => void) {
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const entries = useRef<string[]>([]);
  const busy = useRef(false);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (hasTransientBackLayer()) return;
      busy.current = false;
      const saved = event.state?.papertradeWatchlistReturn as { id: string; snapshot: T } | undefined;
      const index = saved ? entries.current.indexOf(saved.id) : -1;
      // Search layers and chart-symbol history can leave intermediate entries
      // with no destination. Cross those in the same Back action, not a blank
      // extra tap or the dashboard's unrelated chart-restoration handler.
      if (!saved || index < 0) {
        if (entries.current.length) {
          event.stopImmediatePropagation(); busy.current = true; window.history.back();
        }
        return;
      }
      entries.current = entries.current.slice(0, index);
      event.stopImmediatePropagation();
      restoreRef.current(saved.snapshot);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return {
    remember(snapshot: T) {
      const id = crypto.randomUUID();
      entries.current.push(id);
      const { papertradeLayer: _layer, ...state } = window.history.state ?? {};
      window.history.replaceState({ ...state, papertradeWatchlistReturn: { id, snapshot } }, '');
      window.history.pushState({ ...state, papertradeWatchlistReturn: null }, '');
    },
    back() {
      if (!entries.current.length) return false;
      if (!busy.current) { busy.current = true; window.history.back(); }
      return true;
    },
    clear() { entries.current = []; busy.current = false; },
  };
}
