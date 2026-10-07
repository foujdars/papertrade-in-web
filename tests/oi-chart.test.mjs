import test from 'node:test';
import assert from 'node:assert/strict';
import { oiLevels, nearbyOiStrikes, oiChartScale } from '../lib/oi-chart.ts';
const row = (strike, call, put) => ({ strike, call: { oi: call, change: null }, put: { oi: put, change: null } });
test('levels use full-chain OI and max pain matches independently evaluated settlement payout', () => {
  const rows = [row(100,10,80),row(110,20,30),row(120,90,10),row(130,30,5)];
  const payouts = rows.map(({strike}) => rows.reduce((n,r) => n + Math.max(0,strike-r.strike)*r.call.oi + Math.max(0,r.strike-strike)*r.put.oi,0));
  assert.deepEqual(oiLevels(rows,115),{support:100,resistance:120,maxPain:rows[payouts.indexOf(Math.min(...payouts))].strike});
  assert.equal(oiLevels([row(100,null,10),row(110,20,20)],105).maxPain,null);
  assert.equal(oiLevels([row(100,null,10),row(110,20,20)],105).resistance,null);
  assert.equal(oiLevels([row(100,0,0)],100).support,null);
});
test('equal peaks select the closest spot; empty or missing data never fabricates levels', () => {
  assert.deepEqual(oiLevels([row(100,10,10),row(110,10,10)],109),{support:110,resistance:110,maxPain:110});
  assert.deepEqual(oiLevels([],null),{support:null,resistance:null,maxPain:null});
});
test('nearby strikes centre on spot and remain populated at either chain boundary', () => {
  const rows=Array.from({length:30},(_,i)=>row(100+i*10,1,1));
  assert.equal(nearbyOiStrikes(rows,250)[5].strike,250);
  assert.equal(nearbyOiStrikes(rows,99).length,11);
  assert.equal(nearbyOiStrikes(rows,1000).at(-1).strike,390);
  assert.equal(nearbyOiStrikes(rows,null)[5].strike,250);
  rows[29].call.oi=100;
  assert.equal(oiLevels(rows,250).resistance,390);
  assert.ok(!nearbyOiStrikes(rows,250).some(r=>r.strike===390),'off-screen levels remain full-chain levels');
});
test('OI change axis includes signed values and zero without wasting half the plot', () => {
  for(const values of [[100,500,null],[-500,-100],[-100,900],[0,null],[]]){
    const s=oiChartScale(values);assert.ok(s.max>s.min);assert.ok(s.ticks.includes(0));
    for(const value of values.filter(v=>v!==null))assert.ok(value>=s.min&&value<=s.max);
  }
  assert.equal(oiChartScale([-500,-100]).max,0);
  assert.equal(oiChartScale([100,500]).min,0);
});
