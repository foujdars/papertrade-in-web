"use client";
import { useEffect, useMemo, useRef } from 'react';
import { ensureBackHandling, afterBackSettles, hasTransientBackLayer, pushNavigationState } from '@/lib/back-layers';
type Entry<T> = { index: number; snapshot: T };
/** Browser and Android use the same screen snapshots, including Forward. */
export function useNavigationHistory<T>(restore: (snapshot: T) => void) {
  const restoreRef = useRef(restore), busy = useRef(false), transaction = useRef(false);
  useEffect(() => { restoreRef.current = restore; }, [restore]);
  useEffect(() => {
    ensureBackHandling();
    const pop = (event: PopStateEvent) => {
      if (hasTransientBackLayer() || event.defaultPrevented) return;
      busy.current = false;
      const entry = event.state?.papertradeNavigation as Entry<T> | undefined;
      if (!entry) return;
      event.stopImmediatePropagation();
      restoreRef.current(entry.snapshot);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return useMemo(() => ({
    update(snapshot: T, root?: T) {
      afterBackSettles(() => {
        const state = window.history.state ?? {};
        const entry = state.papertradeNavigation as Entry<T> | undefined;
        const index = entry?.index ?? 0;
        if (root && index === 0) {
          window.history.replaceState({ ...state, papertradeNavigation: { index: 0, snapshot: root } }, '');
          pushNavigationState({ ...state, papertradeNavigation: { index: 1, snapshot } });
        } else window.history.replaceState({ ...state, papertradeNavigation: { index, snapshot } }, '');
      });
    },
    remember(snapshot: T) {
      // A tab change followed by selecting its chart is one user journey.
      if (transaction.current) return;
      transaction.current = true; queueMicrotask(() => { transaction.current = false; });
      afterBackSettles(() => {
        const state = window.history.state ?? {}, index = state.papertradeNavigation?.index ?? 0;
        window.history.replaceState({ ...state, papertradeNavigation: { index, snapshot } }, '');
        pushNavigationState({ ...state, papertradeNavigation: { index: index + 1, snapshot } });
      });
    },
    back() {
      if (!(window.history.state?.papertradeNavigation?.index > 0)) return false;
      if (!busy.current) { busy.current = true; window.history.back(); }
      return true;
    },
  }), []);
}
