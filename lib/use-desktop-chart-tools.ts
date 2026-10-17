"use client";
import { useSyncExternalStore, type RefObject } from 'react';

export function desktopChartHost(host?:HTMLElement|null) {
  return host?.closest('.terminal-shell,.advanced-terminal') ?? document.querySelector('.terminal-shell,.advanced-terminal');
}
const subscribe=()=>()=>{};
/** Shared chart tools are available on web, touch devices and native shells.
 * Keep the exported name and storage keys for existing chart integrations. */
export function useDesktopChartTools(_host?:RefObject<HTMLElement|null>) {
  void _host;
  return useSyncExternalStore(subscribe,()=>true,()=>false);
}
