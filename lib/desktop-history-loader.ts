import { latestSessionPrices, type PricePoint } from './desktop-price-history.ts';
const cache=new Map<string,{until:number;points:PricePoint[]}>();
const pending=new Map<string,Promise<PricePoint[]>>();
let running=0;
const queue:Array<()=>void>=[];
async function slot(){if(running<2){running++;return;}await new Promise<void>(resolve=>queue.push(resolve));}
function release(){const next=queue.shift();if(next)next();else running--;}
/** Small, deduplicated desktop-only consumers share a maximum of two history requests. */
export function loadDesktopHistory(instrumentKey:string):Promise<PricePoint[]>{
 const hit=cache.get(instrumentKey);if(hit&&hit.until>Date.now())return Promise.resolve(hit.points);
 const existing=pending.get(instrumentKey);if(existing)return existing;
 const task=(async()=>{
  await slot();
  try{
   const params=new URLSearchParams({instrumentKey,timeframe:'5m',strict:'1'});
   const response=await fetch(`/api/upstox/candles?${params}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   const body=await response.json();
   const points=response.ok&&body?.ok?latestSessionPrices(body.candles):[];
   if(!points.length)throw new Error('Price history unavailable');
   cache.set(instrumentKey,{until:Date.now()+60000,points});
   if(cache.size>128)cache.delete(cache.keys().next().value!);
   return points;
  }finally{release();}
 })().finally(()=>pending.delete(instrumentKey));
 pending.set(instrumentKey,task);return task;
}
