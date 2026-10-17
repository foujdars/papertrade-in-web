"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { useDesktopBrowser } from './useDesktopBrowser';
import { startVisiblePolling } from '@/lib/visible-polling';
import { loadDesktopHistory } from '@/lib/desktop-history-loader';
import { priceLineGeometry, type PricePoint } from '@/lib/desktop-price-history';
import { MARKET_GREEN, MARKET_RED } from '@/lib/market-colours';

/** Mounts/fetches only on visible desktop-web cards; never renders a simulated path. */
export function DesktopPriceLine({instrumentKey,label,reference,referenceAt}:{instrumentKey?:string;label:string;reference?:number;referenceAt?:string}){
 const desktop=useDesktopBrowser(),host=useRef<HTMLSpanElement>(null),id=useId();
 const [visible,setVisible]=useState(false),[points,setPoints]=useState<PricePoint[]>([]),[failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!desktop||!host.current)return;
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{rootMargin:'60px'});
  observer.observe(host.current);return()=>observer.disconnect();
 },[desktop]);
 useEffect(()=>{
  if(!desktop||!visible||!instrumentKey)return;
  return startVisiblePolling(async signal=>{
   const next=await loadDesktopHistory(instrumentKey);
   if(!signal.aborted){setPoints(next);setFailed(false);}
  },60000,()=>setFailed(true));
 },[desktop,visible,instrumentKey]);
 if(!desktop)return null;
 const last=points.at(-1);
 const referenceTime=referenceAt?Date.parse(referenceAt):NaN;
 const day=(time:number)=>new Date(time+19800000).toISOString().slice(0,10);
 const sameSession=Boolean(last&&Number.isFinite(referenceTime)&&day(referenceTime)===day(last.time*1000));
 const geometry=priceLineGeometry(points,sameSession?reference:undefined);
 const basis=sameSession&&reference!=null?'previous close':'first observed close';
 const date=last?new Date(last.time*1000).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 return <span ref={host} className="desktop-price-line" title={geometry?`${label} · observed 5-minute closes · green/red versus ${basis} · latest session ${date} IST${failed?' · refresh unavailable':''}`:undefined}>
 {geometry?<><svg viewBox="0 0 180 54" preserveAspectRatio="none" role="img" aria-label={`${label}: latest-session price history, green above ${basis}, red below. Last candle ${date} IST.`}>
 <defs><clipPath id={`${id}-up`}><rect x="0" y="0" width="180" height={geometry.baselineY}/></clipPath><clipPath id={`${id}-down`}><rect x="0" y={geometry.baselineY} width="180" height={54-geometry.baselineY}/></clipPath></defs>
 <line x1="0" x2="180" y1={geometry.baselineY} y2={geometry.baselineY} stroke="currentColor" strokeOpacity=".25" strokeDasharray="3 3"/>
 {geometry.flat?<path d={geometry.path} stroke="currentColor"/>:<><path d={geometry.path} clipPath={`url(#${id}-up)`} stroke={MARKET_GREEN}/><path d={geometry.path} clipPath={`url(#${id}-down)`} stroke={MARKET_RED}/></>}
 <circle cx={geometry.lastX} cy={geometry.lastY} r="2" fill={geometry.flat?"currentColor":geometry.up?MARKET_GREEN:MARKET_RED}/></svg><small>Latest session · {date}{failed?' · delayed':''}</small></>:<span className="desktop-line-empty">{!instrumentKey||failed?'History unavailable':points.length?'Waiting for more candles':'Loading price history…'}</span>}
 </span>;
}

/** A percentage gauge is appropriate only for figures with a genuine 0–100 scale. */
export function DesktopPercentGauge({value,label,detail,inverse=false,negative=0}:{value:number|null;label:string;detail?:string;inverse?:boolean;negative?:number}){
 const desktop=useDesktopBrowser();if(!desktop)return null;
 const valid=value!==null&&Number.isFinite(value)&&value>=0&&value<=100;
 const p=valid?value!:0;
 return <span className="desktop-percent-gauge"><svg viewBox="0 0 120 76" role="img" aria-label={`${label}: ${valid?p.toFixed(1)+' percent':'unavailable'}${detail?' · '+detail:''}`}>
 <path d="M12 62 A48 48 0 0 1 108 62" className="desktop-gauge-track"/>
 {valid&&<>{negative>0&&negative<=100-p&&<path d="M12 62 A48 48 0 0 1 108 62" pathLength="100" strokeDasharray={`${negative} 100`} strokeDashoffset={-(100-negative)} stroke={MARKET_RED} className="desktop-gauge-value"/>}<path d="M12 62 A48 48 0 0 1 108 62" pathLength="100" strokeDasharray={`${p} 100`} stroke={inverse?MARKET_RED:MARKET_GREEN} className="desktop-gauge-value"/></>}
 <text x="60" y="48" textAnchor="middle">{valid?`${Math.round(p)}%`:'—'}</text></svg><span><b>{label}</b>{detail&&<small>{detail}</small>}</span></span>;
}
