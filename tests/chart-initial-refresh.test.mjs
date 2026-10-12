import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { exponentialBackoffMs } from '../lib/reconnect-backoff.ts';
const source = ts.createSourceFile('MarketChart.tsx',await readFile('components/MarketChart.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
(function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('async function loadUpstoxCandles'))effect=node.arguments[0].getText(source);ts.forEachChild(node,visit);})(source);
const js=ts.transpileModule(`const effect=${effect};return effect();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function value(t,name,next){const previous=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:next});t.after(()=>previous?Object.defineProperty(globalThis,name,previous):delete globalThis[name]);}
function harness(t){
 const document=new EventTarget(),window=new EventTarget(),requests=[],deadlines=[],timers=new Map(),status=[],paint=[];
 document.hidden=false;window.requestAnimationFrame=fn=>fn();window.setTimeout=(fn,ms)=>{timers.set(fn,ms);return fn;};window.clearTimeout=fn=>timers.delete(fn);
 value(t,'document',document);value(t,'window',window);
 t.mock.method(AbortSignal,'timeout',ms=>{const controller=new AbortController();deadlines.push({controller,ms});return controller.signal;});
 t.mock.method(globalThis,'fetch',(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,scope:new URL(url,'http://test').searchParams.get('scope'),resolve:(body,code=200)=>resolve(Response.json(body,{status:code}))});options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});}));
 const dataRef={current:[]},noop=()=>{};
 const inputs={isReplay:false,externalFeed:false,historyRequest:null,dataRef,onFeedStatusRef:{current:s=>status.push(s)},instrument:{instrumentKey:'NSE_INDEX|Nifty 50'},timeframe:'1D',lastLiveTickRef:{current:null},reconcileLiveCandles:(a,b)=>[...a,...b],rememberChartCandles:noop,setLatestCandle:noop,paintPriceSeries:()=>paint.push(dataRef.current.length),applyInitialVisibleRange:noop,restoreDrawings:noop,storedDrawingsRef:{current:[]},scheduleOverlayRefresh:noop,syncIndicatorData:noop,setFeedMode:noop,exponentialBackoffMs};
 const stop=new Function(...Object.keys(inputs),js)(...Object.values(inputs));
 return {document,window,requests,deadlines,timers,status,paint,stop};
}
const candles=[{time:100,open:100,high:102,low:99,close:101,volume:100}];
test('first verified history paints while intraday is stuck; only the missing segment retries',async t=>{
 const h=harness(t);try{
  assert.equal(h.requests.length,2);assert.ok(h.deadlines.every(d=>d.ms===12000));
  h.requests.find(r=>r.scope==='historical').resolve({ok:true,candles});await settle();
  assert.deepEqual(h.paint,[1],'Paint before the slow sibling returns');
  h.deadlines[1].controller.abort(new DOMException('Timeout','TimeoutError'));await settle();
  assert.equal(h.status.at(-1).mode,'stale');assert.equal(h.timers.size,1);
  h.window.dispatchEvent(new Event('online'));assert.equal(h.requests.length,3);assert.equal(h.requests[2].scope,'intraday');
  h.requests[2].resolve({ok:true,candles:[{...candles[0],time:200}]});await settle();assert.equal(h.status.at(-1).mode,'live');
 }finally{h.stop();}
});
test('an empty chart exits loading after deadlines and recovers immediately on reconnect',async t=>{
 const h=harness(t);try{
  h.deadlines.forEach(d=>d.controller.abort(new DOMException('Timeout','TimeoutError')));await settle();
  assert.equal(h.status.at(-1).mode,'error');assert.equal(h.paint.length,0);
  h.window.dispatchEvent(new Event('online'));assert.equal(h.requests.length,4);
  h.requests.slice(2).forEach(r=>r.resolve({ok:true,candles}));await settle();assert.equal(h.status.at(-1).mode,'live');
 }finally{h.stop();}
});
test('reconnect cannot bypass a provider rate limit or write a disposed chart',async t=>{
 let now=10000;t.mock.method(Date,'now',()=>now);const h=harness(t);try{
  h.requests.forEach(r=>r.resolve({ok:false,error:{code:'RATE_LIMITED',retryAfterSeconds:60}},429));await settle();
  h.window.dispatchEvent(new Event('online'));assert.equal(h.requests.length,2);assert.equal(h.timers.size,1);
  now+=60001;h.window.dispatchEvent(new Event('online'));assert.equal(h.requests.length,4);
  h.stop();h.requests.slice(2).forEach(r=>r.resolve({ok:true,candles}));await settle();assert.deepEqual(h.paint,[]);
 }finally{h.stop();}
});
