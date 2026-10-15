"use client";
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

const query = '(min-width: 941px)';
function subscribe(changed: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
}
export function useDesktopBrowser() {
  return useSyncExternalStore(subscribe, () => Capacitor.getPlatform() === 'web' && window.matchMedia(query).matches, () => false);
}
