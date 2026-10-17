import { runAdvancedPineScript } from './pine-runtime';
import type { Candle } from './market';
import type { PineRuntimeContext, PineMarketData } from './pine-runtime-types';

type Request = {
  source: string;
  candles: Candle[];
  inputs: Record<string, number | boolean | string>;
  context: PineRuntimeContext;
};
let requestId = 0;
const pending = new Map<number, {resolve:(data:PineMarketData)=>void;reject:(error:Error)=>void}>();
self.onmessage = async (event: MessageEvent<Request | {type:'data-response';id:number;data?:PineMarketData;error?:string}>) => {
  if ('type' in event.data && event.data.type === 'data-response') {
    const request = pending.get(event.data.id);
    pending.delete(event.data.id);
    if (event.data.error) request?.reject(new Error(event.data.error));
    else request?.resolve(event.data.data ?? []);
    return;
  }
  try {
    const { source, candles, inputs, context } = event.data as Request;
    const result = await runAdvancedPineScript(source, candles, inputs, context, (symbol, timeframe, limit, sDate, eDate) => new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, {resolve, reject});
      self.postMessage({type:'data-request',id,request:{symbol,timeframe,limit,sDate,eDate}});
    }));
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Pine execution failed.' });
  }
};
