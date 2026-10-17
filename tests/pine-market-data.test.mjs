import test from 'node:test';
import assert from 'node:assert/strict';
import {createPineMarketData,pineFeedTimeframe,pineTimeframe} from '../lib/pine-market-data.ts';
const instrument={symbol:'TEST',exchange:'NSE',instrumentKey:'NSE_EQ|TEST'};
test('Pine timeframes map only to known feed intervals',()=>{
 assert.equal(pineFeedTimeframe('60'),'1H');assert.equal(pineTimeframe('5m'),'5');
 for(const timeframe of ['toString','__proto__','constructor','https://example.com','10S'])assert.throws(()=>pineFeedTimeframe(timeframe));
});
test('dataset boundary rejects other symbols and replay before any fetch',async()=>{
 let calls=0;const saved=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('unexpected request');};
 try{
  const data=createPineMarketData(instrument,new AbortController().signal);
  await assert.rejects(data({symbol:'OTHER',timeframe:'D'}),/chart symbol only/);
  await assert.rejects(data({symbol:'TEST',timeframe:'constructor'}),/does not supply/);
  await assert.rejects(createPineMarketData(instrument,new AbortController().signal,true)({symbol:'TEST',timeframe:'D'}),/replay/);
  assert.equal(calls,0);
 }finally{globalThis.fetch=saved;}
});
test('valid requests use only candle endpoint, deduplicate and sort data, share one request',async()=>{
 const row=time=>({time,open:10,high:12,low:9,close:11,volume:100});
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({ok:true,candles:[row(20),row(10),row(20),{...row(30),high:1}]})};};
 try{
  const controller=new AbortController(),data=createPineMarketData(instrument,controller.signal);
  const [first,second]=await Promise.all([data({symbol:'TEST',timeframe:'60'}),data({symbol:'NSE:TEST',timeframe:'60',sDate:15000})]);
  assert.deepEqual(first.map(c=>c.time),[10,20]);assert.deepEqual(second.map(c=>c.time),[20]);assert.equal(calls.length,1);
  assert.match(calls[0][0],/^\/api\/upstox\/candles\?/);assert.match(calls[0][0],/timeframe=1H/);assert.equal(calls[0][1].signal,controller.signal);
 }finally{globalThis.fetch=saved;}
});
