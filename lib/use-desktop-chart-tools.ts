"use client";
import { useEffect, useState, type RefObject } from 'react';
import { Capacitor } from '@capacitor/core';
import { DESKTOP_CHART_MEDIA } from './desktop-chart-theme';

export function desktopChartHost(host?:HTMLElement|null) {
  return host?.closest('.terminal-shell,.advanced-terminal') ?? document.querySelector('.terminal-shell,.advanced-terminal');
}
/** A browser viewport alone must never opt a native tablet into desktop tools. */
export function useDesktopChartTools(host?:RefObject<HTMLElement|null>) {
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    const media=window.matchMedia(DESKTOP_CHART_MEDIA),shell=desktopChartHost(host?.current);
    const update=()=>setEnabled(media.matches&&shell?.getAttribute('data-platform')==='web'&&!Capacitor.isNativePlatform());
    update();media.addEventListener('change',update);
    const observer=new MutationObserver(update);
    if(shell)observer.observe(shell,{attributes:true,attributeFilter:['data-platform']});
    return()=>{media.removeEventListener('change',update);observer.disconnect();};
  },[host]);
  return enabled;
}
