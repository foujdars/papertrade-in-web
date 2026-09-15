import type { VolumeCandle } from "./volume-profile.ts";
export type ProfileData = { candles: VolumeCandle[]; label: string };
/** A chart-owned, debounced cache: moving an anchor cannot flood the quote API. */
export function createProfileDataClient(instrumentKey: string, refresh: () => void) {
  const entries=new Map<string,{value:ProfileData;expires:number;timer?:ReturnType<typeof setTimeout>}>();
  const controllers=new Set<AbortController>();
  const lanes=new Map<string,string>();
  let disposed=false;
  return {
    read(from:number,to:number,lane="default"):ProfileData {
      const key=`${Math.floor(from)}:${Math.floor(to)}`,existing=entries.get(key);
      const previous=lanes.get(lane);
      lanes.set(lane,key);
      if(previous&&previous!==key&&![...lanes.values()].includes(previous)) {
        const pending=entries.get(previous);
        if(pending?.timer){clearTimeout(pending.timer);entries.delete(previous);}
      }
      if(existing&&existing.expires>Date.now())return existing.value;
      const entry={value:existing?.value??{candles:[],label:"Loading intraday volume…"},expires:Infinity,timer:undefined as ReturnType<typeof setTimeout>|undefined};
      entries.set(key,entry);
      if(entries.size>24){const oldest=entries.keys().next().value!;clearTimeout(entries.get(oldest)?.timer);entries.delete(oldest);}
      entry.timer=setTimeout(async()=>{
        entry.timer=undefined;
        if(disposed)return;
        const controller=new AbortController();controllers.add(controller);
        try {
          const query=new URLSearchParams({instrumentKey,from:String(Math.floor(from)),to:String(Math.floor(to))});
          const response=await fetch(`/api/upstox/volume-profile?${query}`,{signal:controller.signal});
          const data=await response.json();
          if(!response.ok||!data.ok)throw new Error(data.error?.message??"Intraday volume unavailable");
          entry.value={candles:data.candles,label:`${data.intervalMinutes}m volume · estimated distribution`};entry.expires=Date.now()+60000;
        } catch(error) {entry.value={candles:[],label:error instanceof Error?error.message:"Intraday volume unavailable"};entry.expires=Date.now()+60000;}
        finally{controllers.delete(controller);if(!disposed)refresh();}
      },400);
      return entry.value;
    },
    dispose(){disposed=true;for(const entry of entries.values())clearTimeout(entry.timer);for(const controller of controllers)controller.abort();entries.clear();lanes.clear();},
  };
}
