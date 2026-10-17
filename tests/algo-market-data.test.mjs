import test from 'node:test';
import assert from 'node:assert/strict';
import { readAlgoQuote, readAlgoCandles, fetchAlgoHistory } from '../lib/algo-market-data.ts';

const now = Date.parse('2026-10-16T04:04:00Z');
const key = 'NSE_EQ|INE0PMR01017';
const quote = { instrumentKey:key,lastPrice:455,updatedAt:new Date(now).toISOString(),lastTradeAt:new Date(now-1000).toISOString() };
test('paper fills require actual fresh exchange observations and recent trades', () => {
  assert.equal(readAlgoQuote(quote,key,now)?.price,455);
  for (const change of [{lastPrice:0},{lastPrice:'455'},{instrumentKey:'wrong'},{updatedAt:new Date(now-20001).toISOString()},{lastTradeAt:new Date(now-60001).toISOString()},{updatedAt:new Date(now+2001).toISOString()},{lastTradeAt:''}]) assert.equal(readAlgoQuote({...quote,...change},key,now),null);
  // A new REST fetch cannot turn the stale 09:17 opening print into a fresh 09:34 fill.
  assert.equal(readAlgoQuote({...quote,lastPrice:490,lastTradeAt:'2026-10-16T03:47:00Z'},key,now),null);
});
const candle = {time:1792123440,open:100,high:110,low:90,close:105,volume:20};
test('history parsing rejects corrupt OHLC and conflicting duplicates', () => {
  assert.deepEqual(readAlgoCandles([candle,candle]),[candle]);
  for (const bad of [{...candle,low:106},{...candle,high:99},{...candle,open:null},{...candle,volume:-1}]) assert.throws(()=>readAlgoCandles([bad]),/invalid candle/);
  assert.throws(()=>readAlgoCandles([candle,{...candle,close:104}]),/Conflicting/);
});
test('missing option history does not silently become underlying or demo history', async t => {
  const original=globalThis.fetch,calls=[];
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async url=>{calls.push(String(url));return Response.json({ok:true,candles:[]});};
  await assert.rejects(fetchAlgoHistory(['NSE_FO|123456'],'1m','2026-10-16',new AbortController().signal),/No candles/);
  assert.equal(calls.length,1);
  const url=new URL(calls[0],'https://papertrade.test');
  assert.equal(url.searchParams.get('instrumentKey'),'NSE_FO|123456');
  assert.equal(url.searchParams.get('strict'),'1');
});
test('broker history excludes the forming candle and future prices', async t => {
  const original=globalThis.fetch, originalNow=Date.now;
  t.after(()=>{globalThis.fetch=original;Date.now=originalNow;});
  Date.now=()=>now;
  const closed={...candle,time:now/1000-300};
  const forming={...candle,time:now/1000-60};
  const future={...candle,time:now/1000+300};
  globalThis.fetch=async()=>Response.json({ok:true,candles:[closed,forming,future]});
  assert.deepEqual((await fetchAlgoHistory([key],'5m',undefined,new AbortController().signal))[key],[closed]);
});
