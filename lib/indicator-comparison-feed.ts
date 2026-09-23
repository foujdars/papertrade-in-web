"use client";
import {useEffect,useState} from 'react';
import type {Candle} from './market';
import {comparisonRequest} from './chart-compare';
import type { ChartHistoryRequest } from './chart-history';
export function useComparisonCandles(keys:string[],timeframe:string,history?:ChartHistoryRequest){
 const suffix=history?.years?`&years=${history.years}`:history?.date?`&date=${encodeURIComponent(history.date)}`:'';
 const key=JSON.stringify([...new Set(keys)].sort()),scope=timeframe+key+suffix;
 const [state,setState]=useState<{scope:string;data:Record<string,Candle[]>}>({scope:'',data:{}});
 useEffect(()=>{
  const requested=JSON.parse(key) as string[];let disposed=false,running=false;const controllers=new Set<AbortController>();
  async function refresh(){if(disposed||running||document.hidden||!requested.length)return;running=true;
   const entries=await Promise.all(requested.map(async instrumentKey=>{const controller=new AbortController();controllers.add(controller);const timer=window.setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch(comparisonRequest(instrumentKey,timeframe)+suffix,{cache:'no-store',signal:controller.signal}),body=await response.json();if(!response.ok||!body.ok||!Array.isArray(body.candles))throw Error('No comparison data');
     const candles=(body.candles as Candle[]).filter(b=>[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.close>0&&b.high>=Math.max(b.low,b.open,b.close)&&b.low<=Math.min(b.open,b.close));
     return [instrumentKey,Array.from(new Map(candles.map(b=>[b.time,b])).values()).sort((a,b)=>a.time-b.time)] as const;
    }catch{return [instrumentKey,[]] as const;}finally{window.clearTimeout(timer);controllers.delete(controller);}
   }));if(!disposed)setState({scope,data:Object.fromEntries(entries)});running=false;
  }
  void refresh();const timer=window.setInterval(()=>void refresh(),60000),resume=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',resume);
  return()=>{disposed=true;window.clearInterval(timer);controllers.forEach(c=>c.abort());document.removeEventListener('visibilitychange',resume);};
 },[key,timeframe,scope,suffix]);
 return state.scope===scope?state.data:EMPTY;
}
const EMPTY:Record<string,Candle[]>={};
