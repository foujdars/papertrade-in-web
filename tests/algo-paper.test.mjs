import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlgoPaperSession, advanceAlgoPaperSession, pauseAlgoPaperSession, resumeAlgoPaperSession, stopAlgoPaperSession, restoreAlgoPaperSession } from '../lib/algo-paper.ts';
const at = Date.parse('2026-10-16T04:00:00Z');
const plan = () => ({name:'Test',legs:[{id:'one',instrumentKey:'NSE_EQ|ONE',symbol:'ONE',side:'BUY',quantity:10,stopPercent:2,targetPercent:3}],entryTime:'09:20',exitTime:'15:15',maxLoss:1000,maxProfit:1000,capital:100000,feePerOrder:2,slippageBps:10});
const quote = (price=100,now=at,key='NSE_EQ|ONE') => ({[key]:{instrumentKey:key,price,observedAt:now,tradedAt:now}});
const options = {marketOpen:true,signalReady:true};
const create = (p=plan())=>createAlgoPaperSession(p,'market',at,'test');
test('virtual fills apply adverse slippage and both entry and exit fees once',()=>{
  let s=advanceAlgoPaperSession(create(),quote(),at,options);
  assert.equal(s.positions[0].entryPrice,100.1);assert.equal(s.netPnl,-3);
  s=advanceAlgoPaperSession(stopAlgoPaperSession(s,at+1000),quote(110,at+2000),at+2000,options);
  assert.equal(s.trades.length,1);assert.equal(s.trades[0].exitPrice,109.89);
  assert.equal(s.trades[0].fees,4);assert.equal(s.netPnl,93.9);assert.equal(s.equity,100093.9);assert.equal(s.status,'stopped');
});
test('all legs need fresh exact quotes before any entry or close',()=>{
  const p=plan();p.legs.push({...p.legs[0],id:'two',instrumentKey:'NSE_FO|TWO',symbol:'TWO',side:'SELL'});
  let s=advanceAlgoPaperSession(create(p),quote(),at,options);assert.equal(s.positions.length,0);
  const q={...quote(),...quote(120,at,'NSE_FO|TWO')};
  s=advanceAlgoPaperSession(s,q,at+1000,options);assert.equal(s.positions.length,2);
  const pending=stopAlgoPaperSession(s,at+2000);
  s=advanceAlgoPaperSession(pending,q,at+30000,options);assert.equal(s.positions.length,2);assert.equal(s.trades.length,0);assert.equal(s.status,'stopping');
  s=advanceAlgoPaperSession(s,{...quote(101,at+31000),...quote(119,at+31000,'NSE_FO|TWO')},at+31000,options);
  assert.equal(s.trades.length,2);assert.equal(s.status,'stopped');
});
test('stale traded price cannot fill even with a fresh observation',()=>{
  const q=quote();q['NSE_EQ|ONE'].tradedAt=at-61_000;
  assert.equal(advanceAlgoPaperSession(create(),q,at,options).positions.length,0);
  assert.equal(advanceAlgoPaperSession(create(),quote(),at,{...options,marketOpen:false}).positions.length,0);
  assert.equal(advanceAlgoPaperSession(create(),quote(),at,{...options,signalReady:false}).positions.length,0);
});
test('scheduled exit closes once and repeated polls cannot duplicate fills',()=>{
  let s=advanceAlgoPaperSession(create(),quote(),at,options);
  const exit=Date.parse('2026-10-16T09:45:00Z');
  s=advanceAlgoPaperSession(s,quote(101,exit),exit,options);assert.equal(s.trades[0].reason,'Scheduled exit');
  assert.deepEqual(advanceAlgoPaperSession(s,quote(104,exit+5000),exit+5000,options),s);
});
test('leg and basket stops use current observed prices after a gap',()=>{
  let s=advanceAlgoPaperSession(create(),quote(),at,options);
  s=advanceAlgoPaperSession(s,quote(90,at+1000),at+1000,options);
  assert.equal(s.trades[0].reason,'Leg stop loss');assert.equal(s.trades[0].exitPrice,89.91);
  const p=plan();p.maxLoss=50;p.legs[0].stopPercent=0;
  s=advanceAlgoPaperSession(create(p),quote(),at,options);
  s=advanceAlgoPaperSession(s,quote(94,at+1000),at+1000,options);
  assert.equal(s.trades[0].reason,'Basket stop loss');
});
test('pause stops monitoring; resume requires observations, reload never auto-runs',()=>{
  let s=advanceAlgoPaperSession(create(),quote(),at,options);
  const paused=pauseAlgoPaperSession(s,at+1000);
  assert.deepEqual(advanceAlgoPaperSession(paused,quote(90,at+2000),at+2000,options),paused);
  s=resumeAlgoPaperSession(paused,at+3000);
  assert.equal(advanceAlgoPaperSession(s,quote(90,at+3000),at+3000,options).trades.length,1);
  const restored=restoreAlgoPaperSession(paused);assert.equal(restored.status,'paused');assert.equal(restored.positions.length,1);
  assert.equal(restoreAlgoPaperSession({...paused,positions:[{...paused.positions[0],quantity:5000}]}),null);
});
test('virtual capital and expired entry windows block new entries',()=>{
  const p=plan();p.capital=500;
  let s=advanceAlgoPaperSession(create(p),quote(),at,options);assert.equal(s.positions.length,0);assert.equal(s.status,'paused');
  const late=Date.parse('2026-10-16T09:46:00Z');
  s=advanceAlgoPaperSession(create(),quote(100,late),late,options);assert.equal(s.status,'stopped');assert.equal(s.positions.length,0);
  assert.throws(()=>create({...plan(),slippageBps:-1}),/Invalid/);
  assert.throws(()=>create({...plan(),entryTime:'15:20',exitTime:'09:30'}),/entry and exit/);
});
