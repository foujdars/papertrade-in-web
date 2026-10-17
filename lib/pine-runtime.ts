import { PineTS, Indicator, computeSessionClose, type IProvider, type ISymbolInfo, type Kline, type Context } from 'pinets';
import type { Candle } from './market';
import type { AdvancedPineRun, PineRuntimeContext, PineRawVisual, PineStrategyResult, PineMarketData, PineSymbolMetadata } from './pine-runtime-types';
import { pineVisualWarnings } from './pine-visual-layer.ts';
import { enablePineRuntimeCompatibility } from './pine-runtime-compat.ts';
export type { AdvancedPineRun, PineRuntimeContext } from './pine-runtime-types';
export type PineDataRequest=(symbol:string,timeframe:string,limit?:number,sDate?:number,eDate?:number)=>Promise<PineMarketData>;
const fail=(message:string,line=1):never=>{throw new Error(`Line ${line}: ${message}`);};
type RuntimePlot={title?:string;options?:Record<string,unknown>;data?:PineRawVisual['data'];plot1?:unknown;plot2?:unknown};
const EQUITY_KEY='__papertrade_private_equity_82916__';
const color=(value:unknown,fallback='#2962ff')=>typeof value==='string'&&/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)?value:typeof value==='string'&&/^rgba?\([\d\s.,%]+\)$/.test(value)?value:fallback;
export function normalizePineTimeframe(timeframe:string):string {return ({'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','1H':'60','2h':'120','2H':'120','4h':'240','4H':'240','1D':'D','1W':'W','1M':'M','1Y':'12M'} as Record<string,string>)[timeframe]??timeframe;}
function timeframeMs(tf:string){const match=/^(\d+)?([SDWM]?)$/.exec(normalizePineTimeframe(tf));if(!match)return 60000;return Number(match[1]??1)*({S:1000,D:86400000,W:604800000,M:2678400000,'':60000}[match[2]]??60000);}

/** Native-source gate. PineTS also accepts JS; this product intentionally never does. */
export function validateAdvancedPineSource(source:string){
 if(/\/\/@PineTS\b/.test(source))fail('JavaScript/PineTS syntax is disabled; use native Pine v5/v6');
 if(source.length>50000)fail('Source limit is 50000 characters');if(!/^\s*\/\/@version\s*=\s*[56]\b/.test(source))fail('Start with //@version=5 or //@version=6 native Pine source');
 let clean='',quote='',escaped=false;
 for(let i=0;i<source.length;i++){const c=source[i];if(quote){clean+=c==='\n'?'\n':' ';if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;clean+=' ';continue;}if(c==='/'&&source[i+1]==='/'){while(i<source.length&&source[i]!=='\n'){clean+=' ';i++;}clean+='\n';continue;}clean+=c;}
 if(quote)fail('Unterminated string');
 const banned=/\b(?:globalThis|window|document|fetch|XMLHttpRequest|WebSocket|Function|eval|constructor|prototype|__proto__|process|require|importScripts|navigator|Worker|postMessage)\b|[{};`]|=>\s*\{|\b(?:let|function|new)\s+[A-Za-z_$]|\bconst\s+(?!(?:int|float|bool|string|color)\s)[A-Za-z_$]|\bimport\s|\bexport\s/.exec(clean);
 if(banned)fail(`Unsupported native Pine syntax or forbidden access: ${banned[0]}`,clean.slice(0,banned.index).split('\n').length);
 // `self` is a conventional, valid Pine method parameter. Permit only that
 // lexical binding; an unbound worker-global `self` remains forbidden.
 let selfScope:number|null=null;
 clean.split('\n').forEach((line,index)=>{
  if(!line.trim())return;const indent=line.match(/^\s*/)?.[0].length??0;
  if(selfScope!==null&&indent<=selfScope)selfScope=null;
  const bound=/^\s*method\s+[A-Za-z_]\w*\s*\(\s*(?:[A-Za-z_]\w*(?:<[^>]+>)?)\s+self\s*(?:,|\))/.test(line)&&line.includes('=>');
  if(bound)selfScope=indent;
  if(/\bself\b/.test(line)&&!bound&&(selfScope===null||indent<=selfScope))fail('Unbound host access: self',index+1);
 });
 const forbidden=/\brequest\.(?!security\s*\(|security_lower_tf\s*\()[A-Za-z_]\w*/.exec(clean);
 if(forbidden)fail('Only supplied market-data security and security_lower_tf requests are supported',clean.slice(0,forbidden.index).split('\n').length);
 // A boolean, variable or positional lookahead flag must not bypass the enum ban.
 for(const match of clean.matchAll(/\brequest\.security\s*\(/g)){
  const args:string[]=[];let nesting=0,start=match.index!+match[0].length;
  for(let i=start;i<clean.length;i++){const c=clean[i];if(c==='('||c==='[')nesting++;if(c===')'&&nesting===0){args.push(clean.slice(start,i).trim());break;}if(c===')'||c===']')nesting--;if(c===','&&nesting===0){args.push(clean.slice(start,i).trim());start=i+1;}}
  const named=args.find(a=>/^lookahead\s*=/.test(a));const flag=named?named.replace(/^lookahead\s*=\s*/,''):args[4]&&!/^\w+\s*=/.test(args[4])?args[4]:undefined;
  if(flag!==undefined&&!/^(?:barmerge\.lookahead_off|false)$/.test(flag)){
   const expression=(args.find(a=>/^expression\s*=/.test(a))?.replace(/^expression\s*=\s*/,'')??args[2]??'').trim();
   if(flag!=='barmerge.lookahead_on'||!hasConfirmedHistoryOffset(expression))fail('request.security lookahead_on requires an explicit expression[1] (or greater) historical offset on every tuple item; otherwise use barmerge.lookahead_off',clean.slice(0,match.index).split('\n').length);
  }
 }
 if(!/\b(?:indicator|strategy)\s*\(/.test(clean))fail('Declare indicator(...) or strategy(...)');
 return clean;
}
/** Conservative proof, rather than guessing whether an arbitrary variable is
 * already offset. A complete expression followed by [positive integer] uses
 * only a previous requested bar. Tuples must offset every component. */
function hasConfirmedHistoryOffset(expression:string):boolean {
 const split=(value:string)=>{const parts:string[]=[];let start=0,depth=0;for(let i=0;i<value.length;i++){if('(['.includes(value[i]))depth++;else if(')]'.includes(value[i]))depth--;else if(value[i]===','&&depth===0){parts.push(value.slice(start,i).trim());start=i+1;}}parts.push(value.slice(start).trim());return parts;};
 if(expression.startsWith('[')&&expression.endsWith(']'))return split(expression.slice(1,-1)).every(hasConfirmedHistoryOffset);
 const suffix=/\[\s*([1-9]\d*)\s*\]$/.exec(expression);if(!suffix)return false;
 const base=expression.slice(0,suffix.index).trim();if(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(base))return true;
 const open=base.indexOf('(');if(open<0||!base.endsWith(')')||open>0&&!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(base.slice(0,open)))return false;
 let depth=0;for(let i=open;i<base.length;i++){if(base[i]==='(')depth++;else if(base[i]===')')depth--;if(depth===0&&i<base.length-1)return false;}return depth===0;
}
/** PineTS 0.11.1 captures a fully named request call as one parameter object,
 * losing the expression series. Reorder native Pine arguments before its
 * parser so the expression receives the same history capture as a positional
 * call. Only these documented parameter names are transformed. */
function normalizeNamedPineRequests(input:string):string {
 let source=input;
 for(let pass=0;pass<256;pass++){
  const clean=validateAdvancedPineSource(source);let changed=false;
  for(const call of clean.matchAll(/\brequest\.(?:security|security_lower_tf)\s*\(/g)){
   const spans:{text:string;clean:string}[]=[];const begin=call.index!+call[0].length;let start=begin,depth=0,end=-1;
   for(let i=begin;i<clean.length;i++){
    const c=clean[i];if(c==='('||c==='[')depth++;else if(c===')'&&depth===0){spans.push({text:source.slice(start,i),clean:clean.slice(start,i)});end=i;break;}
    else if(c===')'||c===']')depth--;else if(c===','&&depth===0){spans.push({text:source.slice(start,i),clean:clean.slice(start,i)});start=i+1;}
   }
   if(end<0||!spans.some(s=>/^\s*(?:symbol|timeframe|expression)\s*=/.test(s.clean)))continue;
   const slots:(string|undefined)[]=Array(3).fill(undefined),extras:string[]=[];let position=0;
   for(const span of spans){const named=/^\s*([A-Za-z_]\w*)\s*=/.exec(span.clean);
    if(named){const index=['symbol','timeframe','expression'].indexOf(named[1]);if(index>=0){if(slots[index]!==undefined)fail(`Duplicate request argument ${named[1]}`);slots[index]=span.text.slice(named[0].length);}else extras.push(span.text);}
    else if(position<3){if(slots[position]!==undefined)fail('Duplicate positional request argument');slots[position++]=span.text;}else extras.push(span.text);
   }
   if(slots.some(s=>s===undefined))continue;
   source=source.slice(0,begin)+[...slots,...extras].join(',')+source.slice(end);changed=true;break;
  }
  if(!changed)return source;
 }
 return fail('Too many named market-data requests to normalize');
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
// PineTS strips an exchange prefix before asking its provider. Preserve it in
// an internal token so NSE:ABC and BSE:ABC can never silently share a dataset.
const encodeSymbol=(symbol:string)=>symbol.replace(':','__PT_EXCHANGE__');
const decodeSymbol=(symbol:string)=>symbol.replace('__PT_EXCHANGE__',':');
function encodedSymbolArgument(value:unknown,chartSymbol:string):unknown {
 if(typeof value==='string'){
  // Preserve the chart's bare-ticker alias as well as its qualified ticker.
  // Otherwise encoding the exchange would force a new dataset even for the
  // current chart, changing warmup history and making replay fail needlessly.
  const chartTicker=chartSymbol.split(':').at(-1)!;
  return encodeSymbol(value===chartTicker?chartSymbol:value);
 }
 if(Array.isArray(value)&&value.length===2&&typeof value[1]==='string')return [encodedSymbolArgument(value[0],chartSymbol),value[1]];
 if(value&&typeof value==='object'&&'get' in value&&typeof value.get==='function')return encodedSymbolArgument(value.get(0),chartSymbol);
 return value;
}
function currentArgument(value:unknown):unknown {
 if(Array.isArray(value)&&value.length===2&&typeof value[1]==='string')return currentArgument(value[0]);
 if(value&&typeof value==='object'&&'get' in value&&typeof value.get==='function')return value.get(0);
 return value;
}
function requestSlots(args:unknown[],names:string[]):Record<string,unknown> {
 const slots:Record<string,unknown>={};args.forEach((arg,index)=>{
  if(arg&&typeof arg==='object'&&!Array.isArray(arg)&&!('get' in arg)){
   for(const name of names)if(Object.hasOwn(arg,name))slots[name]=(arg as Record<string,unknown>)[name];
  }else if(names[index])slots[names[index]]=arg;
 });return slots;
}

/** Must execute inside the isolated, network-disabled worker, never directly in the chart UI. */
export async function runAdvancedPineScript(source:string,candles:Candle[],overrides:Record<string,number|boolean|string>={},context:PineRuntimeContext={},requestData?:PineDataRequest):Promise<AdvancedPineRun>{
 const out:AdvancedPineRun={plots:[],levels:[],levelStyles:[],overlay:false,title:'Custom script',inputs:[],alerts:[],error:null,strategy:null,logs:[],warnings:[],runtime:'PineTS 0.11.1 · native Pine v5/v6',drawings:[],fills:[],visuals:[]};
 try{
  const clean=validateAdvancedPineSource(source),now=context.now??Date.now(),rows=validatedCandles(candles,now);if(!rows.length)fail('Waiting for candles');
  if(context.tickSize!==undefined&&(!Number.isFinite(context.tickSize)||context.tickSize<=0)||context.pointValue!==undefined&&(!Number.isFinite(context.pointValue)||context.pointValue<=0))fail('Tick size and point value must be finite and positive');
  const symbol=context.symbol??'CHART',runtimeSymbol=encodeSymbol(symbol),timeframe=normalizePineTimeframe(context.timeframe??'D');
  const metadata=new Map<string,PineSymbolMetadata>([[symbol,context]]);
  let dataRequests=0;
  const provider:IProvider={
   configure(){},
   async getMarketData(ticker,tf,limit,sDate,eDate){
    if(++dataRequests>32)fail('Market-data request budget exceeded');
    ticker=decodeSymbol(ticker||symbol);
    const normalized=tf?normalizePineTimeframe(tf):timeframe;let data:Candle[]=[];
    if(ticker===symbol&&normalized===timeframe)data=rows;
    else{const supplied=context.securityData?.[`${ticker}|${normalized}`]??context.securityData?.[`${ticker}|${tf}`];const dataset=supplied??(requestData?await requestData(ticker,normalized,limit,sDate,eDate):undefined);if(!dataset)return fail(`Market data unavailable for ${ticker} ${normalized}; supply this dataset before running`);if(Array.isArray(dataset))data=validatedCandles(dataset,now);else{
     data=validatedCandles(dataset.candles,now);
     // Additional timeframes of the chart retain its known contract values;
     // another symbol must never inherit the chart's tick size/multiplier.
     const info=ticker===symbol||dataset.symbolInfo.symbol===symbol?{...dataset.symbolInfo,...context}:dataset.symbolInfo;
     metadata.set(ticker,info);
     if(info.tickSize===undefined||info.pointValue===undefined)out.warnings.push(`${ticker}: the feed directory does not supply all contract metadata. Missing mintick/pointvalue use runtime defaults (0.05/1); verify scripts that depend on them.`);
    }}
    if(!data.length)fail(`No market data available for ${ticker} ${normalized}`);
    let mapped=klines(data,normalized,metadata.get(ticker)??context);if(sDate!==undefined)mapped=mapped.filter(c=>c.openTime>=sDate);if(eDate!==undefined)mapped=mapped.filter(c=>c.openTime<=eDate);if(limit&&limit>0)mapped=mapped.slice(-Math.min(20000,limit));return mapped;
   },
   async getSymbolInfo(rawTicker){const requested=decodeSymbol(rawTicker),info=metadata.get(requested)??{...context,symbol:requested},tickerid=info.symbol??requested,ticker=tickerid.split(':').at(-1)!,currency=info.currency??'INR';return {ticker,tickerid,main_tickerid:symbol,description:info.description??ticker,prefix:tickerid.includes(':')?tickerid.split(':')[0]:'',root:ticker,type:info.type??'stock',timezone:info.timezone??'Asia/Kolkata',currency,basecurrency:info.baseCurrency??'',country:currency==='INR'?'IN':'',session:info.session??'0915-1530',mintick:info.tickSize??.05,minmove:1,pricescale:Math.max(1,Math.round(1/(info.tickSize??.05))),pointvalue:info.pointValue??1,mincontract:1,volumetype:'base'} as ISymbolInfo;},
  };
  enablePineRuntimeCompatibility(provider);
  const runtimeSource=normalizeNamedPineRequests(source);
  const declaration=new Indicator(runtimeSource,overrides),kind=declaration.getDeclarationType();if(!kind)fail('Declare one native indicator or strategy');
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
  const code=strategy?runtimeSource+`\nplot(strategy.equity, "${EQUITY_KEY}")\n`:runtimeSource;
  const script=new Indicator(code,overrides),engine=new PineTS(provider,runtimeSymbol,timeframe,rows.length);
  engine.setMaxLoops(10000);engine.setAlertMode('all');engine.setTimezone(context.timezone??'Asia/Kolkata');
  const prepared=script.prepare(),original=prepared.fn;
  prepared.fn=async function(ctx:Context){
   if(!ctx.cache.__papertradeContextInstalled){
    ctx.cache.__papertradeContextInstalled=true;
    for(const name of ['security','security_lower_tf']){
     const originalRequest=ctx.pine.request[name].bind(ctx.pine.request);
     ctx.pine.request[name]=async(...args:unknown[])=>{
      const encoded=args.map((arg,index)=>{
      if(arg&&typeof arg==='object'&&!Array.isArray(arg)&&Object.hasOwn(arg,'symbol'))return {...arg,symbol:encodedSymbolArgument((arg as {symbol:unknown}).symbol,symbol)};
      return index===0?encodedSymbolArgument(arg,symbol):arg;
      });
      if(name==='security_lower_tf'){
       const slots=requestSlots(encoded,['symbol','timeframe','expression','ignore_invalid_symbol','currency','ignore_invalid_timeframe','calc_bars_count']);
       const tf=String(currentArgument(slots.timeframe)??'');
       if(normalizePineTimeframe(tf||timeframe)===timeframe){
        // Upstream 0.11.1's equal-timeframe shortcut returns chart data even
        // for a different symbol. Reuse security's symbol-aware path and
        // retain lower_tf's one-element array / tuple-of-arrays contract.
        const value=await ctx.pine.request.security(slots.symbol,slots.timeframe,slots.expression,{ignore_invalid_symbol:slots.ignore_invalid_symbol,currency:slots.currency,calc_bars_count:slots.calc_bars_count});
        return Array.isArray(value)&&Array.isArray(value[0])?[value[0].map((v:unknown)=>ctx.pine.array.from(v))]:ctx.pine.array.from(value);
       }
      }
      return originalRequest(...encoded);
     };
    }
    // Snapshot execution is historical after the bar closes. PineTS's default
    // marks every final bar realtime, even a years-old backtest/replay.
    const live=()=>!context.replay&&ctx.idx===ctx.length-1&&(ctx.marketData?.[ctx.idx]?.closeTime??0)>now;
    const lastLive=()=>!context.replay&&(ctx.marketData?.at(-1)?.closeTime??0)>now;
    Object.defineProperties(ctx.pine.barstate,{
     isrealtime:{configurable:true,get:live},ishistory:{configurable:true,get:()=>!live()},
     isconfirmed:{configurable:true,get:()=>!live()},
     islastconfirmedhistory:{configurable:true,get:()=>ctx.idx===ctx.length-(lastLive()?2:1)},
    });
   }
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
   if(style==='stepline_diamond')out.warnings.push('stepline_diamond renders its step line; diamond markers at step transitions are not implemented.');
   if(Number(p.options?.offset))out.warnings.push('Plot offsets are clipped to loaded candle dates; future chart times are not extrapolated.');
   const hidden=p.options?.display===false||p.options?.display===0||['none','display.none','data_window','status_line'].includes(String(p.options?.display));
   if(hidden)continue;
   if(style==='hline'){const first=p.data?.find(d=>typeof d.value==='number'&&Number.isFinite(d.value));if(first&&typeof first.value==='number'){out.levels.push(first.value);out.levelStyles.push({price:first.value,title:p.title??key,color:color(first.options?.color??p.options?.color),width:Math.max(1,Math.min(4,Number(p.options?.linewidth)||1)),style:String(p.options?.linestyle??'dashed')});}continue;}
   if(['fill','bgcolor','background','barcolor','label','drawing_line','drawing_box','linefill','drawing_polyline','table','shape','char','arrow','bar','candle'].includes(style)||key.startsWith('__'))continue;
   const byTime=new Map((p.data??[]).map(d=>[Number(d.time),d]));
   const showLast=p.options?.show_last===undefined?rows.length:Number(p.options.show_last);
   if(!Number.isInteger(showLast)||showLast<0)fail('Plot show_last must be a nonnegative integer');
   const values=rows.map((c,i)=>{if(i<rows.length-showLast)return NaN;const v=byTime.get(c.time*1000)?.value;return typeof v==='number'&&Number.isFinite(v)?v:NaN;});
   out.plots.push({name:p.title??key,values,colors:rows.map(c=>{const d=byTime.get(c.time*1000);return color(d?.options?.color??p.options?.color);}),width:Math.max(1,Math.min(4,Number(p.options?.linewidth)||1)),offset:Number(p.options?.offset)||0,histogram:['histogram','columns'].includes(style),points:['circles','cross'].includes(style),style,
    forceOverlay:p.options?.force_overlay===true,trackPrice:p.options?.trackprice===true,histbase:Number(p.options?.histbase)||0,join:p.options?.join===true,showLast,
    display:typeof p.options?.display==='number'||typeof p.options?.display==='string'?p.options.display:undefined,lineStyle:typeof p.options?.linestyle==='string'?p.options.linestyle:undefined});
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
  if(strategy&&result.strategy){const state=result.strategy,trades=state.closedtrades.map(t=>({id:t.entry_id,direction:t.size>=0?'long' as const:'short' as const,entryTime:t.entry_time/1000,entryPrice:t.entry_price,exitTime:(t.exit_time??0)/1000,exitPrice:t.exit_price??NaN,quantity:Math.abs(t.size),profit:t.profit??0,commission:t.commission??0}));
   const equity=(raw[EQUITY_KEY]?.data??[]).map(d=>({time:Number(d.time)/1000,value:Number(d.value)})).filter(d=>Number.isFinite(d.value));
   const r:PineStrategyResult={initialCapital:state.initial_capital,currency:state.account_currency,netProfit:state.netprofit,netProfitPercent:state.initial_capital?state.netprofit/state.initial_capital*100:0,maxDrawdown:state.max_drawdown,maxDrawdownPercent:state.max_drawdown_percent_value,winRate:trades.length?state.wintrades/trades.length*100:0,profitFactor:state.grossloss?state.grossprofit/Math.abs(state.grossloss):null,trades,equity};
   if(state.opentrades.length){const t=state.opentrades[0];r.openPosition={id:state.position_entry_name,direction:state.position_size>=0?'long':'short',entryTime:t.entry_time/1000,entryPrice:state.position_avg_price,quantity:Math.abs(state.position_size),unrealizedProfit:state.openprofit};}out.strategy=r;
   out.warnings.push('Historical broker simulation on supplied OHLCV, not live execution. Results depend on fill assumptions, history and configured costs; corporate actions and liquidity may differ. Net profit uses closed trades; equity also includes open P/L.');
   if(['futures','option'].includes(context.type??'')&&context.pointValue===undefined)out.warnings.push('Contract point value was not supplied; strategy calculations use a unit point value of 1. Verify contract multipliers before interpreting monetary results.');
  }
  if(/\brequest\./.test(clean))out.warnings.push('Security requests use the connected market-data feed. lookahead_on is accepted only with explicit historical offsets. Sessions and prices follow the requested symbol metadata; different feeds can differ from TradingView.');
  if(/\btime_close\b|\brequest\./.test(clean))out.warnings.push('Daily close times follow the supplied exchange session. Weekly/monthly session closes are calendar estimates; exchange holidays and early closes are not supplied.');
  if(/\bbarstate\.|\bvarip\b/.test(clean))out.warnings.push('The editor reruns a supplied candle snapshot. Closed bars and replay are historical; a developing final bar is realtime. Intrabar varip persistence and tick-by-tick rollback are not simulated.');
  out.warnings.push('PineTS native Pine compatibility is experimental; this is an independent runtime, not TradingView.');
  out.warnings=[...new Set(out.warnings)];
  return out;
 }catch(error){return {...out,plots:[],levels:[],levelStyles:[],alerts:[],visuals:[],strategy:null,error:error instanceof Error?error.message:'Script execution failed'};}
}
