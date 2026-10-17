import { PineTS, Indicator, computeSessionClose, type IProvider, type ISymbolInfo, type Kline, type Context } from 'pinets';
import type { Candle } from './market';
import type { AdvancedPineRun, PineRuntimeContext, PineRawVisual, PineStrategyResult } from './pine-runtime-types';
import { pineVisualWarnings } from './pine-visual-layer.ts';
export type { AdvancedPineRun, PineRuntimeContext } from './pine-runtime-types';
export type PineDataRequest=(symbol:string,timeframe:string,limit?:number,sDate?:number,eDate?:number)=>Promise<Candle[]>;
const fail=(message:string,line=1):never=>{throw new Error(`Line ${line}: ${message}`);};
type RuntimePlot={title?:string;options?:Record<string,unknown>;data?:PineRawVisual['data'];plot1?:unknown;plot2?:unknown};
const EQUITY_KEY='__papertrade_private_equity_82916__';
const color=(value:unknown,fallback='#2962ff')=>typeof value==='string'&&/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)?value:typeof value==='string'&&/^rgba?\([\d\s.,%]+\)$/.test(value)?value:fallback;
export function normalizePineTimeframe(timeframe:string):string {return ({'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','2h':'120','4h':'240','1D':'D','1W':'W','1M':'M','1Y':'12M'} as Record<string,string>)[timeframe]??timeframe;}
function timeframeMs(tf:string){const match=/^(\d+)?([SDWM]?)$/.exec(normalizePineTimeframe(tf));if(!match)return 60000;return Number(match[1]??1)*({S:1000,D:86400000,W:604800000,M:2678400000,'':60000}[match[2]]??60000);}

/** Native-source gate. PineTS also accepts JS; this product intentionally never does. */
export function validateAdvancedPineSource(source:string){
 if(/\/\/@PineTS\b/.test(source))fail('JavaScript/PineTS syntax is disabled; use native Pine v5/v6');
 if(source.length>50000)fail('Source limit is 50000 characters');if(!/^\s*\/\/@version\s*=\s*[56]\b/.test(source))fail('Start with //@version=5 or //@version=6 native Pine source');
 let clean='',quote='',escaped=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(quote){clean+=c==='\n'?'\n':' ';if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;clean+=' ';continue;}if(c==='/'&&source[i+1]==='/'){while(i<source.length&&source[i]!=='\n'){clean+=' ';i++;}clean+='\n';continue;}clean+=c;}
 if(quote)fail('Unterminated string');
 const banned=/\b(?:globalThis|window|document|self|fetch|XMLHttpRequest|WebSocket|Function|eval|constructor|prototype|__proto__|process|require|importScripts|navigator|Worker|postMessage)\b|[{};`]|=>\s*\{|\b(?:const|let|function|new)\s+[A-Za-z_$]|\bimport\s|\bexport\s/.exec(clean);
 if(banned)fail(`Unsupported native Pine syntax or forbidden access: ${banned[0]}`,clean.slice(0,banned.index).split('\n').length);
 const forbidden=/\brequest\.(?!security\s*\(|security_lower_tf\s*\()[A-Za-z_]\w*|\bbarmerge\.lookahead_on\b/.exec(clean);
 if(forbidden)fail('Only supplied market-data security requests with lookahead off are supported',clean.slice(0,forbidden.index).split('\n').length);
 // A boolean, variable or positional lookahead flag must not bypass the enum ban.
 for(const match of clean.matchAll(/\brequest\.security\s*\(/g)){
  const args:string[]=[];let nesting=0,start=match.index!+match[0].length;
  for(let i=start;i<clean.length;i++){const c=clean[i];if(c==='('||c==='[')nesting++;if(c===')'&&nesting===0){args.push(clean.slice(start,i).trim());break;}if(c===')'||c===']')nesting--;if(c===','&&nesting===0){args.push(clean.slice(start,i).trim());start=i+1;}}
  const named=args.find(a=>/^lookahead\s*=/.test(a));const flag=named?named.replace(/^lookahead\s*=\s*/,''):args[4]&&!/^\w+\s*=/.test(args[4])?args[4]:undefined;
  if(flag!==undefined&&!/^(?:barmerge\.lookahead_off|false)$/.test(flag))fail('request.security lookahead must be omitted or explicitly barmerge.lookahead_off',clean.slice(0,match.index).split('\n').length);
 }
 if(!/\b(?:indicator|strategy)\s*\(/.test(clean))fail('Declare indicator(...) or strategy(...)');
 return clean;
}
function validatedCandles(rows:Candle[],now:number){
 if(rows.length>20000)fail('Candle limit is 20000');
 const result=rows.filter(c=>c.time*1000<=now);
 result.forEach((c,i)=>{if(![c.time,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)||c.time<=0||c.volume<0||Math.min(c.open,c.high,c.low,c.close)<=0||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||i>0&&c.time<=result[i-1].time)fail('Candles must be finite valid OHLCV in strictly increasing time order');});return result;
}
function klines(rows:Candle[],timeframe:string,context:PineRuntimeContext):Kline[]{return rows.map(c=>{
 const openTime=c.time*1000;let closeTime=openTime+timeframeMs(timeframe);
 const calendar=/^(\d+)?([DWM])$/.exec(normalizePineTimeframe(timeframe));
 if(calendar)closeTime=computeSessionClose(openTime,context.session??'0915-1530',context.timezone??'Asia/Kolkata',({D:'day',W:'week',M:'month'} as const)[calendar[2] as 'D'|'W'|'M'],Number(calendar[1]??1));
 return {openTime,closeTime,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume,quoteAssetVolume:0,numberOfTrades:0,takerBuyBaseAssetVolume:0,takerBuyQuoteAssetVolume:0,ignore:0};
 });}
function serializable<T>(value:T):T{return JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='bigint'?String(v):v instanceof Map?Object.fromEntries(v):v instanceof Set?[...v]:typeof v==='function'?undefined:v));}

/** Must execute inside the isolated, network-disabled worker, never directly in the chart UI. */
export async function runAdvancedPineScript(source:string,candles:Candle[],overrides:Record<string,number|boolean|string>={},context:PineRuntimeContext={},requestData?:PineDataRequest):Promise<AdvancedPineRun>{
 const out:AdvancedPineRun={plots:[],levels:[],levelStyles:[],overlay:false,title:'Custom script',inputs:[],alerts:[],error:null,strategy:null,logs:[],warnings:[],runtime:'PineTS 0.11.1 · native Pine v5/v6',drawings:[],fills:[],visuals:[]};
 try{
  const clean=validateAdvancedPineSource(source),now=context.now??Date.now(),rows=validatedCandles(candles,now);if(!rows.length)fail('Waiting for candles');
  if(context.tickSize!==undefined&&(!Number.isFinite(context.tickSize)||context.tickSize<=0)||context.pointValue!==undefined&&(!Number.isFinite(context.pointValue)||context.pointValue<=0))fail('Tick size and point value must be finite and positive');
  const symbol=context.symbol??'CHART',timeframe=normalizePineTimeframe(context.timeframe??'D');
  let dataRequests=0;
  const provider:IProvider={
   configure(){},
   async getMarketData(ticker,tf,limit,sDate,eDate){
    if(++dataRequests>32)fail('Market-data request budget exceeded');
    ticker=ticker||symbol;
    const normalized=tf?normalizePineTimeframe(tf):timeframe;let data:Candle[]=[];
    if(ticker===symbol&&normalized===timeframe)data=rows;
    else{const supplied=context.securityData?.[`${ticker}|${normalized}`]??context.securityData?.[`${ticker}|${tf}`];if(supplied)data=validatedCandles(supplied,now);else if(requestData)data=validatedCandles(await requestData(ticker,normalized,limit,sDate,eDate),now);else fail(`Market data unavailable for ${ticker} ${normalized}; supply this dataset before running`);}
    if(!data.length)fail(`No market data available for ${ticker} ${normalized}`);
    let mapped=klines(data,normalized,context);if(sDate!==undefined)mapped=mapped.filter(c=>c.openTime>=sDate);if(eDate!==undefined)mapped=mapped.filter(c=>c.openTime<=eDate);if(limit&&limit>0)mapped=mapped.slice(-Math.min(20000,limit));return mapped;
   },
   async getSymbolInfo(ticker){const currency=context.currency??'INR';return {ticker,tickerid:ticker,main_tickerid:ticker,description:ticker,prefix:ticker.split(/[:|]/)[0],root:ticker,type:context.type??'stock',timezone:context.timezone??'Asia/Kolkata',currency,basecurrency:context.baseCurrency??'',country:currency==='INR'?'IN':'',session:context.session??'0915-1530',mintick:context.tickSize??.05,minmove:1,pricescale:Math.max(1,Math.round(1/(context.tickSize??.05))),pointvalue:context.pointValue??1,mincontract:1,volumetype:'base'} as ISymbolInfo;},
  };
  const declaration=new Indicator(source,overrides),kind=declaration.getDeclarationType();if(!kind)fail('Declare one native indicator or strategy');
  const inputs=declaration.getInputsMeta();if(inputs.length>100)fail('Input limit is 100');
  const known=new Set(inputs.flatMap(i=>[i.id,i.varId,i.title,i.name].filter((v):v is string=>!!v)));for(const k of Object.keys(overrides))if(!known.has(k))fail(`Unknown input override ${k}`);
  out.inputs=inputs.map(i=>{
   const val=overrides[i.id]??(i.varId?overrides[i.varId]:undefined)??(i.title?overrides[i.title]:undefined)??overrides[i.name]??i.defval;
   if(['int','float','price','time'].includes(i.type)&&(typeof val!=='number'||!Number.isFinite(val)||i.type==='int'&&!Number.isInteger(val)||i.minval!==undefined&&val<i.minval||i.maxval!==undefined&&val>i.maxval))fail(`Invalid input ${i.title??i.name}`);
   if(i.type==='bool'&&typeof val!=='boolean')fail(`Invalid bool input ${i.name}`);
   if(i.type==='color'&&color(val,'')==='')fail(`Invalid color input ${i.name}`);
   if(i.options&&!i.options.includes(val))fail(`Input ${i.name} is outside its options`);
   return {id:i.varId??i.id,title:i.title??i.name,type:i.type,defaultValue:i.defval as number|string|boolean,value:val as number|string|boolean,min:i.minval,max:i.maxval,step:i.step,options:i.options?.map(String),group:i.group,tooltip:i.tooltip};
  });
  const strategy=kind==='strategy';
  // The hidden equity series samples the actual broker's equity each bar, with no reconstructed fills.
  const code=strategy?source+`\nplot(strategy.equity, "${EQUITY_KEY}")\n`:source;
  const script=new Indicator(code,overrides),engine=new PineTS(provider,symbol,timeframe,rows.length);
  engine.setMaxLoops(10000);engine.setAlertMode('all');engine.setTimezone(context.timezone??'Asia/Kolkata');
  const prepared=script.prepare(),original=prepared.fn;
  prepared.fn=async function(ctx:Context){
   for(const level of ['info','warning','error'] as const)ctx.pine.log[level]=(...args:unknown[])=>{if(out.logs.length<500){let message=String(args[0]??'');for(let i=1;i<args.length;i++)message=message.replaceAll(`{${i-1}}`,String(args[i]));out.logs.push({level,message,time:(ctx.marketData?.[ctx.idx]?.openTime??0)/1000});}return undefined;};
   return original(ctx);
  };
  const result=await engine.run(script);
  out.title=result.strategy?.config.title??result.indicator?.title??'Custom script';out.overlay=result.strategy?.config.overlay??result.indicator?.overlay??false;
  const raw=result.plots as Record<string,RuntimePlot>,all=Object.entries(raw);if(all.length>256)fail('Output series limit is 256');
  let outputPoints=0;
  for(const [key,p]of all){outputPoints+=(p.data?.length??0);if(outputPoints>1500000)fail('Output point budget exceeded');if(key===EQUITY_KEY)continue;
   const visual:PineRawVisual={key,title:p.title??key,options:serializable(p.options??{}),data:serializable(p.data??[])};if(p.plot1!==undefined)visual.plot1=String(p.plot1);if(p.plot2!==undefined)visual.plot2=String(p.plot2);out.visuals.push(visual);
   const style=String(p.options?.style??'line').replace(/^style_/,'');
   if(style==='area')out.warnings.push('Area plots currently render as their boundary line; explicit fill(...) regions are supported.');
   if(['areabr','linebr','stepline','steplinebr','stepline_diamond'].includes(style))out.warnings.push(`${style} plots render as connected boundary lines; exact step and gap styling is not implemented.`);
   if(style==='cross')out.warnings.push('Cross plot markers currently render as circles.');
   if(p.options?.force_overlay===true&&!out.overlay)out.warnings.push('force_overlay is not implemented per output: series and drawing primitives use the script pane.');
   if(p.options?.trackprice===true)out.warnings.push('Per-plot trackprice guide lines are not implemented.');
   if(Number(p.options?.offset))out.warnings.push('Plot offsets are clipped to loaded candle dates; future chart times are not extrapolated.');
   const hidden=p.options?.display===false||p.options?.display===0||['none','display.none','data_window','status_line'].includes(String(p.options?.display));
   if(hidden)continue;
   if(style==='hline'&&(p.options?.linestyle&&p.options.linestyle!=='dashed'||Number(p.options?.linewidth)>1))out.warnings.push('Horizontal-line color and title are rendered; custom dash and width settings are not implemented.');
   if(style==='hline'){const first=p.data?.find(d=>typeof d.value==='number'&&Number.isFinite(d.value));if(first&&typeof first.value==='number'){out.levels.push(first.value);out.levelStyles.push({price:first.value,title:p.title??key,color:color(first.options?.color??p.options?.color)});}continue;}
   if(['fill','bgcolor','background','barcolor','label','drawing_line','drawing_box','linefill','drawing_polyline','table','shape','char','arrow','bar','candle'].includes(style)||key.startsWith('__'))continue;
   const byTime=new Map((p.data??[]).map(d=>[Number(d.time),d]));
   const showLast=p.options?.show_last===undefined?rows.length:Number(p.options.show_last);
   if(!Number.isInteger(showLast)||showLast<0)fail('Plot show_last must be a nonnegative integer');
   const values=rows.map((c,i)=>{if(i<rows.length-showLast)return NaN;const v=byTime.get(c.time*1000)?.value;return typeof v==='number'&&Number.isFinite(v)?v:NaN;});
   out.plots.push({name:p.title??key,values,colors:rows.map(c=>{const d=byTime.get(c.time*1000);return color(d?.options?.color??p.options?.color);}),width:Math.max(1,Math.min(4,Number(p.options?.linewidth)||1)),offset:Number(p.options?.offset)||0,histogram:['histogram','columns'].includes(style),points:['circles','cross'].includes(style)});
  }
  const alertMap=new Map<string,{title:string;message:string;values:boolean[]}>();for(const event of result.alerts??[]){
   // PineTS 0.11.1 may put native named arguments together in `title`.
   const bundled=event.title&&typeof event.title==='object'?event.title as {title?:unknown;message?:unknown}:undefined;
   const title=typeof event.title==='string'?event.title:typeof bundled?.title==='string'?bundled.title:'Alert';
   const message=typeof event.message==='string'&&event.message?event.message:typeof bundled?.message==='string'?bundled.message:'';
   const k=typeof event.id==='string'||typeof event.id==='number'?String(event.id):`${title}\u0000${message}`;let a=alertMap.get(k);
   if(!a){if(alertMap.size>=100)break;a={title,message,values:Array(rows.length).fill(false)};alertMap.set(k,a);}if(Number.isInteger(event.bar_index)&&event.bar_index>=0&&event.bar_index<rows.length)a.values[event.bar_index]=true;
  }out.alerts=[...alertMap.values()];
  out.warnings=[...new Set([...out.warnings,...(result.warnings??[]).slice(0,100).map(w=>`${w.method?w.method+': ':''}${w.message}`)])];
  out.warnings.push(...pineVisualWarnings(out.visuals));
  if(/\bforce_overlay\s*=/.test(clean))out.warnings.push('force_overlay routing is not implemented per output: series and drawing primitives use the script pane.');
  if(strategy&&result.strategy){const state=result.strategy,trades=state.closedtrades.map(t=>({id:t.entry_id,direction:t.size>=0?'long' as const:'short' as const,entryTime:t.entry_time/1000,entryPrice:t.entry_price,exitTime:(t.exit_time??0)/1000,exitPrice:t.exit_price??NaN,quantity:Math.abs(t.size),profit:t.profit??0,commission:t.commission??0}));
   const equity=(raw[EQUITY_KEY]?.data??[]).map(d=>({time:Number(d.time)/1000,value:Number(d.value)})).filter(d=>Number.isFinite(d.value));
   const r:PineStrategyResult={initialCapital:state.initial_capital,currency:state.account_currency,netProfit:state.netprofit,netProfitPercent:state.initial_capital?state.netprofit/state.initial_capital*100:0,maxDrawdown:state.max_drawdown,maxDrawdownPercent:state.max_drawdown_percent_value,winRate:trades.length?state.wintrades/trades.length*100:0,profitFactor:state.grossloss?state.grossprofit/Math.abs(state.grossloss):null,trades,equity};
   if(state.opentrades.length){const t=state.opentrades[0];r.openPosition={id:state.position_entry_name,direction:state.position_size>=0?'long':'short',entryTime:t.entry_time/1000,entryPrice:state.position_avg_price,quantity:Math.abs(state.position_size),unrealizedProfit:state.openprofit};}out.strategy=r;
   out.warnings.push('Historical broker simulation on supplied OHLCV, not live execution. Results depend on fill assumptions, history and configured costs; corporate actions and liquidity may differ. Net profit uses closed trades; equity also includes open P/L.');
   if(['futures','option'].includes(context.type??'')&&context.pointValue===undefined)out.warnings.push('Contract point value was not supplied; strategy calculations use a unit point value of 1. Verify contract multipliers before interpreting monetary results.');
  }
  if(/\brequest\./.test(clean))out.warnings.push('Multi-timeframe requests use only supplied datasets and lookahead off. Calendar/session timestamps follow the supplied provider context.');
  if(/\btime_close\b|\brequest\./.test(clean))out.warnings.push('Daily close times follow the supplied exchange session. Weekly/monthly session closes are calendar estimates; exchange holidays and early closes are not supplied.');
  if(/\bbarstate\.(?:isrealtime|ishistory)\b/.test(clean))out.warnings.push('PineTS marks the last loaded bar as realtime, including historical snapshots; no live tick stream is implied.');
  out.warnings.push('PineTS native Pine compatibility is experimental; this is an independent runtime, not TradingView.');
  out.warnings=[...new Set(out.warnings)];
  return out;
 }catch(error){return {...out,plots:[],levels:[],levelStyles:[],alerts:[],visuals:[],strategy:null,error:error instanceof Error?error.message:'Script execution failed'};}
}
