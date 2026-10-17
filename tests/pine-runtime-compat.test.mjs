import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PineTS} from 'pinets';
import {createCompatiblePineEma} from '../lib/pine-runtime-compat.ts';
import {runAdvancedPineScript} from '../lib/pine-runtime.ts';
const rows=[10,20,30,40,50].map((close,i)=>({time:1700000100+i*60,open:close,high:close+1,low:close-1,close,volume:100}));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('compatibility context seam is pinned to the audited PineTS release',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.resolve('pinets')),'utf8'));
 assert.equal(pkg.version,'0.11.1','Review the context hook before updating PineTS');
 assert.equal(typeof PineTS.prototype._initializeContext,'function');
});

test('EMA first-sample seed, independent calls, missing observations and replacement ticks',()=>{
 const context={idx:0,taState:{},precision:value=>value},ema=createCompatiblePineEma(context);
 assert.ok(Number.isNaN(ema(NaN,3,'a')));assert.equal(ema(100,3,'b'),100);
 context.idx=1;assert.equal(ema(10,3,'a'),10);assert.equal(ema(200,3,'b'),150);
 context.idx=2;assert.equal(ema(NaN,3,'a'),10);assert.equal(ema(300,3,'b'),225);
 context.idx=3;assert.equal(ema(20,3,'a'),15);
 // This is a replacement observation on the same developing bar, not an extra sample.
 assert.equal(ema(30,3,'a'),20);assert.equal(ema(40,3,'a'),25);
 context.idx=4;assert.equal(ema(50,3,'a'),37.5);
 assert.throws(()=>ema(1,0,'bad'),/positive integer/);
});

test('native EMA and delegated MACD use distinct call-site state with documented seed',async()=>{
 const r=await runAdvancedPineScript(`//@version=6
indicator("EMA reference")
plot(ta.ema(close,3),"Close EMA")
plot(ta.ema(close*2,3),"Double EMA")
[main,signal,hist]=ta.macd(close,2,3,2)
plot(main,"MACD")
plot(signal,"Signal")
plot(hist,"Histogram")`,rows,{}, {timeframe:'1'});
 assert.equal(r.error,null);assert.deepEqual(r.plots[0].values,[10,15,22.5,31.25,40.625]);assert.deepEqual(r.plots[1].values,[20,30,45,62.5,81.25]);
 let fast=10,slow=10,signal=0;for(let i=0;i<rows.length;i++){
  if(i){fast=rows[i].close*2/3+fast/3;slow=rows[i].close*.5+slow*.5;signal=(fast-slow)*2/3+signal/3;}
  near(r.plots[2].values[i],fast-slow);near(r.plots[3].values[i],signal);near(r.plots[4].values[i],fast-slow-signal);
 }
});

test('security secondary contexts apply the same EMA correction as the chart',async()=>{
 const chart=Array.from({length:15},(_,i)=>({...rows[0],time:1700000100+i*60}));
 const higher=rows.slice(0,3).map((c,i)=>({...c,time:1700000100+i*300}));
 const r=await runAdvancedPineScript('//@version=6\nindicator("MTF EMA")\nplot(request.security(syminfo.tickerid,"5",ta.ema(close,3)[1],lookahead=barmerge.lookahead_on))',chart,{}, {symbol:'NSE:X',timeframe:'1'},async()=>higher);
 assert.equal(r.error,null);assert.ok(r.plots[0].values.slice(0,5).every(Number.isNaN));assert.deepEqual(r.plots[0].values.slice(5),[10,10,10,10,10,15,15,15,15,15]);
});

test('native EMA ignores na observations without poisoning or reinitializing its state',async()=>{
 const r=await runAdvancedPineScript('//@version=6\nindicator("Missing observations")\nplot(ta.ema(bar_index==0 or bar_index==2?na:close,3))',rows,{}, {timeframe:'1'});
 assert.equal(r.error,null);assert.ok(Number.isNaN(r.plots[0].values[0]));assert.deepEqual(r.plots[0].values.slice(1),[20,20,30,40]);
});

test('compatibility registration leaves unrelated PineTS providers unchanged',async()=>{
 const adapted=await runAdvancedPineScript('//@version=6\nindicator("Adapted")\nplot(ta.ema(close,3))',rows,{}, {timeframe:'1'});
 assert.equal(adapted.error,null);assert.equal(adapted.plots[0].values[0],10);
 const unrelated=new PineTS(rows.map(c=>({...c,openTime:c.time*1000,closeTime:(c.time+60)*1000})), 'OTHER','1');
 const result=await unrelated.run('//@version=6\nindicator("Unregistered")\nplot(ta.ema(close,3),"Average")');
 assert.ok(Number.isNaN(result.plots.Average.data[0].value));
 assert.equal(result.plots.Average.data[2].value,20);
});

test('bare, qualified and metadata chart aliases share supplied replay history without fetching',async()=>{
 for(const expression of ['"TEST"','"NSE:TEST"','""','syminfo.ticker','syminfo.tickerid']){
  const r=await runAdvancedPineScript(`//@version=6
indicator("Replay alias")
plot(request.security(${expression},"1",ta.ema(close,3)),"Average")
values=request.security_lower_tf(symbol=${expression},timeframe="1",expression=close)
plot(array.get(values,0),"Close")`,rows,{}, {symbol:'NSE:TEST',timeframe:'1',replay:true},async()=>{throw new Error('A chart alias must not fetch a new dataset');});
  assert.equal(r.error,null,expression);assert.deepEqual(r.plots[0].values,[10,15,22.5,31.25,40.625]);assert.deepEqual(r.plots[1].values,rows.map(c=>c.close));
 }
});

test('canonicalizing a chart alias never substitutes an explicitly different exchange',async()=>{
 const requested=[];
 const r=await runAdvancedPineScript('//@version=6\nindicator("Distinct exchanges")\nplot(request.security("TEST","1",close),"Chart")\nplot(request.security("BSE:TEST","1",close),"Other exchange")',rows,{}, {symbol:'NSE:TEST',timeframe:'1'},async symbol=>{
  requested.push(symbol);return {candles:rows.map(c=>({...c,open:c.open+100,high:c.high+100,low:c.low+100,close:c.close+100})),symbolInfo:{symbol,currency:'INR',session:'0915-1530',timezone:'Asia/Kolkata'}};
 });
 assert.equal(r.error,null);assert.deepEqual(requested,['BSE:TEST']);assert.deepEqual(r.plots[0].values,rows.map(c=>c.close));assert.deepEqual(r.plots[1].values,rows.map(c=>c.close+100));
});
