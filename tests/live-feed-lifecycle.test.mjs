import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/upstox-live-feed.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({autoOpen=true,loadFailures=0,initialPayload}={}){
 const sockets=[],timers=new Map();let id=0,loads=0;
 class Socket extends EventTarget {
  static OPEN=1;static CONNECTING=0;readyState=0;
  constructor(){super();sockets.push(this);if(autoOpen)queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}
  frame(payload){this.dispatchEvent(new MessageEvent('message',{data:new TextEncoder().encode(JSON.stringify(payload))}));}
  send(){if(initialPayload)this.frame(initialPayload);} close(){if(this.readyState===3)return;this.readyState=3;this.dispatchEvent(new Event('close'));}
 }
 const exports={};
 new Function('require','exports','WebSocket','fetch','setTimeout','clearTimeout',js)(
  ()=>({load:async()=>{if(loads++<loadFailures)throw new Error('temporary schema failure');return{lookupType:()=>({decode:bytes=>JSON.parse(new TextDecoder().decode(bytes)),toObject:value=>value})}}}),exports,Socket,
  async()=>({ok:true,json:async()=>({ok:true,authorizedRedirectUri:'wss://example.invalid'})}),
  (fn,ms)=>{assert.equal(ms,15000);timers.set(++id,fn);return id;},key=>timers.delete(key));
 return {open:exports.openUpstoxLiveFeed,sockets,timers};
}
test('intentional close does not schedule another reconnect; network disconnect does',async()=>{
 const h=harness();let disconnected=0;const controller=new AbortController();
 const options={instrumentKey:'TEST',signal:controller.signal,onTick:()=>{},onDisconnect:()=>disconnected++};
 const close=await h.open(options);assert.equal(h.timers.size,0);close();assert.equal(disconnected,0);
 await h.open(options);h.sockets[1].close();assert.equal(disconnected,1);
 await h.open(options);controller.abort();assert.equal(disconnected,1);
});
test('stuck websocket handshake times out and releases listeners',async()=>{
 const h=harness({autoOpen:false});const pending=h.open({instrumentKey:'TEST',signal:new AbortController().signal,onTick:()=>{},onDisconnect:()=>{}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.timers.size,1);
 [...h.timers.values()][0]();await assert.rejects(pending,/Unable to open/);assert.equal(h.timers.size,0);assert.equal(h.sockets[0].readyState,3);
});
test('temporary schema load failure is retryable, not cached forever',async()=>{
 const h=harness({loadFailures:1});const options={instrumentKey:'TEST',signal:new AbortController().signal,onTick:()=>{},onDisconnect:()=>{}};
 await assert.rejects(h.open(options),/temporary schema failure/);const close=await h.open(options);assert.equal(h.sockets.length,1);close();
});

test('initial subscription quote is delivered and queued frames after close are ignored',async()=>{
 const payload={feeds:{TEST:{ltpc:{ltp:123,ltt:1789610400000}}}};
 const h=harness({initialPayload:payload});const ticks=[];
 const close=await h.open({instrumentKey:'TEST',signal:new AbortController().signal,onTick:tick=>ticks.push(tick),onDisconnect:()=>{}});
 assert.deepEqual(ticks,[{instrumentKey:'TEST',price:123,timestampMs:1789610400000}]);
 h.sockets[0].frame(payload);close();await new Promise(resolve=>setImmediate(resolve));assert.equal(ticks.length,1);
});

test('feed timestamps are preserved and missing/invalid dates never become fresh trades',async()=>{
 const h=harness();const ticks=[];
 const close=await h.open({instrumentKey:'TEST',signal:new AbortController().signal,onTick:tick=>ticks.push(tick),onDisconnect:()=>{}});
 for(const ltt of [undefined,0,-1,'invalid',1789610400,1789610400000,1789610400000000])h.sockets[0].frame({feeds:{TEST:{ltpc:{ltp:123,ltt}}}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(ticks.length,3);assert.ok(ticks.every(tick=>tick.timestampMs===1789610400000));close();
});
