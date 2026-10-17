import type { Candle, Instrument } from './market';
import { comparisonRequest } from './chart-compare.ts';
import { TRADING_INDICES } from './trading-universes.ts';
import type { PineDataRequest } from './pine-sandbox';
import type { PineMarketDataset, PineSymbolMetadata } from './pine-runtime-types';

const TIMEFRAMES:Record<string,string> = { '1':'1m','2':'2m','3':'3m','5':'5m','10':'10m','15':'15m','30':'30m','60':'1H','120':'2H','180':'3H','240':'4H',D:'1D','1D':'1D',W:'1W','1W':'1W',M:'1M','1M':'1M' };
export function pineFeedTimeframe(value:string):string {
  const result=Object.hasOwn(TIMEFRAMES,value)?TIMEFRAMES[value]:undefined;
  if (!result) throw new Error(`The chart data feed does not supply Pine timeframe ${value}.`);
  return result;
}
export function pineTimeframe(value:string):string {
  return Object.entries(TIMEFRAMES).find(([,app])=>app===value)?.[0] ?? value;
}
export function pineSymbolMetadata(instrument:Instrument):PineSymbolMetadata {
  const india=['NSE','BSE','MCX'].includes(instrument.exchange);
  return {symbol:`${instrument.exchange}:${instrument.symbol}`,description:instrument.name,
    currency:india?'INR':'USD',baseCurrency:india?'':instrument.underlyingSymbol??'',
    timezone:india?'Asia/Kolkata':'UTC',session:india?(instrument.exchange==='MCX'?'0900-2330':'0915-1530'):'24x7',
    type:instrument.assetType==='OPTION'?'option':instrument.assetType==='FUTURE'?'futures':instrument.assetType==='INDEX'?'index':instrument.exchange==='DELTA'?'crypto':'stock',
    // The directory does not publish tick/multiplier data. Leave these absent
    // rather than borrowing the chart symbol's contract values.
  };
}
function validDirectoryInstrument(value:unknown):value is Instrument {
  if(!value||typeof value!=='object')return false;
  const row=value as Partial<Instrument>;
  return typeof row.symbol==='string'&&/^[A-Z0-9&._-]{1,80}$/i.test(row.symbol)&&
    typeof row.exchange==='string'&&['NSE','BSE','DELTA'].includes(row.exchange)&&
    typeof row.instrumentKey==='string'&&/^(?:NSE_EQ|BSE_EQ|NSE_INDEX|BSE_INDEX|DELTA)\|[A-Za-z0-9 .&|_-]{1,80}$/.test(row.instrumentKey);
}

/** The host resolves an exact exchange/symbol against the app's instrument
 * directory. Scripts can request candles, never arbitrary URLs or actions. */
export function createPineMarketData(instrument:Instrument, signal:AbortSignal, replay=false) {
  const cache=new Map<string,Promise<PineMarketDataset>>();
  const directories=new Map<string,Promise<Instrument[]>>();
  async function directory(exchange:string) {
    const endpoint=exchange==='DELTA'?'/api/global-markets?mode=catalog':'/api/upstox/instruments';
    if(!directories.has(endpoint))directories.set(endpoint,(async()=>{
      const response=await fetch(endpoint,{cache:'no-store',signal});
      const body=await response.json() as {ok?:boolean;instruments?:unknown[];error?:{message?:string}};
      if(!response.ok||!body.ok||!Array.isArray(body.instruments))throw new Error(body.error?.message??'The instrument directory is unavailable.');
      return body.instruments.filter(validDirectoryInstrument);
    })());
    return directories.get(endpoint)!;
  }
  async function resolve(symbol:string):Promise<Instrument> {
    const value=symbol.trim();
    if(['',instrument.symbol,`${instrument.exchange}:${instrument.symbol}`,instrument.instrumentKey].includes(value))return instrument;
    if(!/^(?:[A-Z_]+[:|])?[A-Za-z0-9 .&|_-]{1,80}$/.test(value))throw new Error('Invalid Pine symbol. Use an exchange-qualified symbol such as NSE:INFY.');
    const suppliedKey=value.includes('|');
    const parts=value.split(':');
    const exchange=parts.length===2?parts[0]:suppliedKey?value.split('|')[0].split('_')[0]:instrument.exchange;
    if(!['NSE','BSE','DELTA'].includes(exchange))throw new Error(`The connected feed does not supply exchange ${exchange}.`);
    const ticker=parts.length===2?parts[1]:value;
    const matches=(item:Instrument)=>suppliedKey?item.instrumentKey===value:item.exchange===exchange&&item.symbol.toUpperCase()===ticker.toUpperCase();
    const index=TRADING_INDICES.find(matches);if(index)return index;
    const found=(await directory(exchange)).filter(matches);
    if(found.length!==1)throw new Error(found.length?`Ambiguous Pine symbol ${value}; use an instrument key.`:`No exact ${value} symbol is available in the connected feed. Exchange symbols are not substituted.`);
    return found[0];
  }
  return async (request:PineDataRequest):Promise<PineMarketDataset> => {
    if (!request || typeof request.symbol !== 'string' || typeof request.timeframe !== 'string') throw new Error('Invalid Pine market data request.');
    if (replay) throw new Error('Additional symbol/timeframe data is unavailable in replay: partial historical bars cannot be reconstructed safely. Remove request.security or exit replay.');
    const timeframe=pineFeedTimeframe(request.timeframe);
    const requested=await resolve(request.symbol),key=`${requested.instrumentKey}|${timeframe}`;
    if (!cache.has(key)) {
      if (cache.size>=8) throw new Error('Use at most eight additional symbol/timeframe datasets in one script.');
      cache.set(key,(async()=>{
        const response=await fetch(comparisonRequest(requested.instrumentKey,timeframe),{cache:'no-store',signal});
        const body=await response.json() as {ok?:boolean;candles?:Candle[];error?:{message?:string}};
        if (!response.ok || !body.ok || !Array.isArray(body.candles)) throw new Error(body.error?.message ?? `No ${timeframe} history is available for ${requested.symbol}.`);
        const candles=body.candles.filter(c=>[c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)&&c.time>0&&Math.min(c.open,c.high,c.low,c.close)>0&&c.volume>=0&&c.high>=Math.max(c.low,c.open,c.close)&&c.low<=Math.min(c.open,c.close));
        if (!candles.length) throw new Error(`No valid ${timeframe} candles are available for ${requested.symbol}.`);
        return {candles:[...new Map(candles.map(c=>[c.time,c])).values()].sort((a,b)=>a.time-b.time).slice(-20_000),symbolInfo:pineSymbolMetadata(requested)};
      })());
    }
    const dataset=await cache.get(key)!;
    return {...dataset,candles:dataset.candles.filter(c=>(!Number.isFinite(request.sDate)||c.time*1000>=request.sDate!)&&(!Number.isFinite(request.eDate)||c.time*1000<=request.eDate!))};
  };
}
