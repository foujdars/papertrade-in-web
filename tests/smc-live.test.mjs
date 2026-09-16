import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSmc } from '../lib/smc-learner.ts';
import { applyCandleTick, liveCandleBucket, reconcileLiveCandles, validCandleTick } from '../lib/live-candles.ts';

const at = Date.parse('2026-09-16T10:08:01+05:30');
const tick = { instrumentKey:'NSE_EQ|TEST', price:654.5, timestampMs:at };
const bar = {time:liveCandleBucket(at,'5m'),open:648,high:659,low:647.2,close:654.05,volume:500};
test('live ticks update the actual candle close and preserve open, extremes and volume',()=>{
  const result=applyCandleTick([bar],tick,'5m');
  assert.deepEqual(result[0],{...bar,close:654.5});
  assert.equal(bar.close,654.05);
  const high=applyCandleTick(result,{...tick,price:665},'5m');
  assert.equal(high[0].high,665);
  assert.equal(applyCandleTick(high,{...tick,price:640},'5m')[0].low,640);
});
test('rollover appends one correctly aligned candle; old bars are not rewritten by old ticks',()=>{
  const later={...tick,timestampMs:at+5*60000,price:660};
  const result=applyCandleTick([bar],later,'5m');
  assert.equal(result.length,2); assert.equal(result[1].time,bar.time+300);
  assert.equal(result[1].open,660); assert.equal(result[1].volume,0);
  assert.equal(applyCandleTick(result,tick,'5m'),result);
});
test('stale, future, wrong-symbol, duplicate and out-of-order ticks cannot drive candles',()=>{
  assert.equal(validCandleTick(tick,tick.instrumentKey,null,at),true);
  for(const bad of [{...tick,price:NaN},{...tick,price:0},{...tick,instrumentKey:'OTHER'},{...tick,timestampMs:at-91000},{...tick,timestampMs:at+6000}]) assert.equal(validCandleTick(bad,tick.instrumentKey,null,at),false);
  assert.equal(validCandleTick(tick,tick.instrumentKey,tick,at),false);
  assert.equal(validCandleTick(tick,tick.instrumentKey,{...tick,timestampMs:at+1},at),false);
});
test('delayed REST refresh cannot rewind a newer live close or its extremes',()=>{
  const live={...tick,price:670};
  const current=applyCandleTick([bar],live,'5m');
  const result=reconcileLiveCandles(current,[{...bar,volume:900}],live,'5m',at);
  assert.equal(result[0].close,670); assert.equal(result[0].high,670); assert.equal(result[0].volume,900);
  assert.equal(reconcileLiveCandles([], [bar], live,'5m',at)[0].close,670);
  assert.equal(reconcileLiveCandles(current,[{...bar,close:680}],live,'5m',at+91000)[0].close,680);
  assert.equal(reconcileLiveCandles(current,[{...bar,close:680},{...bar,time:bar.time+300}],live,'5m',at)[0].close,680);
});
test('NSE boundaries do not invent pre/post-session candles',()=>{
  assert.equal(liveCandleBucket(Date.parse('2026-09-16T08:00:00+05:30'),'5m'),null);
  assert.equal(liveCandleBucket(Date.parse('2026-09-16T16:00:00+05:30'),'5m'),null);
  assert.equal(liveCandleBucket(Date.parse('2026-09-16T15:30:00+05:30'),'5m'),Date.parse('2026-09-16T15:25:00+05:30')/1000);
  assert.equal(liveCandleBucket(at,'1D'),Date.parse('2026-09-16T00:00:00+05:30')/1000);
});
const t=Date.parse('2026-09-16T09:15:00+05:30')/1000;
const b=(i,o,h,l,c)=>({time:t+i*300,open:o,high:h,low:l,close:c,volume:100});
test('FVG is formed only after its third candle; retest and full fill differ',()=>{
  const bars=[b(0,100,102,99,101),b(1,101,108,100,107),b(2,107,110,105,109)];
  assert.equal(analyzeSmc(bars.slice(0,2)).marks.length,0);
  const gap=analyzeSmc(bars).marks.find(m=>m.kind==='FVG');
  assert.deepEqual([gap.low,gap.high,gap.confirmed],[102,105,bars[2].time]);
  assert.equal(analyzeSmc([...bars,b(3,108,109,104,107)]).marks.find(m=>m.id===gap.id).status,'touched');
  assert.equal(analyzeSmc([...bars,b(3,108,109,101,102)]).marks.find(m=>m.id===gap.id).status,'filled');
});
const closes=[100,102,104,110,106,104,100,95,98,101,104,108,111,115,112,109,105,99,94,90,92,96,100,104,110,116,120,115,108,95,85];
const structure=closes.map((c,i)=>b(i,c-.5,c+1,c-1,c));
structure[11].open=108.8;
structure[18].open=110;structure[18].high=111;
structure[19].open=110;structure[19].high=111;
test('structure breaks create OBs; close invalidation creates an opposite breaker candidate',()=>{
  const marks=analyzeSmc(structure).marks;
  assert.ok(marks.some(m=>m.kind==='BOS / BMS'));
  assert.ok(marks.some(m=>m.kind==='SMS / MSS'));
  assert.ok(marks.some(m=>m.kind==='CHoCH'));
  const ob=marks.find(m=>m.kind==='OB'&&m.origin===structure[11].time);
  assert.ok(ob); assert.equal(ob.status,'invalidated');
  const breaker=marks.find(m=>m.kind==='Breaker'&&m.origin===ob.origin);
  assert.ok(breaker); assert.equal(breaker.confirmed,ob.end); assert.notEqual(breaker.direction,ob.direction);
});
test('no look-ahead: future bars never change historical formation IDs or confirmation times',()=>{
  const full=analyzeSmc(structure).marks;
  for(let n=1;n<=structure.length;n++){
    const prefix=analyzeSmc(structure.slice(0,n)).marks;
    const known=full.filter(m=>m.confirmed<=structure[n-1].time);
    assert.deepEqual(prefix.map(m=>m.id),known.map(m=>m.id));
    for(const m of prefix) assert.ok(m.confirmed<=structure[n-1].time);
  }
});
test('equal highs/lows need confirmed pivots, and overnight gaps are excluded on intraday charts',()=>{
  const waves=[100,102,104,110,104,102,100,95,100,102,104,110,104,102,100,95,100,102,104].map((c,i)=>b(i,c,c+1,c-1,c));
  const marks=analyzeSmc(waves).marks;
  assert.ok(marks.some(m=>m.kind==='EQH')); assert.ok(marks.some(m=>m.kind==='EQL'));
  assert.equal(analyzeSmc(waves.slice(0,14)).marks.filter(m=>m.kind==='EQH').length,0);
  const gap=[b(0,100,102,99,101),b(1,101,108,100,107),{...b(2,107,110,105,109),time:t+86400}];
  assert.equal(analyzeSmc(gap,true).marks.filter(m=>m.kind==='FVG').length,0);
  assert.equal(analyzeSmc(gap,false).marks.filter(m=>m.kind==='FVG').length,1);
});
