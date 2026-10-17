import test from 'node:test';
import assert from 'node:assert/strict';
import {latestSessionPrices,priceLineGeometry} from '../lib/desktop-price-history.ts';
test('desktop history keeps real chronological last-session closes, rejecting invalid prices',()=>{
 const t=Date.parse('2026-10-16T03:45:00Z')/1000;
 assert.deepEqual(latestSessionPrices([{time:t-86400,close:90},{time:t+300,close:102},{time:t,close:100},{time:t,close:101},{time:t+600,close:NaN}]),[{time:t,close:101},{time:t+300,close:102}]);
 assert.deepEqual(latestSessionPrices(null),[]);
});
test('line geometry retains real movement, reference, missing periods and flat prices',()=>{
 const p=[{time:100,close:102},{time:400,close:98},{time:2000,close:101}];
 const g=priceLineGeometry(p,100);assert.match(g.path,/^M.* L.* M/);assert.equal(g.up,true);assert.ok(g.baselineY>0&&g.baselineY<54);
 assert.ok(priceLineGeometry([{time:1,close:100},{time:2,close:100}],100).path.includes('L'));
 assert.equal(priceLineGeometry([{time:1,close:100}]),null);
});
test('desktop history deduplicates requests, bounds concurrency and caches verified data',async t=>{
 const {loadDesktopHistory}=await import('../lib/desktop-history-loader.ts');
 const requests=[];let active=0,max=0;
 t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{active++;max=Math.max(max,active);requests.push(()=>{active--;resolve(Response.json({ok:true,candles:[{time:1800000000,close:100},{time:1800000300,close:101}]}));});}));
 const a=loadDesktopHistory('test-a'),duplicate=loadDesktopHistory('test-a'),b=loadDesktopHistory('test-b'),c=loadDesktopHistory('test-c');
 assert.equal(a,duplicate);await new Promise(r=>setImmediate(r));assert.equal(requests.length,2);
 requests[0]();requests[1]();await new Promise(r=>setImmediate(r));assert.equal(requests.length,3);requests[2]();
 await Promise.all([a,b,c]);assert.equal(max,2);assert.equal((await loadDesktopHistory('test-a')).length,2);assert.equal(requests.length,3);
});
