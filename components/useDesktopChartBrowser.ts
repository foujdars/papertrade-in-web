"use client";
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { DESKTOP_CHART_MEDIA } from '@/lib/desktop-chart-theme';

function subscribe(changed: () => void) {
  const media = window.matchMedia(DESKTOP_CHART_MEDIA);
  media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
}
export function useDesktopChartBrowser() {
  return useSyncExternalStore(subscribe, () => Capacitor.getPlatform() === 'web' && window.matchMedia(DESKTOP_CHART_MEDIA).matches, () => false);
}
