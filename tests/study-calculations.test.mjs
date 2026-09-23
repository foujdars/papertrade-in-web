import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDIES,studyDefaults,normalizeStudy,studyTitle} from '../lib/indicator-catalog.ts';
import {computeStudy,relativeStrength,average} from '../lib/study-calculations.ts';
const candles=Array.from({length:650},(_,i)=>{const close=100+i*.03+5*Math.sin(i/11)+2*Math.cos(i/3);return {time:1720000000+i*300,open:close+Math.sin(i),high:close+2,low:close-2,close,volume:1000+i%33*50};});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('volume defaults to a nine-candle average with independently configurable bar colours',()=>{
 const config=studyDefaults('volume');assert.equal(config.inputs.length,9);assert.equal(studyTitle('volume',config),'Volume SMA 9');assert.notEqual(config.colors[0],config.colors[1]);assert.notEqual(config.colors[1],config.colors[2]);
});
test('every selectable candle study has a real calculation and finite plots',()=>{
 assert.equal(new Set(STUDIES.map(s=>s.id)).size,STUDIES.length);
 for(const s of STUDIES){if(s.unavailable||['smc','vpvr'].includes(s.id))continue;const config=studyDefaults(s.id);config.comparisonKey='NSE_EQ|TEST';const result=computeStudy(s.id,candles,config,candles);assert.ok(result.plots.length,s.id);assert.equal(result.message,undefined,s.id);for(const p of result.plots){assert.equal(p.values.length,candles.length,s.id+':'+p.name);assert.ok(p.values.some(Number.isFinite),s.id+':'+p.name);assert.ok(!p.values.some(v=>v===Infinity||v===-Infinity),s.id);}}
});
test('past calculations do not read future candles (confirmed/revising drawings excluded)',()=>{
 for(const s of STUDIES){if(s.unavailable||['smc','vpvr','zigzag','fractals'].includes(s.id))continue;const prefix=computeStudy(s.id,candles.slice(0,400),studyDefaults(s.id)),full=computeStudy(s.id,candles,studyDefaults(s.id));for(let j=0;j<prefix.plots.length;j++)assert.deepEqual(full.plots[j].values.slice(0,400),prefix.plots[j].values,s.id);}
});
test('RSI uses Wilder seeding and smoothing, including flat/rising/falling cases',()=>{
 const values=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
 const r=relativeStrength(values,14);assert.ok(r.slice(0,14).every(Number.isNaN));near(r[14],70.464135,1e-5);near(r[15],66.249619,1e-5);
 assert.equal(relativeStrength(Array(30).fill(10),14).at(-1),50);assert.equal(relativeStrength(Array.from({length:30},(_,i)=>i),14).at(-1),100);assert.equal(relativeStrength(Array.from({length:30},(_,i)=>30-i),14).at(-1),0);
});
test('ADX warmup and two independent lengths; DMI trend direction',()=>{
 const data=candles.map((b,i)=>({...b,open:100+i,close:101+i,high:102+i,low:100+i}));const result=computeStudy('dmi',data,studyDefaults('dmi'));assert.ok(result.plots[0].values.slice(0,27).every(Number.isNaN));near(result.plots[0].values[27],100);near(result.plots[1].values.at(-1),50);near(result.plots[2].values.at(-1),0);
 const changed=studyDefaults('adx');changed.inputs.smooth=7;assert.ok(Number.isFinite(computeStudy('adx',data,changed).plots[0].values[20]));
});
test('moving averages warm up; RSI smoothing is optional and settings affect values',()=>{
 assert.deepEqual(average([1,2,3,4,5],3).slice(2),[2,3,4]);assert.deepEqual(average([1,2,3,4,5],3,'EMA').slice(2),[2,3,4]);
 const c=studyDefaults('rsi');assert.equal(computeStudy('rsi',candles,c).plots.length,2);c.smoothing='None';assert.equal(computeStudy('rsi',candles,c).plots.length,1);c.inputs.length=7;assert.notEqual(computeStudy('rsi',candles,c).plots[0].values.at(-1),computeStudy('rsi',candles,studyDefaults('rsi')).plots[0].values.at(-1));
});
test('no made-up volume or breadth; zero denominators never make infinity',()=>{
 for(const s of STUDIES.filter(s=>s.volume)){const result=computeStudy(s.id,candles.map(b=>({...b,volume:0})),studyDefaults(s.id));assert.match(result.message,/volume.*unavailable/);assert.equal(result.plots.length,0);}
 for(const s of STUDIES.filter(s=>s.unavailable))assert.equal(computeStudy(s.id,candles,studyDefaults(s.id)).plots.length,0);
 const flat=candles.map(b=>({...b,open:100,high:100,low:100,close:100}));for(const s of STUDIES)for(const p of computeStudy(s.id,flat,studyDefaults(s.id)).plots)assert.ok(!p.values.some(v=>v===Infinity||v===-Infinity),s.id);
});
test('settings sanitize numeric bounds, colour injection, visibility and sources',()=>{
 assert.equal(normalizeStudy('ema',Object.freeze({})).showValue,false);assert.equal(normalizeStudy('rsi',{}).showValue,true);
 const c=normalizeStudy('rsi',{inputs:{length:-5,smooth:Infinity},source:'malicious',colors:['url(test)','#123456'],timeframes:['5m','bad'],width:99,opacity:500});assert.equal(c.inputs.length,1);assert.equal(c.inputs.smooth,14);assert.equal(c.source,'close');assert.equal(c.colors[1],'#123456');assert.equal(c.width,1);assert.equal(c.opacity,100);assert.deepEqual(c.timeframes,['5m']);
});
test('comparison studies require exact timestamps, exclude forming bars and never forward-fill gaps',()=>{
 const other=candles.map(b=>({...b,close:b.close*2,high:b.high*2,low:b.low*2,open:b.open*2}));
 for(const id of ['ratio','spread','correlation','correlation-log']){
  const c=studyDefaults(id);assert.match(computeStudy(id,candles,c,other).message,/Choose/);c.comparisonKey='NSE_EQ|TEST';
  const out=computeStudy(id,candles,c,other).plots[0].values;assert.ok(Number.isNaN(out.at(-1)));if(id==='ratio')near(out[100],.5);if(id==='spread')near(out[100],-candles[100].close);if(id.startsWith('correlation'))near(out[100],1);
  const gap=computeStudy(id,candles,c,other.filter((_,i)=>i!==100)).plots[0].values;assert.ok(Number.isNaN(gap[100]));assert.equal(computeStudy(id,candles,c,[]).plots.length,0);
 }
});
test('SMI Ergodic uses a unit ratio, not TSI percentage scaling',()=>{
 const c=studyDefaults('smi'),t=studyDefaults('tsi');t.inputs={...c.inputs};near(computeStudy('smi',candles,c).plots[0].values.at(-1)*100,computeStudy('tsi',candles,t).plots[0].values.at(-1));
});
