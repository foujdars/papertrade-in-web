import { PineTS, type Context, type IProvider } from 'pinets';

type EmaState={index:number;previous:number|null;current:number|null};
type EmaContext=Pick<Context,'idx'|'taState'|'precision'>;
const current=(value:unknown):unknown=>value&&typeof value==='object'&&'get' in value&&typeof value.get==='function'?value.get(0):value;

/** TradingView's v6 reference initializes EMA from the first source sample.
 * PineTS 0.11.1 initializes it with an SMA. Keep the correction isolated from
 * RMA (which does use an SMA seed), and preserve the tentative/committed state
 * boundary so replacing a developing bar cannot count that bar twice. */
export function createCompatiblePineEma(context:EmaContext) {
 return (source:unknown,length:unknown,callId?:string):number=>{
  const period=current(length);
  if(typeof period!=='number'||!Number.isInteger(period)||period<1)throw new Error('ta.ema length must be a positive integer');
  const key=`__papertrade_ema_v1_${callId??period}`;
  context.taState??={};
  const state:EmaState=context.taState[key]??(context.taState[key]={index:-1,previous:null,current:null});
  if(context.idx>state.index){state.previous=state.current;state.index=context.idx;}
  const sample=current(source);
  if(typeof sample!=='number'||!Number.isFinite(sample)){
   state.current=state.previous;
   // Ignore a missing observation, retaining the last accumulated average.
   // Before the first finite sample there is no average to carry forward.
   return state.current===null?NaN:context.precision(state.current);
  }
  const alpha=2/(period+1);
  state.current=state.previous===null?sample:alpha*sample+(1-alpha)*state.previous;
  return context.precision(state.current);
 };
}

// Version-pinned integration point, verified against PineTS 0.11.1. Applying
// only to registered providers keeps third-party PineTS callers untouched.
// Secondary security contexts inherit the provider, so they receive the same
// calculation as the chart. Re-audit this hook when upgrading PineTS.
const enabledProviders=new WeakSet<object>();
type ContextFactory={_initializeContext:(...args:unknown[])=>Context};
let installed=false;
export function enablePineRuntimeCompatibility(provider:IProvider) {
 if(!installed){
  const prototype=PineTS.prototype as unknown as ContextFactory;
  const original=prototype._initializeContext;
  if(typeof original!=='function')throw new Error('The PineTS compatibility adapter needs review for this runtime version');
  prototype._initializeContext=function(...args:unknown[]){
   const context=original.apply(this,args);
   if(enabledProviders.has(context.source))context.pine.ta.ema=createCompatiblePineEma(context);
   return context;
  };
  installed=true;
 }
 enabledProviders.add(provider);
}
