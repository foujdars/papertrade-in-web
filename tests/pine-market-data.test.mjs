import test from 'node:test';
import assert from 'node:assert/strict';
import {createPineMarketData,pineFeedTimeframe,pineTimeframe} from '../lib/pine-market-data.ts';
const instrument={symbol:'TEST',exchange:'NSE',instrumentKey:'NSE_EQ|TEST'};
test('Pine timeframes map only to known feed intervals',()=>{
 assert.equal(pineFeedTimeframe('60'),'1H');assert.equal(pineTimeframe('5m'),'5');
 for(const timeframe of ['toString','__proto__','constructor','https://example.com','10S'])assert.throws(()=>pineFeedTimeframe(timeframe));
});
test('dataset boundary rejects invalid symbols, intervals and replay before any fetch',async()=>{
 let calls=0;const saved=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('unexpected request');};
 try{
  const data=createPineMarketData(instrument,new AbortController().signal);
  await assert.rejects(data({symbol:'https://example.com',timeframe:'D'}),/Invalid Pine symbol/);
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
  assert.deepEqual(first.candles.map(c=>c.time),[10,20]);assert.deepEqual(second.candles.map(c=>c.time),[20]);assert.equal(calls.length,1);
  assert.match(calls[0][0],/^\/api\/upstox\/candles\?/);assert.match(calls[0][0],/timeframe=1H/);assert.equal(calls[0][1].signal,controller.signal);
 }finally{globalThis.fetch=saved;}
});

test('cross-symbol lookup uses exact exchange-qualified directory matches and forwards symbol metadata',async()=>{
 const row={time:1700000000,open:10,high:12,low:9,close:11,volume:100};
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url==='/api/upstox/instruments'?{ok:true,instruments:[{symbol:'INFY',exchange:'NSE',instrumentKey:'NSE_EQ|INE009A01021',name:'Infosys'}]}:{ok:true,candles:[row]}};};
 try{
  const data=createPineMarketData(instrument,new AbortController().signal);
  const result=await data({symbol:'NSE:INFY',timeframe:'D'});
  assert.equal(result.symbolInfo.symbol,'NSE:INFY');assert.equal(result.symbolInfo.currency,'INR');assert.equal(result.symbolInfo.timezone,'Asia/Kolkata');assert.equal(result.symbolInfo.type,'stock');
  assert.match(calls[1],/instrumentKey=NSE_EQ%7CINE009A01021/);
  await assert.rejects(data({symbol:'BSE:INFY',timeframe:'D'}),/No exact BSE:INFY/);
  await assert.rejects(data({symbol:'NASDAQ:INFY',timeframe:'D'}),/does not supply exchange/);
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=saved;}
});

test('known index and Delta contracts use their own connected feeds and sessions',async()=>{
 const row={time:1700000000,open:10,high:12,low:9,close:11,volume:100};
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('mode=catalog')?{ok:true,instruments:[{symbol:'BTCUSD',exchange:'DELTA',instrumentKey:'DELTA|BTCUSD',name:'Bitcoin perpetual',assetType:'FUTURE',underlyingSymbol:'BTC'}]}:{ok:true,candles:[row]}};};
 try{
  const data=createPineMarketData(instrument,new AbortController().signal);
  const index=await data({symbol:'NSE:NIFTY',timeframe:'D'});assert.equal(index.symbolInfo.type,'index');assert.match(calls[0],/NSE_INDEX%7CNifty\+50/);
  const crypto=await data({symbol:'DELTA:BTCUSD',timeframe:'60'});assert.equal(crypto.symbolInfo.currency,'USD');assert.equal(crypto.symbolInfo.baseCurrency,'BTC');assert.equal(crypto.symbolInfo.timezone,'UTC');assert.equal(crypto.symbolInfo.session,'24x7');assert.equal(crypto.symbolInfo.type,'futures');assert.match(calls[2],/^\/api\/global-markets\?symbol=BTCUSD&mode=candles&timeframe=1H/);
 }finally{globalThis.fetch=saved;}
});

test('dataset cache budgets count symbol and timeframe pairs, not timeframe alone',async()=>{
 const saved=globalThis.fetch;let candleRequests=0;
 globalThis.fetch=async url=>({ok:true,json:async()=>url==='/api/upstox/instruments'?{ok:true,instruments:Array.from({length:9},(_,i)=>({symbol:`TEST${i}`,exchange:'NSE',instrumentKey:`NSE_EQ|INE0000000${i}`,name:`Test ${i}`}))}:(candleRequests++,{ok:true,candles:[{time:1700000000,open:10,high:12,low:9,close:11,volume:100}]})});
 try{
  const data=createPineMarketData(instrument,new AbortController().signal);
  for(let i=0;i<8;i++)await data({symbol:`NSE:TEST${i}`,timeframe:'D'});
  await assert.rejects(data({symbol:'NSE:TEST8',timeframe:'D'}),/at most eight/);assert.equal(candleRequests,8);
 }finally{globalThis.fetch=saved;}
});
