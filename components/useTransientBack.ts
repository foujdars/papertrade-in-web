"use client";
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { ensureBackHandling, registerBackLayer } from '@/lib/back-layers';
export { TRANSIENT_BACK_EVENT, hasTransientBackLayer } from '@/lib/back-layers';
/** Close exactly the topmost popup before any parent screen or chart. */
export function useTransientBack(open: boolean, onDismiss: () => void) {
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    ensureBackHandling();
    if (open) return registerBackLayer(() => dismiss.current(), Capacitor.isNativePlatform());
  }, [open]);
}
