import type { Candle, Instrument } from './market';
import { comparisonRequest } from './chart-compare.ts';
import type { PineDataRequest } from './pine-sandbox';

const TIMEFRAMES:Record<string,string> = { '1':'1m','2':'2m','3':'3m','5':'5m','10':'10m','15':'15m','30':'30m','60':'1H','120':'2H','180':'3H','240':'4H',D:'1D','1D':'1D',W:'1W','1W':'1W',M:'1M','1M':'1M' };
export function pineFeedTimeframe(value:string):string {
  const result=Object.hasOwn(TIMEFRAMES,value)?TIMEFRAMES[value]:undefined;
  if (!result) throw new Error(`The chart data feed does not supply Pine timeframe ${value}.`);
  return result;
}
export function pineTimeframe(value:string):string {
  return Object.entries(TIMEFRAMES).find(([,app])=>app===value)?.[0] ?? value;
}

/** This host-side callback is the sole network boundary. A script can request
 * validated candle endpoints, never an arbitrary URL or an authenticated action.
 */
export function createPineMarketData(instrument:Instrument, signal:AbortSignal, replay=false) {
  const cache=new Map<string,Promise<Candle[]>>();
  return async (request:PineDataRequest):Promise<Candle[]> => {
    if (!request || typeof request.symbol !== 'string' || typeof request.timeframe !== 'string') throw new Error('Invalid Pine market data request.');
    const aliases=['',instrument.symbol,`${instrument.exchange}:${instrument.symbol}`,instrument.instrumentKey];
    if (!aliases.includes(request.symbol)) throw new Error('request.security currently supports the chart symbol only. Open the requested symbol to run this script.');
    if (replay) throw new Error('Additional timeframe data is unavailable in replay. Remove request.security or exit replay.');
    const timeframe=pineFeedTimeframe(request.timeframe);
    if (!cache.has(timeframe)) {
      if (cache.size>=8) throw new Error('Use at most eight additional timeframes in one script.');
      cache.set(timeframe,(async()=>{
        const response=await fetch(comparisonRequest(instrument.instrumentKey,timeframe),{cache:'no-store',signal});
        const body=await response.json() as {ok?:boolean;candles?:Candle[];error?:{message?:string}};
        if (!response.ok || !body.ok || !Array.isArray(body.candles)) throw new Error(body.error?.message ?? `No ${timeframe} history is available for ${instrument.symbol}.`);
        const candles=body.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.volume>=0&&c.high>=Math.max(c.low,c.open,c.close)&&c.low<=Math.min(c.open,c.close));
        if (!candles.length) throw new Error(`No valid ${timeframe} candles are available.`);
        return [...new Map(candles.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time).slice(-20_000);
      })());
    }
    return (await cache.get(timeframe)!).filter(c=>(!Number.isFinite(request.sDate)||c.time*1000>=request.sDate!)&&(!Number.isFinite(request.eDate)||c.time*1000<=request.eDate!));
  };
}
