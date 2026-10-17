"use client";
import { useSyncExternalStore } from 'react';
const QUERY='(max-width: 940px), (pointer: coarse)';
function subscribe(callback:()=>void){const media=window.matchMedia(QUERY);media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);}
/** Layout choice only: both editors run the same Pine compiler and sandbox. */
export function useTouchChart(){return useSyncExternalStore(subscribe,()=>window.matchMedia(QUERY).matches,()=>true);}
